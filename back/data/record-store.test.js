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

test('record store crea y ordena mensajes en el respaldo JSON', async () => {
    let records = [];
    const fallbacks = [];
    const store = createRecordStore({
        connection: { readyState: 0 },
        readLocal: name => {
            assert.equal(name, 'contacts');
            return records;
        },
        writeLocal: (name, value) => {
            assert.equal(name, 'contacts');
            records = value;
        },
        onDatabaseFallback: async error => fallbacks.push(error.code)
    });
    const older = { id: 'CON-1', createdAt: '2026-01-01T00:00:00.000Z' };
    const newer = { id: 'CON-2', createdAt: '2026-01-02T00:00:00.000Z' };

    await store.create('contact_messages', 'contacts', older);
    await store.create('contact_messages', 'contacts', newer);
    assert.deepEqual((await store.list('contact_messages', 'contacts')).map(item => item.id), ['CON-2', 'CON-1']);
    assert.deepEqual(records.map(item => item.id), ['CON-2', 'CON-1']);
    assert.deepEqual(fallbacks, ['DATABASE_DISCONNECTED', 'DATABASE_DISCONNECTED', 'DATABASE_DISCONNECTED']);
});

test('record store crea y lista contactos desde MongoDB cuando está conectado', async () => {
    const records = [];
    const collection = {
        insertOne: async record => records.push(record),
        find: filter => {
            assert.deepEqual(filter, {});
            return {
                sort: sort => {
                    assert.deepEqual(sort, { createdAt: -1 });
                    return { toArray: async () => records };
                }
            };
        }
    };
    const store = createRecordStore({
        connection: { readyState: 1, db: { collection: () => collection } },
        readLocal: () => { throw new Error('No debe leer JSON en modo MongoDB'); },
        writeLocal: () => { throw new Error('No debe escribir JSON en modo MongoDB'); }
    });
    const contact = { id: 'CON-3', createdAt: '2026-01-03T00:00:00.000Z' };

    await store.create('contact_messages', 'contacts', contact);
    assert.deepEqual(await store.list('contact_messages', 'contacts'), [contact]);
});
