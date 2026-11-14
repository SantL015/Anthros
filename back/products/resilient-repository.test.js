'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createResilientProductRepository } = require('./resilient-repository');

test('resilient product repository fails over when MongoDB DNS is unavailable', async () => {
    let active = 'mongo';
    const primary = {
        initialize: async () => {
            const error = new Error('DNS unavailable');
            error.code = 'ENOTFOUND';
            throw error;
        },
        close: async () => { active = 'closed'; }
    };
    const fallback = {
        initialize: async () => { active = 'json'; },
        list: async () => ({ products: [{ id: 1 }], total: 1 }),
        close: async () => {}
    };
    let fallbackNotified = false;
    const repository = createResilientProductRepository({
        primary,
        fallback,
        onFallback: async () => { fallbackNotified = true; }
    });

    await repository.initialize();
    assert.equal(active, 'json');
    assert.equal(fallbackNotified, true);
    assert.deepEqual(await repository.list({ limit: 1 }), {
        products: [{ id: 1 }],
        total: 1
    });
});

test('resilient product repository switches to JSON after an in-session network failure', async () => {
    let fallbackCalled = false;
    const primary = {
        initialize: async () => {},
        list: async () => {
            const error = new Error('Connection reset');
            error.cause = { code: 'ECONNRESET' };
            throw error;
        },
        close: async () => {}
    };
    const fallback = {
        initialize: async () => {},
        list: async () => ({ products: [], total: 0 }),
        close: async () => {}
    };
    const repository = createResilientProductRepository({
        primary,
        fallback,
        onFallback: async () => { fallbackCalled = true; }
    });

    await repository.initialize();
    assert.deepEqual(await repository.list(), { products: [], total: 0 });
    assert.equal(fallbackCalled, true);
});
