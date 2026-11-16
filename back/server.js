const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { connectDatabase, isTransientDatabaseError } = require('./config/database');
const { createChatRouter } = require('./routes/chat');
const { createAccountsRouter } = require('./routes/accounts');
const { createOrdersRouter } = require('./routes/orders');
const { createProductsRouter } = require('./routes/products');
const { createRecordStore } = require('./data/record-store');
const { createResilientProductRepository } = require('./products/resilient-repository');

const configuredPort = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
if (!Number.isInteger(configuredPort) || configuredPort < 0 || configuredPort > 65535) {
    throw new Error('PORT debe ser un número entero entre 0 y 65535.');
}
const PORT = configuredPort;
const HOST = process.env.HOST || 'localhost';
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'front');
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCT_FILE = path.join(DATA_DIR, 'catalog.json');
const PRODUCT_SEED_FILE = path.join(DATA_DIR, 'products.json');
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';
const DATA_FILES = {
    orders: path.join(DATA_DIR, 'orders.json'),
    newsletter: path.join(DATA_DIR, 'newsletter.json'),
    loyalty: path.join(DATA_DIR, 'loyalty.json'),
    accounts: path.join(DATA_DIR, 'accounts.json'),
    contacts: path.join(DATA_DIR, 'contactos.json')
};
const SEARCHABLE_PRODUCT_FIELDS = new Set([
    'all', 'id', 'name', 'category', 'gender', 'line', 'price', 'originalPrice',
    'discount', 'collection', 'year', 'material', 'badge', 'isNew', 'sizes',
    'colors', 'shipping', 'care', 'img', 'desc', 'origin', 'rating', 'reviews'
]);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.avif': 'image/avif',
    '.webp': 'image/webp',
    // JFIF comparte el formato JPEG; así el navegador lo muestra como imagen.
    '.jfif': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

const LEGACY_ASSET_PATHS = new Map([
    ['/styles.css', '/assets/css/styles.css'],
    ['/app.js', '/assets/js/app.js'],
    ['/calculos.js', '/assets/js/calculos.js'],
    ['/services/index.js', '/assets/js/services/index.js']
]);

for (const [directory, assetDirectory] of [
    [path.join(FRONTEND_DIR, 'assets', 'images'), '/assets/images'],
    [path.join(FRONTEND_DIR, 'assets', 'icons'), '/assets/icons']
]) {
    for (const filename of fs.readdirSync(directory)) {
        LEGACY_ASSET_PATHS.set(`/${filename}`, `${assetDirectory}/${filename}`);
    }
}

function ensureDataFiles() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    Object.values(DATA_FILES).forEach(file => {
        if (!fs.existsSync(file)) fs.writeFileSync(file, '[]\n', 'utf8');
    });
}

function readData(name) {
    try {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILES[name], 'utf8'));
        if (!Array.isArray(parsed)) throw new Error('El archivo debe contener una lista JSON');
        return parsed;
    } catch (error) {
        const readError = new Error(`No fue posible leer los datos de ${name}.`);
        readError.code = 'DATABASE_READ_FAILED';
        readError.status = 500;
        readError.cause = error;
        throw readError;
    }
}

function writeData(name, data) {
    const file = DATA_FILES[name];
    const temporaryPath = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporaryPath, file);
    } catch (error) {
        try { fs.rmSync(temporaryPath, { force: true }); } catch {}
        const writeError = new Error(`No fue posible guardar los datos de ${name}.`);
        writeError.code = 'DATABASE_WRITE_FAILED';
        writeError.status = 500;
        writeError.cause = error;
        throw writeError;
    }
}

