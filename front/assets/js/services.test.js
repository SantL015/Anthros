'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function createServices() {
    const window = {
        document: { querySelectorAll: () => [] },
        location: { hash: '', pathname: '/' }
    };
    const source = fs.readFileSync(__dirname + '/services/index.js', 'utf8');
    vm.runInNewContext(source, { window, URL, URLSearchParams });
    return window.AnthrosServices;
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
