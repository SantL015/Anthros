'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Pedido = require('./Pedido');
const Producto = require('./Producto');

test('Producto acepta los tres modos de colección definidos por Anthros', () => {
    const base = {
        id: 1,
        nombre: 'Camisa de lino',
        coleccion: 'Brisas de Identidad',
        precio: 125000,
        material: 'Lino',
        corte: 'Relaxed Fit',
        imagen: '/assets/images/camisa.jpg',
        descripcion: 'Prenda fresca para uso diario.'
    };

    for (const modo of ['day', 'night', 'verano']) {
        const product = new Producto({ ...base, modo });
        assert.equal(product.validateSync(), undefined);
        assert.equal(product.name, 'Camisa de lino');
        assert.equal(product.collection, 'Brisas de Identidad');
    }
    assert.ok(new Producto({ ...base, modo: 'tarde' }).validateSync());
});

test('Pedido requiere cliente, productos y total no negativo', () => {
    const valid = new Pedido({
        id: 'ORD-TEST',
        cliente: { name: 'Ana', email: 'ana@example.com', phone: '3001234567', city: 'Barranquilla', address: 'Calle 1 #2-3' },
        items: [{ name: 'Camisa', qty: 1 }],
        total: 125000,
        payment: 'card'
    });
    assert.equal(valid.validateSync(), undefined);

    const invalid = new Pedido({ id: 'ORD-INVALIDO', items: [], total: -1 });
    assert.ok(invalid.validateSync());
});