function sendJson(response, status, payload, extraHeaders = {}) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...extraHeaders
    });
    response.end(JSON.stringify(payload));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let bodySize = 0;
        let rejected = false;
        request.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > 1024 * 1024) {
                if (!rejected) {
                    rejected = true;
                    const error = new Error('El cuerpo de la solicitud supera el límite de 1 MB.');
                    error.code = 'PAYLOAD_TOO_LARGE';
                    error.status = 413;
                    reject(error);
                    request.resume();
                }
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (rejected) return;
            const body = Buffer.concat(chunks).toString('utf8');
            if (!body.trim()) {
                const error = new Error('El cuerpo JSON es obligatorio.');
                error.code = 'EMPTY_BODY';
                error.status = 400;
                reject(error);
                return;
            }
            try {
                const parsed = JSON.parse(body);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    const error = new Error('El cuerpo JSON debe ser un objeto.');
                    error.code = 'INVALID_JSON_BODY';
                    error.status = 400;
                    reject(error);
                    return;
                }
                resolve(parsed);
            } catch (cause) {
                const error = new Error('El cuerpo de la solicitud no contiene JSON válido.');
                error.code = 'INVALID_JSON';
                error.status = 400;
                error.cause = cause;
                reject(error);
            }
        });
        request.on('error', reject);
    });
}

function sendApiError(response, error, requestId) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const safeMessage = status >= 500
        ? (status === 503 ? error.message : 'Ocurrió un error interno. Intenta de nuevo o contacta al equipo de soporte.')
        : error.message;
    const payload = {
        error: {
            code: error.code || 'INTERNAL_ERROR',
            message: safeMessage,
            status,
            requestId
        },
        help: status === 400
            ? 'Revisa los campos marcados y el formato indicado en la respuesta.'
            : status === 401
                ? 'Verifica el token administrativo configurado en el servidor.'
                : status === 404
                    ? 'Comprueba el identificador y la ruta solicitada.'
                    : status === 405
                        ? 'Consulta los métodos aceptados para esta ruta.'
                        : status === 413
                            ? 'Reduce el tamaño del JSON y vuelve a intentarlo.'
                    : status === 503
                        ? 'Comprueba las variables de entorno y la disponibilidad de la base de datos.'
                        : undefined
    };
    if (error.details && status < 500) payload.error.details = error.details;
    const headers = error.allowedMethods ? { Allow: error.allowedMethods.join(', ') } : {};
    return sendJson(response, status, payload, headers);
}

function requireAdmin(request) {
    if (!ADMIN_API_TOKEN) {
        const error = new Error('Las operaciones de escritura están desactivadas. Configura ADMIN_API_TOKEN en el backend.');
        error.status = 503;
        error.code = 'ADMIN_WRITES_DISABLED';
        throw error;
    }
    const authorization = request.headers.authorization || '';
    const submitted = request.headers['x-admin-token'] ||
        (authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
    if (!submitted || /\s/.test(submitted)) {
        const error = new Error('Token administrativo ausente o incorrecto.');
        error.status = 401;
        error.code = 'ADMIN_AUTH_REQUIRED';
        throw error;
    }
    const expectedBuffer = Buffer.from(ADMIN_API_TOKEN);
    const submittedBuffer = Buffer.from(submitted);
    if (expectedBuffer.length !== submittedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, submittedBuffer)) {
        const error = new Error('Token administrativo ausente o incorrecto.');
        error.status = 401;
        error.code = 'ADMIN_AUTH_REQUIRED';
        throw error;
    }
}

function cleanText(value, maxLength = 500) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function switchToLocalPersistence(databaseStatus, error) {
    const shouldLog = databaseStatus.mode !== 'json';
    databaseStatus.mode = 'json';
    if (shouldLog) {
        console.warn(
            'MongoDB no está disponible; se continúa con persistencia JSON local.',
            error.code || error.name
        );
    }
    if (mongoose.connection.readyState !== 0) {
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error('No se pudo cerrar la conexión de Mongoose:', disconnectError.name);
        }
    }
}

