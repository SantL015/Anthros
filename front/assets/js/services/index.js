(function initializeAnthrosServices(global) {
    'use strict';

    const DEFAULT_API_BASE = '/api';
    const DEFAULT_TIMEOUT = 12000;
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_PATTERN = /^[+\d][\d\s()-]{6,}$/;

    class ApiError extends Error {
        constructor(message, options = {}) {
            super(message);
            this.name = 'ApiError';
            this.status = options.status || 0;
            this.code = options.code || 'API_ERROR';
            this.details = options.details;
            this.requestId = options.requestId || '';
        }
    }

    const validation = Object.freeze({
        email(value) {
            return EMAIL_PATTERN.test(String(value ?? '').trim());
        },
        phone(value) {
            return PHONE_PATTERN.test(String(value ?? '').trim());
        },
        required(value, minLength = 1, maxLength = Infinity) {
            const normalized = String(value ?? '').trim();
            return normalized.length >= minLength && normalized.length <= maxLength;
        },
        numberRange(value, min, max) {
            const number = Number(value);
            return Number.isFinite(number) && number >= min && number <= max;
        },
        escapeHTML(value) {
            return String(value ?? '').replace(/[&<>'"]/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            })[character]);
        },
        normalizeEmail(value) {
            return String(value ?? '').trim().toLowerCase();
        }
    });

    const documentService = Object.freeze({
        ready(callback) {
            if (typeof callback !== 'function') throw new TypeError('ready espera una función');
            if (global.document.readyState === 'loading') {
                global.document.addEventListener('DOMContentLoaded', callback, { once: true });
            } else {
                callback();
            }
        },
        byId(id, root = global.document) {
            return root.getElementById(String(id));
        },
        query(selector, root = global.document) {
            return root.querySelector(selector);
        },
        queryAll(selector, root = global.document) {
            return Array.from(root.querySelectorAll(selector));
        },
        create(tagName, attributes = {}, children = []) {
            const element = global.document.createElement(tagName);
            Object.entries(attributes).forEach(([name, value]) => {
                if (name === 'text') element.textContent = String(value);
                else if (name === 'className') element.className = String(value);
                else if (name.startsWith('data-')) element.setAttribute(name, String(value));
                else if (name in element) element[name] = value;
                else element.setAttribute(name, String(value));
            });
            const nodes = Array.isArray(children) ? children : [children];
            nodes.filter(Boolean).forEach(child => {
                element.append(child instanceof global.Node ? child : global.document.createTextNode(String(child)));
            });
            return element;
        },
        setText(target, value) {
            const element = typeof target === 'string' ? this.byId(target) : target;
            if (!element) return false;
            element.textContent = String(value ?? '');
            return true;
        },
        setVisible(target, visible) {
            const element = typeof target === 'string' ? this.byId(target) : target;
            if (!element) return false;
            element.hidden = !Boolean(visible);
            return true;
        },
        scrollTo(target, options = {}) {
            const element = typeof target === 'string' ? this.byId(target) : target;
            if (!element) return false;
            element.scrollIntoView({ behavior: 'smooth', block: 'start', ...options });
            return true;
        },
        delegate(root, eventName, selector, handler, options) {
            if (!root || typeof handler !== 'function') throw new TypeError('Se requiere un nodo y un manejador');
            const listener = event => {
                const target = event.target instanceof global.Element ? event.target : event.target?.parentElement;
                const match = target?.closest(selector);
                if (match && root.contains(match)) handler.call(match, event, match);
            };
            root.addEventListener(eventName, listener, options);
            return () => root.removeEventListener(eventName, listener, options);
        },
        async copyText(value) {
            if (global.navigator.clipboard?.writeText) {
                await global.navigator.clipboard.writeText(String(value));
                return;
            }
            const input = this.create('textarea', { value: String(value) });
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.opacity = '0';
            global.document.body.append(input);
            input.select();
            const copied = global.document.execCommand('copy');
            input.remove();
            if (!copied) throw new Error('El navegador no permitió copiar al portapapeles');
        },
        downloadJSON(filename, data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = this.create('a', { href: url, download: filename });
            try {
                global.document.body.append(link);
                link.click();
            } finally {
                link.remove();
                global.setTimeout(() => URL.revokeObjectURL(url), 0);
            }
        }
    });

    const storage = Object.freeze({
        isAvailable() {
            try {
                const key = '__anthros_storage_probe__';
                global.localStorage.setItem(key, '1');
                global.localStorage.removeItem(key);
                return true;
            } catch {
                return false;
            }
        },
        get(key) {
            try {
                const value = global.localStorage.getItem(String(key));
                return { ok: true, exists: value !== null, value };
            } catch (error) {
                return { ok: false, exists: false, value: null, error };
            }
        },
        set(key, value) {
            try {
                global.localStorage.setItem(String(key), String(value));
                return { ok: true };
            } catch (error) {
                return { ok: false, error };
            }
        },
        remove(key) {
            try {
                global.localStorage.removeItem(String(key));
                return { ok: true };
            } catch (error) {
                return { ok: false, error };
            }
        },
        getJSON(key) {
            const stored = this.get(key);
            if (!stored.ok || !stored.exists) return stored;
            try {
                return { ok: true, exists: true, value: JSON.parse(stored.value) };
            } catch (error) {
                return { ok: false, exists: true, value: null, error };
            }
        },
        setJSON(key, value) {
            try {
                return this.set(key, JSON.stringify(value));
            } catch (error) {
                return { ok: false, error };
            }
        },
        clear(keys) {
            if (!Array.isArray(keys)) throw new TypeError('clear espera una lista de claves');
            const results = keys.map(key => this.remove(key));
            const failure = results.find(result => !result.ok);
            return failure ? { ok: false, error: failure.error } : { ok: true };
        }
    });

    const database = Object.freeze({
        readCollection(key) {
            const result = storage.getJSON(key);
            if (!result.ok) return result;
            if (!result.exists) return { ok: true, exists: false, value: [] };
            if (!Array.isArray(result.value)) {
                return { ok: false, exists: true, value: null, error: new TypeError(`La colección "${key}" no contiene una lista`) };
            }
            return result;
        },
        writeCollection(key, records) {
            if (!Array.isArray(records)) throw new TypeError('writeCollection espera una lista');
            return storage.setJSON(key, records);
        },
        updateCollection(key, updater) {
            if (typeof updater !== 'function') throw new TypeError('updateCollection espera una función');
            const current = this.readCollection(key);
            if (!current.ok) return current;
            let next;
            try {
                next = updater(current.value.slice());
            } catch (error) {
                return { ok: false, error };
            }
            if (!Array.isArray(next)) {
                return { ok: false, error: new TypeError('El actualizador debe devolver una lista') };
            }
            const saved = this.writeCollection(key, next);
            return saved.ok ? { ok: true, exists: true, value: next } : saved;
        },
        removeCollection(key) {
            return storage.remove(key);
        }
    });

    const api = Object.freeze({
        ApiError,
        async request(endpoint, options = {}) {
            if (typeof endpoint !== 'string' || !endpoint.trim()) {
                throw new TypeError('La ruta de API debe ser un texto no vacío');
            }
            const path = endpoint.trim();
            if (!path.startsWith('/') || path.startsWith('//')) {
                throw new TypeError('La ruta de API debe ser relativa al servidor');
            }

            const {
                baseUrl = DEFAULT_API_BASE,
                timeout = DEFAULT_TIMEOUT,
                headers = {},
                signal: externalSignal,
                ...requestOptions
            } = options;
            if (!Number.isFinite(Number(timeout)) || Number(timeout) <= 0) {
                throw new RangeError('El tiempo de espera de la API debe ser mayor que cero');
            }
            const controller = new AbortController();
            const onExternalAbort = () => controller.abort(externalSignal.reason);
            if (externalSignal?.aborted) onExternalAbort();
            else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

            const timer = global.setTimeout(() => controller.abort(new Error('API request timed out')), timeout);
            try {
                const response = await global.fetch(`${baseUrl}${path}`, {
                    ...requestOptions,
                    headers: {
                        ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
                        Accept: 'application/json',
                        ...headers
                    },
                    signal: controller.signal
                });
                const text = await response.text();
                let payload = null;
                if (text) {
                    try {
                        payload = JSON.parse(text);
                    } catch (error) {
                        throw new ApiError('El servidor devolvió una respuesta inválida', {
                            status: response.status,
                            code: 'INVALID_RESPONSE',
                            details: error
                        });
                    }
                }
                if (!response.ok) {
                    const apiError = payload?.error;
                    const error = new ApiError(
                        typeof apiError === 'string' ? apiError : apiError?.message || `Error HTTP ${response.status}`,
                        {
                        status: response.status,
                        code: apiError?.code || 'HTTP_ERROR',
                        details: apiError?.details || payload,
                        requestId: apiError?.requestId
                        }
                    );
                    error.help = payload?.help;
                    throw error;
                }
                return payload;
            } catch (error) {
                if (error instanceof ApiError) throw error;
                if (controller.signal.aborted) {
                    const timedOut = !externalSignal?.aborted;
                    throw new ApiError(timedOut ? 'La solicitud al servidor excedió el tiempo de espera' : 'La solicitud fue cancelada', {
                        code: timedOut ? 'TIMEOUT' : 'ABORTED',
                        details: error
                    });
                }
                throw new ApiError(error.message || 'No fue posible conectar con el servidor', {
                    code: 'NETWORK_ERROR',
                    details: error
                });
            } finally {
                global.clearTimeout(timer);
                externalSignal?.removeEventListener('abort', onExternalAbort);
            }
        },
        get(endpoint, options = {}) {
            return this.request(endpoint, { ...options, method: 'GET' });
        },
        post(endpoint, data, options = {}) {
            return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(data) });
        },
        put(endpoint, data, options = {}) {
            return this.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(data) });
        },
        patch(endpoint, data, options = {}) {
            return this.request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(data) });
        },
        delete(endpoint, options = {}) {
            return this.request(endpoint, { ...options, method: 'DELETE' });
        },
        health(options) {
            return this.get('/health', options);
        },
        orders(options) {
            return this.get('/orders', options);
        },
        createOrder(data, options) {
            return this.post('/orders', data, options);
        },
        subscribeNewsletter(data, options) {
            return this.post('/newsletter', data, options);
        },
        joinLoyalty(data, options) {
            return this.post('/loyalty', data, options);
        },
        chat(messageOrPayload, options) {
            const payload = typeof messageOrPayload === 'string'
                ? { message: messageOrPayload }
                : messageOrPayload;
            return this.post('/chat', payload, options);
        },
        products(params = {}, options = {}) {
            const query = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
            });
            return this.get(`/products${query.size ? `?${query}` : ''}`, options);
        },
        product(id, options) {
            return this.get(`/products/${encodeURIComponent(id)}`, options);
        },
        createProduct(data, token, options = {}) {
            return this.post('/products', data, {
                ...options,
                headers: { ...options.headers, Authorization: `Bearer ${token}` }
            });
        },
        updateProduct(id, data, token, options = {}) {
            return this.put(`/products/${encodeURIComponent(id)}`, data, {
                ...options,
                headers: { ...options.headers, Authorization: `Bearer ${token}` }
            });
        },
        patchProduct(id, data, token, options = {}) {
            return this.patch(`/products/${encodeURIComponent(id)}`, data, {
                ...options,
                headers: { ...options.headers, Authorization: `Bearer ${token}` }
            });
        },
        deleteProduct(id, token, options = {}) {
            return this.delete(`/products/${encodeURIComponent(id)}`, {
                ...options,
                headers: { ...options.headers, Authorization: `Bearer ${token}` }
            });
        }
    });

    // Reúne conectores externos opcionales para moneda y enlaces de compra por WhatsApp.
    const integrations = Object.freeze({
        async copToUsd(amount, options = {}) {
            const cop = Number(amount);
            if (!Number.isFinite(cop) || cop < 0) throw new TypeError('El monto COP debe ser un número no negativo');
            const fetcher = options.fetch || global.fetch.bind(global);
            const response = await fetcher('https://open.er-api.com/v6/latest/COP', {
                signal: options.signal
            });
            if (!response.ok) throw new Error(`El servicio de cambio respondió HTTP ${response.status}`);
            const payload = await response.json();
            const rate = Number(payload?.rates?.USD);
            if (!Number.isFinite(rate) || rate <= 0) throw new Error('El servicio no devolvió una tasa COP/USD válida');
            return { amount: cop * rate, rate, updatedAt: payload.time_last_update_utc || null };
        },
        whatsappOrderLink({ phone, items, total, customer = {} }) {
            const number = String(phone ?? '').replace(/\D/g, '');
            if (!number || !Array.isArray(items) || !items.length || !Number.isFinite(Number(total))) {
                throw new TypeError('Se requiere teléfono, productos y total para crear el enlace de WhatsApp');
            }
            const summary = items.map(item =>
                `- ${String(item.name || 'Prenda')} (Talla ${String(item.size || 'única')}, x${Number(item.qty) || 1})`
            );
            const shipping = [
                customer.name && `Nombre: ${String(customer.name).slice(0, 100)}`,
                customer.phone && `Teléfono: ${String(customer.phone).slice(0, 20)}`,
                customer.city && `Ciudad: ${String(customer.city).slice(0, 80)}`,
                customer.address && `Dirección: ${String(customer.address).slice(0, 180)}`
            ].filter(Boolean);
            const text = [
                'Hola ANTHROS, quiero confirmar este pedido:',
                ...summary,
                `Total confirmado: $${Math.round(Number(total)).toLocaleString('es-CO')} COP`,
                ...shipping
            ].join('\n');
            return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
        }
    });

    const navigation = Object.freeze({
        resolve(routes, key, fallback = 'index.html') {
            return Object.prototype.hasOwnProperty.call(routes, key) ? routes[key] : fallback;
        },
        navigate(destination, options = {}) {
            if (typeof destination !== 'string' || !destination.trim()) {
                throw new TypeError('El destino de navegación debe ser un texto no vacío');
            }
            const url = new URL(destination, global.location.href);
            if (url.origin !== global.location.origin) {
                throw new TypeError('La navegación interna no acepta destinos externos');
            }
            options.beforeNavigate?.();
            if (url.pathname === global.location.pathname && url.search === global.location.search && url.hash) {
                const anchor = documentService.byId(decodeURIComponent(url.hash.slice(1)));
                if (anchor) {
                    documentService.scrollTo(anchor, options.scrollOptions);
                    return { navigated: false, scrolled: true };
                }
            }
            if (options.replace) global.location.replace(url.href);
            else global.location.assign(url.href);
            return { navigated: true, scrolled: false };
        },
        goToAnchor(id, options = {}) {
            const anchor = documentService.byId(id);
            if (!anchor) return false;
            documentService.scrollTo(anchor, options);
            return true;
        },
        back(fallback = 'index.html') {
            if (global.history.length > 1) global.history.back();
            else this.navigate(fallback, { replace: true });
        },
        currentQuery() {
            return new URLSearchParams(global.location.search);
        }
    });

    const process = Object.freeze({
        sleep(milliseconds, signal) {
            const delay = Number(milliseconds);
            if (!Number.isFinite(delay) || delay < 0) throw new RangeError('El tiempo debe ser un número no negativo');
            return new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(signal.reason || new DOMException('Operación cancelada', 'AbortError'));
                    return;
                }
                const timer = global.setTimeout(done, delay);
                function done() {
                    signal?.removeEventListener('abort', cancel);
                    resolve();
                }
                function cancel() {
                    global.clearTimeout(timer);
                    signal.removeEventListener('abort', cancel);
                    reject(signal.reason || new DOMException('Operación cancelada', 'AbortError'));
                }
                signal?.addEventListener('abort', cancel, { once: true });
            });
        },
        debounce(callback, wait = 250) {
            if (typeof callback !== 'function') throw new TypeError('debounce espera una función');
            let timer;
            const debounced = function (...args) {
                global.clearTimeout(timer);
                timer = global.setTimeout(() => callback.apply(this, args), wait);
            };
            debounced.cancel = () => global.clearTimeout(timer);
            debounced.flush = (...args) => {
                global.clearTimeout(timer);
                return callback(...args);
            };
            return debounced;
        },
        throttle(callback, interval = 250) {
            if (typeof callback !== 'function') throw new TypeError('throttle espera una función');
            let lastRun = 0;
            return function (...args) {
                const now = Date.now();
                if (now - lastRun < interval) return false;
                lastRun = now;
                callback.apply(this, args);
                return true;
            };
        },
        async withButton(button, task, busyLabel = 'Procesando...') {
            if (!button || typeof task !== 'function') throw new TypeError('Se requiere un botón y una tarea');
            const originalContent = button.innerHTML;
            const wasDisabled = button.disabled;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.textContent = busyLabel;
            try {
                return await task();
            } finally {
                button.disabled = wasDisabled;
                button.removeAttribute('aria-busy');
                button.innerHTML = originalContent;
            }
        }
    });

    const format = Object.freeze({
        currency(value, currency = 'COP', locale = 'es-CO') {
            const amount = Number(value);
            if (!Number.isFinite(amount)) throw new TypeError('El valor debe ser un número válido');
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency,
                maximumFractionDigits: 0
            }).format(amount);
        },
        date(value, locale = 'es-CO', options = {}) {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) throw new TypeError('La fecha no es válida');
            return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...options }).format(date);
        }
    });

    global.AnthrosServices = Object.freeze({
        version: '1.0.0',
        ApiError,
        api,
        database,
        document: documentService,
        format,
        integrations,
        navigation,
        process,
        storage,
        validation
    });

    const currentHash = global.location.hash;
    global.document.querySelectorAll('nav').forEach(nav => {
        if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', 'Navegación principal');
    });
    global.document.querySelectorAll('nav .nav-links a').forEach(link => {
        const destination = new URL(link.href, global.location.href);
        const currentPath = global.location.pathname.endsWith('/')
            ? `${global.location.pathname}index.html`
            : global.location.pathname;
        const isCurrentPage = destination.pathname === currentPath
            && (!destination.hash || destination.hash === currentHash);
        if (isCurrentPage) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });

    global.document.querySelectorAll('nav .nav-links').forEach((links, index) => {
        if (!links.id) links.id = index === 0 ? 'primaryNavigation' : `primaryNavigation-${index + 1}`;
    });
    global.document.querySelectorAll('nav .hamburger').forEach(button => {
        const links = button.closest('nav')?.querySelector('.nav-links');
        if (links) {
            button.setAttribute('aria-controls', links.id);
            button.setAttribute('aria-expanded', 'false');
        }
    });
})(window);
