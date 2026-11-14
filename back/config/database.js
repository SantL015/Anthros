'use strict';

const mongoose = require('mongoose');

const TRANSIENT_CODES = new Set([
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'HOSTUNREACH',
    'NETWORK_TIMEOUT'
]);
const PERMANENT_CODES = new Set([13, 18, 8000, '13', '18', '8000', 'AUTHENTICATION_FAILED', 'BAD_AUTHENTICATION']);

function isTransientDatabaseError(error) {
    const pending = [error];
    const visited = new Set();
    let hasServerSelectionError = false;
    while (pending.length) {
        const current = pending.pop();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        if (PERMANENT_CODES.has(current.code) ||
            /authentication failed|bad auth|not authorized/i.test(String(current.message || ''))) return false;
        if (TRANSIENT_CODES.has(current.code) ||
            ['MongoNetworkError', 'MongoNotConnectedError'].includes(current.name) ||
            /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|HOSTUNREACH/i.test(String(current.message || ''))) return true;
        if (['MongoServerSelectionError', 'MongooseServerSelectionError'].includes(current.name)) {
            hasServerSelectionError = true;
        }
        pending.push(current.cause, current.reason);
    }
    return hasServerSelectionError;
}

async function connectDatabase(uri = process.env.MONGO_URI || process.env.MONGODB_URI) {
    if (!uri) return false;
    try {
        await mongoose.connect(uri, {
            dbName: process.env.MONGODB_DB || 'anthros',
            serverSelectionTimeoutMS: 8000
        });
        return true;
    } catch (cause) {
        const error = new Error('No fue posible conectar con MongoDB.');
        error.code = 'DATABASE_UNAVAILABLE';
        error.cause = cause;
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            error.disconnectError = disconnectError;
        }
        throw error;
    }
}

module.exports = { connectDatabase, isTransientDatabaseError };