function createId(prefix) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function handleProductsApi(request, response, url) {
    const { parseProductId, validateProduct } = require('./products/validate-product');
    const productRepository = request.productRepository;
    const segments = url.pathname.split('/').filter(Boolean);
    const id = segments.length === 3 ? parseProductId(segments[2]) : null;

    if (segments.length > 3) {
        const error = new Error('La ruta de producto no existe.');
        error.status = 404;
        error.code = 'ROUTE_NOT_FOUND';
        throw error;
    }

    if (request.method === 'GET' && id !== null) {
        const product = await productRepository.findById(id);
        if (!product) {
            const error = new Error(`No se encontró un producto con ID ${id}.`);
            error.status = 404;
            error.code = 'PRODUCT_NOT_FOUND';
            throw error;
        }
        return sendJson(response, 200, { product });
    }

    if (request.method === 'GET') {
        const field = (url.searchParams.get('field') || 'all').trim();
        if (!SEARCHABLE_PRODUCT_FIELDS.has(field)) {
            const error = new Error(`No se puede buscar por el campo "${field}".`);
            error.status = 400;
            error.code = 'INVALID_SEARCH_FIELD';
            error.details = { allowedFields: [...SEARCHABLE_PRODUCT_FIELDS] };
            throw error;
        }
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');
        if ((limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) ||
            (offset !== null && (!/^\d+$/.test(offset) || Number(offset) > 1000000))) {
            const error = new Error('La paginación requiere limit entre 1 y 100 y offset entre 0 y 1000000.');
            error.status = 400;
            error.code = 'INVALID_PAGINATION';
            throw error;
        }
        const result = await productRepository.list({
            field,
            value: url.searchParams.get('value') || '',
            q: url.searchParams.get('q') || '',
            limit: limit || 100,
            offset: offset || 0
        });
        return sendJson(response, 200, result);
    }

    const allowedMethods = id === null
        ? ['GET', 'POST']
        : ['GET', 'PUT', 'PATCH', 'DELETE'];
    if (!allowedMethods.includes(request.method)) {
        const error = new Error('Método no permitido para productos.');
        error.status = 405;
        error.code = 'METHOD_NOT_ALLOWED';
        error.details = { allowedMethods };
        error.allowedMethods = allowedMethods;
        throw error;
    }
    requireAdmin(request);

    if (request.method === 'POST' && id !== null) {
        const error = new Error('La creación se realiza en /api/products, sin ID en la ruta.');
        error.status = 405;
        error.code = 'METHOD_NOT_ALLOWED';
        throw error;
    }
    if (request.method !== 'POST' && id === null) {
        const error = new Error('Esta operación requiere un ID de producto en la ruta.');
        error.status = 400;
        error.code = 'PRODUCT_ID_REQUIRED';
        throw error;
    }

    if (request.method === 'DELETE') {
        const deleted = await productRepository.remove(id);
        if (!deleted) {
            const error = new Error(`No se encontró un producto con ID ${id}.`);
            error.status = 404;
            error.code = 'PRODUCT_NOT_FOUND';
            throw error;
        }
        return sendJson(response, 200, { ok: true, deleted });
    }

    const payload = await readJson(request);
    if (request.method === 'POST') {
        const product = await productRepository.create(validateProduct(payload));
        return sendJson(response, 201, { ok: true, product });
    }

    const current = await productRepository.findById(id);
    if (!current) {
        const error = new Error(`No se encontró un producto con ID ${id}.`);
        error.status = 404;
        error.code = 'PRODUCT_NOT_FOUND';
        throw error;
    }
    const changes = request.method === 'PUT'
        ? validateProduct({ ...payload, id: undefined }, { partial: false })
        : validateProduct(payload, { partial: true });
    const product = await productRepository.update(id, changes);
    if (!product) {
        const error = new Error(`No se pudo actualizar el producto con ID ${id}.`);
        error.status = 404;
        error.code = 'PRODUCT_NOT_FOUND';
        throw error;
    }
    return sendJson(response, 200, { ok: true, product });
}

