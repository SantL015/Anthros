'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRecordStore } = require('./record-store');

test('record store writes unique records to MongoDB with a unique email index', async () => {
    const records = new Map();
    const indexes = [];
    const collection = {
        createIndex: async (keys, options) => {
            indexes.push({ keys, options });
        },
        updateOne: async (filter, update, options) => {
            assert.deepEqual(options, { upsert: true });
            if (records.has(filter.email)) return { upsertedCount: 0 };
            records.set(filter.email, update.$setOnInsert);
            return { upsertedCount: 1 };
        }
    };
    const connection = {
        readyState: 1,
        db: { collection: name => {
            assert.equal(name, 'newsletter_subscribers');
            return collection;
        } }
    };
    const store = createRecordStore({
        connection,
        readLocal: () => { throw new Error('No debe leer JSON en modo MongoDB'); },
        writeLocal: () => { throw new Error('No debe escribir JSON en modo MongoDB'); }
    });

    assert.equal(await store.addUnique('newsletter_subscribers', 'newsletter', {
        email: 'cliente@example.com'
    }), true);
    assert.equal(await store.addUnique('newsletter_subscribers', 'newsletter', {
        email: 'cliente@example.com'
    }), false);
    assert.deepEqual(indexes, [{ keys: { email: 1 }, options: { unique: true } }]);
});

test('record store conserva la persistencia JSON local y la deduplicación', async () => {
    let records = [];
    const store = createRecordStore({
        connection: { readyState: 0 },
        readLocal: name => {
            assert.equal(name, 'loyalty');
            return records;
        },
        writeLocal: (name, value) => {
            assert.equal(name, 'loyalty');
            records = value;
        }
    });
    const member = { email: 'miembro@example.com' };

    assert.equal(await store.addUnique('loyalty_members', 'loyalty', member), true);
    assert.equal(await store.addUnique('loyalty_members', 'loyalty', member), false);
    assert.deepEqual(records, [member]);
});
