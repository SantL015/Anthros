'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function createServices(windowOptions = {}) {
    const window = {
        document: { querySelectorAll: () => [] },
        location: { href: 'https://anthros.example/', hash: '', pathname: '/' },
        addEventListener: () => {},
        ...windowOptions
    };
    const source = fs.readFileSync(__dirname + '/services/index.js', 'utf8');
    vm.runInNewContext(source, { window, URL, URLSearchParams, AbortController });
    return window.AnthrosServices;
}

test('navegación sincroniza el enlace activo entre menús y al cambiar el hash', () => {
    const links = [
        createNavigationLink('/index.html'),
        createNavigationLink('/index.html#contacto'),
        createNavigationLink('/index.html'),
        createNavigationLink('/index.html#contacto')
    ];
    const listeners = {};
    const window = {
        document: {
            querySelectorAll(selector) {
                if (selector === 'nav .nav-links a, .mobile-menu .mobile-nav-links a') return links;
                return [];
            }
        },
        location: { href: 'https://anthros.example/index.html#contacto', hash: '#contacto', pathname: '/index.html' },
        addEventListener: (event, listener) => { listeners[event] = listener; }
    };
    createServices(window);

    assert.deepEqual(links.map(link => link.classList.contains('active')), [false, true, false, true]);
    assert.equal(links[1].attributes['aria-current'], 'page');
    assert.equal(links[3].attributes['aria-current'], 'page');

    window.location.hash = '';
    window.location.href = 'https://anthros.example/index.html';
    listeners.hashchange();
    assert.deepEqual(links.map(link => link.classList.contains('active')), [true, false, true, false]);
});

test('navegación en la página actual actualiza el hash y desplaza suavemente al ancla', () => {
    let scrolled = false;
    let pushedUrl = '';
    const anchor = { scrollIntoView: () => { scrolled = true; } };
    const location = {
        href: 'https://anthros.example/index.html',
        origin: 'https://anthros.example',
        pathname: '/index.html',
        search: '',
        hash: ''
    };
    const services = createServices({
        document: {
            querySelectorAll: () => [],
            getElementById: id => id === 'contacto' ? anchor : null
        },
        location,
        history: {
            pushState: (state, title, url) => {
                pushedUrl = url;
                location.href = url;
                location.hash = new URL(url).hash;
            }
        }
    });

    const navigation = services.navigation.navigate('./index.html#contacto');
    assert.equal(navigation.navigated, false);
    assert.equal(navigation.scrolled, true);
    assert.equal(pushedUrl, 'https://anthros.example/index.html#contacto');
    assert.equal(location.hash, '#contacto');
    assert.equal(scrolled, true);
});

function createClassList() {
    const classes = new Set();
    return {
        add(value) { classes.add(value); },
        remove(value) { classes.delete(value); },
        toggle(value, force) {
            const shouldAdd = force === undefined ? !classes.has(value) : force;
            if (shouldAdd) classes.add(value);
            else classes.delete(value);
            return shouldAdd;
        },
        contains(value) { return classes.has(value); }
    };
}

function createNavigationLink(href) {
    return {
        href,
        classList: createClassList(),
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
}

test('integrations convierte COP a USD con la tasa recibida del proveedor', async () => {
    const services = createServices();
    const converted = await services.integrations.copToUsd(4000, {
        fetch: async () => ({
            ok: true,
            json: async () => ({ rates: { USD: 0.00025 }, time_last_update_utc: 'hoy' })
        })
    });

    assert.equal(converted.amount, 1);
    assert.equal(converted.rate, 0.00025);
    assert.equal(converted.updatedAt, 'hoy');
});

test('integrations crea un enlace WhatsApp codificado con el resumen del carrito', () => {
    const services = createServices();
    const url = new URL(services.integrations.whatsappOrderLink({
        phone: '+57 300 123 4567',
        items: [{ name: 'Camisa lino', size: 'M', qty: 2 }],
        total: 250000,
        customer: { name: 'Ana', phone: '3001234567', city: 'Bogotá', address: 'Calle 1 #2-3' }
    }));

    assert.equal(url.host, 'wa.me');
    assert.equal(url.pathname, '/573001234567');
    assert.match(url.searchParams.get('text'), /Camisa lino/);
    assert.match(url.searchParams.get('text'), /250\.000 COP/);
    assert.match(url.searchParams.get('text'), /Bogotá/);
    assert.match(url.searchParams.get('text'), /Calle 1 #2-3/);
});

test('API usa la URL externa configurable del backend', async () => {
    let requestedUrl;
    const services = createServices({
        ANTHROS_API_URL: 'https://api.anthros.example/',
        fetch: async url => {
            requestedUrl = url;
            return { ok: true, status: 200, text: async () => '{"ok":true}' };
        },
        setTimeout,
        clearTimeout
    });

    await services.api.health();
    assert.equal(requestedUrl, 'https://api.anthros.example/api/health');
});