async function handleApi(request, response, url, requestId, productRepository, recordStore, databaseStatus) {
    request.productRepository = productRepository;
    if (request.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(response, 200, {
            ok: true,
            service: 'anthros',
            timestamp: new Date().toISOString(),
            database: databaseStatus.mode
        });
    }

    if (url.pathname === '/api/products' || url.pathname.startsWith('/api/products/')) {
        return handleProductsApi(request, response, url);
    }
    if (url.pathname === '/api/admin/session') {
        if (request.method !== 'GET') {
            const error = new Error('Método no permitido.');
            error.status = 405;
            error.code = 'METHOD_NOT_ALLOWED';
            error.allowedMethods = ['GET'];
            throw error;
        }
        requireAdmin(request);
        return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === '/api/contact') {
        if (request.method === 'GET') {
            requireAdmin(request);
            const contacts = await request.contactStorage.list();
            return sendJson(response, 200, { contacts });
        }
        if (request.method !== 'POST') {
            const error = new Error('Método no permitido para contacto.');
            error.status = 405;
            error.code = 'METHOD_NOT_ALLOWED';
            error.allowedMethods = ['GET', 'POST'];
            throw error;
        }
        const payload = await readJson(request);
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
        const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
        const message = typeof payload.message === 'string' ? payload.message.trim() : '';
        const details = {};
        if (!name || name.length < 2) details.name = 'Ingresa un nombre de al menos 2 caracteres.';
        else if (name.length > 100) details.name = 'El nombre no puede superar 100 caracteres.';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) details.email = 'Ingresa un correo electrónico válido.';
        else if (email.length > 160) details.email = 'El correo no puede superar 160 caracteres.';
        if (!subject || subject.length < 3) details.subject = 'El asunto debe tener al menos 3 caracteres.';
        else if (subject.length > 120) details.subject = 'El asunto no puede superar 120 caracteres.';
        if (!message || message.length < 10) details.message = 'El mensaje debe tener al menos 10 caracteres.';
        else if (message.length > 2000) details.message = 'El mensaje no puede superar 2000 caracteres.';
        if (Object.keys(details).length) {
            const error = new Error('Revisa los datos del formulario de contacto.');
            error.status = 400;
            error.code = 'INVALID_CONTACT';
            error.details = details;
            throw error;
        }
        const contact = await request.contactStorage.create({
            id: createId('CON'),
            name,
            email,
            subject,
            message,
            createdAt: new Date().toISOString()
        });
        return sendJson(response, 201, { ok: true, contact: { id: contact.id, createdAt: contact.createdAt } });
    }

    if (!['/api/newsletter', '/api/loyalty'].includes(url.pathname)) {
        const error = new Error('La ruta API no existe.');
        error.status = 404;
        error.code = 'ROUTE_NOT_FOUND';
        throw error;
    }

    if (request.method !== 'POST') {
        return sendJson(response, 405, {
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.', status: 405, requestId },
            help: 'Consulta la documentación de la ruta para conocer los métodos compatibles.'
        }, { Allow: 'POST' });
    }

    const payload = await readJson(request);

        if (url.pathname === '/api/newsletter') {
            const email = cleanText(payload.email, 160).toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                const error = new Error('Ingresa un correo electrónico válido.');
                error.status = 400;
                error.code = 'INVALID_EMAIL';
                throw error;
            }
            const created = await recordStore.addUnique('newsletter_subscribers', 'newsletter', {
                email,
                createdAt: new Date().toISOString()
            });
            return sendJson(response, created ? 201 : 200, { ok: true, created, ...(created ? { requestId } : {}) });
        }

        if (url.pathname === '/api/loyalty') {
            const email = cleanText(payload.email, 160).toLowerCase();
            const tier = cleanText(payload.tier, 30) || 'esencial';
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                const error = new Error('Ingresa un correo electrónico válido.');
                error.status = 400;
                error.code = 'INVALID_EMAIL';
                throw error;
            }
            const member = { id: createId('MEM'), email, tier, points: 0, createdAt: new Date().toISOString() };
            const created = await recordStore.addUnique('loyalty_members', 'loyalty', member);
            return sendJson(response, created ? 201 : 200, {
                ok: true,
                created,
                ...(created ? { member, requestId } : {})
            });
        }

        const error = new Error('La ruta API no existe.');
        error.status = 404;
        error.code = 'ROUTE_NOT_FOUND';
        throw error;
}

