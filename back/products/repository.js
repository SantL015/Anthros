'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const NUMERIC_SEARCH_FIELDS = new Set(['id', 'price', 'originalPrice', 'discount', 'year', 'rating', 'reviews']);

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRepositoryError(message, code, status = 500, cause) {
    const error = new Error(message, { cause });
    error.code = code;
    error.status = status;
    return error;
}

function createProductRepository({ filePath, seedPath, mongoUri = '', mongoDatabase = 'anthros', mongoCollection = 'products' }) {
    let mongoClientPromise;
    let mongoCollectionHandle;
    let mongoCounterHandle;
    let jsonMutation = Promise.resolve();
    let initialized = false;

    async function loadMongoCollection() {
        if (!mongoUri) return null;
        if (!mongoClientPromise) {
            mongoClientPromise = (async () => {
                const { MongoClient } = require('mongodb');
                const client = new MongoClient(mongoUri, {
                    serverSelectionTimeoutMS: 8000,
                    maxPoolSize: 10,
                    appName: 'anthros-store'
                });
                await client.connect();
                const database = client.db(mongoDatabase);
                mongoCollectionHandle = database.collection(mongoCollection);
                mongoCounterHandle = database.collection(`${mongoCollection}_counters`);
                await mongoCollectionHandle.createIndex({ id: 1 }, { unique: true, name: 'product_id_unique' });
                await mongoCollectionHandle.createIndex({ category: 1, collection: 1 }, { name: 'product_catalog_filters' });
                return { client, collection: mongoCollectionHandle };
            })().catch(error => {
                mongoClientPromise = null;
                throw createRepositoryError(
                    'No fue posible conectar con MongoDB. Verifica MONGODB_URI, el acceso de red de Atlas y las credenciales.',
                    'DATABASE_UNAVAILABLE',
                    503,
                    error
                );
            });
        }
        return mongoClientPromise;
    }

    async function withFileMutation(operation) {
        const result = jsonMutation.then(operation);
        jsonMutation = result.then(() => undefined, () => undefined);
        return result;
    }

    async function readFileProducts() {
        try {
            const text = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw createRepositoryError('El archivo del catálogo debe contener una lista JSON', 'DATABASE_INVALID');
            return parsed;
        } catch (error) {
            if (error instanceof SyntaxError || error.code === 'DATABASE_INVALID') {
                throw createRepositoryError('No fue posible leer el catálogo local. Revisa back/data/products.json.', 'DATABASE_INVALID', 500, error);
            }
            if (error.code === 'DATABASE_UNAVAILABLE') throw error;
            throw createRepositoryError('No fue posible acceder al catálogo local.', 'DATABASE_READ_FAILED', 500, error);
        }
    }

    async function writeFileProducts(products) {
        const directory = path.dirname(filePath);
        const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(temporaryPath, `${JSON.stringify(products, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
            await fs.rename(temporaryPath, filePath);
        } catch (error) {
            await fs.rm(temporaryPath, { force: true }).catch(() => {});
            throw createRepositoryError('No fue posible guardar el catálogo local.', 'DATABASE_WRITE_FAILED', 500, error);
        }
    }

    async function initialize() {
        if (initialized) return;
        if (mongoUri) {
            const { collection } = await loadMongoCollection();
            if (await collection.estimatedDocumentCount() === 0) {
                let seed = [];
                try {
                    seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
                } catch (error) {
                    if (error.code !== 'ENOENT') throw createRepositoryError('No se pudo leer el catálogo inicial.', 'DATABASE_SEED_READ_FAILED', 500, error);
                }
                if (!Array.isArray(seed)) throw createRepositoryError('El catálogo inicial debe ser una lista JSON.', 'DATABASE_INVALID');
                if (seed.length) await collection.insertMany(seed.map(item => ({ ...item })), { ordered: true });
            }
            const highest = await collection.find({}).sort({ id: -1 }).limit(1).project({ id: 1 }).next();
            await mongoCounterHandle.updateOne(
                { _id: 'productId' },
                { $max: { value: Number(highest?.id) || 0 } },
                { upsert: true }
            );
        } else {
            await withFileMutation(async () => {
                try {
                    await fs.access(filePath);
                } catch (error) {
                    if (error.code !== 'ENOENT') throw error;
                    let seed;
                    try {
                        seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
                    } catch (seedError) {
                        throw createRepositoryError('No se pudo leer el catálogo inicial.', 'DATABASE_SEED_READ_FAILED', 500, seedError);
                    }
                    if (!Array.isArray(seed)) throw createRepositoryError('El catálogo inicial debe ser una lista JSON.', 'DATABASE_INVALID');
                    await writeFileProducts(seed);
                }
            });
        }
        initialized = true;
    }

    async function list({ field, value, q, limit = 100, offset = 0 } = {}) {
        await initialize();
        const filterText = String(value ?? q ?? '').trim().slice(0, 120);
        if (mongoUri) {
            const { collection } = await loadMongoCollection();
            const filter = {};
            if (filterText && field && field !== 'all') {
                if (NUMERIC_SEARCH_FIELDS.has(field)) {
                    const numeric = Number(filterText);
                    if (!Number.isFinite(numeric) || (field === 'year' && !Number.isInteger(numeric))) {
                        throw createRepositoryError(`El filtro ${field} requiere un valor numérico válido.`, 'INVALID_SEARCH_VALUE', 400);
                    }
                    filter[field] = numeric;
                } else if (field === 'isNew') {
                    if (!['true', 'false'].includes(filterText.toLowerCase())) {
                        throw createRepositoryError('El filtro isNew requiere el valor true o false.', 'INVALID_SEARCH_VALUE', 400);
                    }
                    filter.isNew = filterText.toLowerCase() === 'true';
                } else {
                    const exactFields = new Set(['gender', 'collection', 'category', 'line']);
                    filter[field] = exactFields.has(field)
                        ? { $regex: escapeRegExp(filterText), $options: 'i' }
                        : { $regex: escapeRegExp(filterText), $options: 'i' };
                }
            } else if (filterText) {
                filter.$or = ['name', 'category', 'gender', 'line', 'collection', 'material', 'desc']
                    .map(key => ({ [key]: { $regex: escapeRegExp(filterText), $options: 'i' } }));
            }
            const safeLimit = Math.max(1, Math.min(100, Number(limit) || 100));
            const safeOffset = Math.max(0, Number(offset) || 0);
            const [products, total] = await Promise.all([
                collection.find(filter, { projection: { _id: 0 } }).sort({ id: 1 }).skip(safeOffset).limit(safeLimit).toArray(),
                collection.countDocuments(filter)
            ]);
            return { products, total, limit: safeLimit, offset: safeOffset };
        }

        const allProducts = await readFileProducts();
        const filtered = filterText
            ? allProducts.filter(product => {
                if (field && field !== 'all') {
                    if (!Object.prototype.hasOwnProperty.call(product, field)) {
                        throw createRepositoryError('El campo indicado no se puede buscar.', 'INVALID_SEARCH_FIELD', 400, { field });
                    }
                    const actual = product[field];
                    if (NUMERIC_SEARCH_FIELDS.has(field)) {
                        const numeric = Number(filterText);
                        if (!Number.isFinite(numeric) || (field === 'year' && !Number.isInteger(numeric))) {
                            throw createRepositoryError(`El filtro ${field} requiere un valor numérico válido.`, 'INVALID_SEARCH_VALUE', 400);
                        }
                        return actual !== null && actual !== undefined && Number(actual) === numeric;
                    }
                    if (field === 'isNew') {
                        if (!['true', 'false'].includes(filterText.toLowerCase())) {
                            throw createRepositoryError('El filtro isNew requiere el valor true o false.', 'INVALID_SEARCH_VALUE', 400);
                        }
                        return Boolean(actual) === (filterText.toLowerCase() === 'true');
                    }
                    return String(actual ?? '').toLocaleLowerCase('es').includes(filterText.toLocaleLowerCase('es'));
                }
                return ['name', 'category', 'gender', 'line', 'collection', 'material', 'desc']
                    .some(key => String(product[key] ?? '').toLocaleLowerCase('es').includes(filterText.toLocaleLowerCase('es')));
            })
            : allProducts;
        const safeLimit = Math.max(1, Math.min(100, Number(limit) || 100));
        const safeOffset = Math.max(0, Number(offset) || 0);
        return {
            products: filtered.slice(safeOffset, safeOffset + safeLimit),
            total: filtered.length,
            limit: safeLimit,
            offset: safeOffset
        };
    }

    async function findById(id) {
        await initialize();
        if (mongoUri) {
            const { collection } = await loadMongoCollection();
            return collection.findOne({ id }, { projection: { _id: 0 } });
        }
        return (await readFileProducts()).find(product => Number(product.id) === id) || null;
    }

    async function nextId() {
        if (mongoUri) {
            await loadMongoCollection();
            const result = await mongoCounterHandle.findOneAndUpdate(
                { _id: 'productId' },
                { $inc: { value: 1 } },
                { upsert: true, returnDocument: 'after' }
            );
            const counter = result?.value && typeof result.value === 'object' ? result.value : result;
            return Number(counter?.value) || 1;
        }
        const result = await list({ limit: 100, offset: 0 });
        if (result.total <= 100) return result.products.reduce((largest, product) => Math.max(largest, Number(product.id) || 0), 0) + 1;
        const products = await readFileProducts();
        return products.reduce((largest, product) => Math.max(largest, Number(product.id) || 0), 0) + 1;
    }

    async function create(product) {
        await initialize();
        const saved = { ...product, id: await nextId() };
        if (mongoUri) {
            const { collection } = await loadMongoCollection();
            await collection.insertOne(saved);
            return saved;
        }
        return withFileMutation(async () => {
            const products = await readFileProducts();
            saved.id = products.reduce((largest, item) => Math.max(largest, Number(item.id) || 0), 0) + 1;
            products.push(saved);
            await writeFileProducts(products);
            return saved;
        });
    }

    async function update(id, changes) {
        await initialize();
        if (mongoUri) {
            const { collection } = await loadMongoCollection();
            const result = await collection.findOneAndUpdate(
                { id },
                { $set: changes },
                { returnDocument: 'after', projection: { _id: 0 } }
            );
            return result && (result.value || result);
        }
        return withFileMutation(async () => {
            const products = await readFileProducts();
            const index = products.findIndex(product => Number(product.id) === id);
            if (index === -1) return null;
            products[index] = { ...products[index], ...changes, id };
            await writeFileProducts(products);
            return products[index];
        });
    }

    async function remove(id) {
        await initialize();
        if (mongoUri) {
            const { collection } = await loadMongoCollection();
            const result = await collection.findOneAndDelete({ id }, { projection: { _id: 0 } });
            return result && (result.value || result);
        }
        return withFileMutation(async () => {
            const products = await readFileProducts();
            const index = products.findIndex(product => Number(product.id) === id);
            if (index === -1) return null;
            const [removed] = products.splice(index, 1);
            await writeFileProducts(products);
            return removed;
        });
    }

    async function close() {
        if (mongoClientPromise) {
            try {
                const client = (await mongoClientPromise).client;
                await client.close();
            } finally {
                mongoClientPromise = null;
                mongoCollectionHandle = null;
                mongoCounterHandle = null;
            }
        }
    }

    return Object.freeze({ close, create, findById, initialize, list, remove, update });
}

module.exports = { createProductRepository };
