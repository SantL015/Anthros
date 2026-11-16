'use strict';

const mongoose = require('mongoose');
const { isTransientDatabaseError } = require('../config/database');

function createRecordStore({
    connection = mongoose.connection,
    readLocal,
    writeLocal,
    onDatabaseFallback = async () => {}
}) {
    const indexPromises = new Map();

    async function addUnique(collectionName, localName, record) {
        if (connection.readyState === 1) {
            const collection = connection.db.collection(collectionName);
            let indexPromise = indexPromises.get(collectionName);
            if (!indexPromise) {
                indexPromise = collection.createIndex({ email: 1 }, { unique: true })
                    .catch(error => {
                        indexPromises.delete(collectionName);
                        throw error;
                    });
                indexPromises.set(collectionName, indexPromise);
            }
            try {
                await indexPromise;
            } catch (error) {
                if (!isTransientDatabaseError(error)) throw error;
                await onDatabaseFallback(error);
            }
            if (connection.readyState === 1) {
                try {
                    const result = await collection.updateOne(
                        { email: record.email },
                        { $setOnInsert: record },
                        { upsert: true }
                    );
                    return result.upsertedCount === 1;
                } catch (error) {
                    if (error.code === 11000) return false;
                    if (!isTransientDatabaseError(error)) throw error;
                    await onDatabaseFallback(error);
                }
            }
        } else {
            await onDatabaseFallback({ name: 'MongoNotConnectedError', code: 'DATABASE_DISCONNECTED' });
        }

        const records = readLocal(localName);
        if (records.some(item => item.email === record.email)) return false;
        writeLocal(localName, [...records, record]);
        return true;
    }

    async function create(collectionName, localName, record) {
        if (connection.readyState === 1) {
            try {
                await connection.db.collection(collectionName).insertOne(record);
                return record;
            } catch (error) {
                if (!isTransientDatabaseError(error)) throw error;
                await onDatabaseFallback(error);
            }
        } else {
            await onDatabaseFallback({ name: 'MongoNotConnectedError', code: 'DATABASE_DISCONNECTED' });
        }

        const records = readLocal(localName);
        writeLocal(localName, [record, ...records]);
        return record;
    }

    async function list(collectionName, localName) {
        if (connection.readyState === 1) {
            try {
                return await connection.db.collection(collectionName)
                    .find({})
                    .sort({ createdAt: -1 })
                    .toArray();
            } catch (error) {
                if (!isTransientDatabaseError(error)) throw error;
                await onDatabaseFallback(error);
            }
        } else {
            await onDatabaseFallback({ name: 'MongoNotConnectedError', code: 'DATABASE_DISCONNECTED' });
        }
        return readLocal(localName).sort((left, right) =>
            String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
        );
    }

    return Object.freeze({ addUnique, create, list });
}

module.exports = { createRecordStore };