function resolveStaticPath(urlPath) {
    let requestedPath = urlPath;
    if (requestedPath === '/frontend') requestedPath = '/';
    else if (requestedPath.startsWith('/frontend/')) requestedPath = requestedPath.slice('/frontend'.length);

    requestedPath = LEGACY_ASSET_PATHS.get(requestedPath) || requestedPath;
    if (requestedPath === '/') requestedPath = '/index.html';

    const filePath = path.resolve(FRONTEND_DIR, `.${requestedPath}`);
    const relativePath = path.relative(FRONTEND_DIR, filePath);
    if (!relativePath || relativePath.startsWith(`..${path.sep}`) || relativePath === '..' || path.isAbsolute(relativePath)) {
        return null;
    }
    return filePath;
}

function serveStatic(response, urlPath, method = 'GET') {
    let filePath;
    try {
        filePath = resolveStaticPath(urlPath);
    } catch (error) {
        return sendJson(response, 400, { error: 'Ruta no válida' });
    }
    if (!filePath) return sendJson(response, 403, { error: 'Acceso denegado' });

    fs.stat(filePath, (error, stats) => {
        if (error || !stats.isFile()) return sendJson(response, 404, { error: 'Archivo no encontrado' });
        const extension = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
            'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
            'Content-Length': stats.size,
            'Cache-Control': ['.html', '.js', '.css'].includes(extension)
                ? 'no-cache'
                : 'public, max-age=3600'
        });
        if (method === 'HEAD') return response.end();
        const stream = fs.createReadStream(filePath);
        stream.on('error', () => {
            if (!response.headersSent) sendJson(response, 500, { error: 'No fue posible leer el archivo solicitado' });
            else response.destroy();
        });
        stream.pipe(response);
    });
}

function createServer({
    productRepository,
    orderStorage,
    recordStorage,
    contactStorage,
    chatClientFactory,
    chatTimeoutMs,
    databaseStatus = { mode: mongoose.connection.readyState === 1 ? 'mongodb' : 'json' }
} = {}) {
    const repository = productRepository || require('./products/repository').createProductRepository({
        filePath: PRODUCT_FILE,
        seedPath: PRODUCT_SEED_FILE,
        mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || '',
        mongoDatabase: process.env.MONGODB_DB || 'anthros',
        mongoCollection: process.env.MONGODB_COLLECTION || 'products'
    });

    const app = express();
    const onDatabaseFallback = error => switchToLocalPersistence(databaseStatus, error);
    const recordStore = recordStorage || createRecordStore({
        readLocal: readData,
        writeLocal: writeData,
        onDatabaseFallback
    });
    const contacts = contactStorage || {
        create: record => recordStore.create('contact_messages', 'contacts', record),
        list: () => recordStore.list('contact_messages', 'contacts')
    };
    app.disable('x-powered-by');
    const allowedOrigins = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    app.use(cors({
        origin(origin, callback) {
            if (!origin) return callback(null, true);
            let hostname = '';
            try {
                hostname = new URL(origin).hostname;
            } catch {
                return callback(null, false);
            }
            const localDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';
            const netlifyDeployment = hostname.endsWith('.netlify.app');
            callback(null, localDevelopment || netlifyDeployment || allowedOrigins.includes(origin));
        },
        allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    }));
    app.use((request, response, next) => {
        request.requestId = crypto.randomUUID();
        request.productRepository = repository;
        response.setHeader('X-Request-Id', request.requestId);
        next();
    });

    app.use('/api/chat', express.json({ limit: '12kb' }), createChatRouter({
        clientFactory: chatClientFactory,
        timeoutMs: chatTimeoutMs
    }));
    app.use('/api/accounts', express.json({ limit: '12kb' }), createAccountsRouter(recordStore));
    app.use('/api/products', createProductsRouter(handleProductsApi));
    app.use('/api/orders', express.json({ limit: '1mb' }), createOrdersRouter({
        productRepository: repository,
        onDatabaseFallback,
        getLocalOrders: () => orderStorage ? orderStorage.list() : readData('orders'),
        saveLocalOrder: order => orderStorage
            ? orderStorage.create(order)
            : writeData('orders', [order, ...readData('orders')])
    }));

    app.use('/api', (request, response, next) => {
        request.contactStorage = contacts;
        let url;
        try {
            url = new URL(request.originalUrl, `http://${request.headers.host || `${HOST}:${PORT}`}`);
        } catch {
            return next(Object.assign(new Error('La URL de la solicitud no es válida.'), {
                status: 400,
                code: 'INVALID_URL'
            }));
        }

        handleApi(request, response, url, request.requestId, repository, recordStore, databaseStatus).catch(error => {
            if (error.status >= 500) console.error(`[${request.requestId}] ${error.code || 'INTERNAL_ERROR'}: ${error.message}`);
            if (!response.headersSent) sendApiError(response, error, request.requestId);
            else response.destroy();
        });
    });

    app.use((request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return sendJson(response, 405, {
                error: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido.', status: 405, requestId: request.requestId }
            }, { Allow: 'GET, HEAD' });
        }
        let url;
        try {
            url = new URL(request.originalUrl, `http://${request.headers.host || `${HOST}:${PORT}`}`);
        } catch {
            return sendJson(response, 400, { error: 'Ruta no válida', requestId: request.requestId });
        }
        let decodedPath;
        try {
            decodedPath = decodeURIComponent(url.pathname);
        } catch {
            return sendJson(response, 400, { error: 'Ruta no válida', requestId: request.requestId });
        }
        serveStatic(response, decodedPath, request.method);
    });

    app.use((error, request, response, next) => {
        if (response.headersSent) return next(error);
        if (error.status >= 500) console.error(`[${request.requestId}] ${error.code || 'INTERNAL_ERROR'}: ${error.message}`);
        sendApiError(response, error, request.requestId);
    });

    return http.createServer(app);
}

