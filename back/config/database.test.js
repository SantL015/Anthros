'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isTransientDatabaseError } = require('./database');

test('database classifier identifies DNS and nested network failures only', () => {
    assert.equal(isTransientDatabaseError({ code: 'ENOTFOUND' }), true);
    assert.equal(isTransientDatabaseError({
        name: 'MongooseServerSelectionError',
        cause: { code: 'ECONNRESET' }
    }), true);
    assert.equal(isTransientDatabaseError({ code: 18, name: 'MongoServerError' }), false);
    assert.equal(isTransientDatabaseError({
        name: 'MongooseServerSelectionError',
        reason: { name: 'MongoServerError', message: 'Authentication failed.' }
    }), false);
    assert.equal(isTransientDatabaseError(new Error('Validation failed')), false);
});