async function startServer({
    port = PORT,
    host = HOST,
    mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || '',
    databaseConnector = connectDatabase,
    productRepositoryFactory = options => require('./products/repository').createProductRepository(options)
} = {}) {
    ensureDataFiles();
    if (ADMIN_API_TOKEN && ADMIN_API_TOKEN.length < 32) {
        throw new Error('ADMIN_API_TOKEN debe tener al menos 32 caracteres.');
    }

    const repositoryOptions = uri => ({
        filePath: PRODUCT_FILE,
        seedPath: PRODUCT_SEED_FILE,
        mongoUri: uri,
        mongoDatabase: process.env.MONGODB_DB || 'anthros',
        mongoCollection: process.env.MONGODB_COLLECTION || 'products'
    });
    const databaseStatus = { mode: 'json' };
    const fallbackRepository = productRepositoryFactory(repositoryOptions(''));
    await fallbackRepository.initialize();
    let productRepository = fallbackRepository;

    if (mongoUri) {
        let mongoRepository;
        try {
            const connected = await databaseConnector(mongoUri);
            if (connected) {
                mongoRepository = productRepositoryFactory(repositoryOptions(mongoUri));
                await mongoRepository.initialize();
                databaseStatus.mode = 'mongodb';
                productRepository = createResilientProductRepository({
                    primary: mongoRepository,
                    fallback: fallbackRepository,
                    onFallback: async (error, closeError) => {
                        if (closeError) {
                            console.error('No se pudo cerrar el repositorio de MongoDB:', closeError.name);
                        }
                        await switchToLocalPersistence(databaseStatus, error);
                    }
                });
            }
        } catch (error) {
            if (!isTransientDatabaseError(error)) {
                await fallbackRepository.close();
                throw error;
            }
            if (mongoRepository) {
                try {
                    await mongoRepository.close();
                } catch (closeError) {
                    console.error('No se pudo cerrar el repositorio de MongoDB:', closeError.name);
                }
            }
            databaseStatus.mode = 'json';
            console.warn(
                'MongoDB no está disponible; se inicia con persistencia JSON local.',
                error.code || error.name
            );
            try {
                await mongoose.disconnect();
            } catch (disconnectError) {
                console.error('No se pudo cerrar la conexión de Mongoose:', disconnectError.name);
            }
        }
    }

    const server = createServer({ productRepository, databaseStatus });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.removeListener('error', reject);
            console.log(`Anthros disponible en http://${host}:${port}`);
            resolve({ productRepository, server, databaseStatus });
        });
    });
}

if (require.main === module) {
    startServer().catch(error => {
        console.error('No fue posible iniciar Anthros:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { createServer, sendApiError, startServer };
