'use strict';

const { isTransientDatabaseError } = require('../config/database');

function createResilientProductRepository({ primary, fallback, onFallback = () => {} }) {
    let activeRepository = primary;
    let failedOver = false;

    async function failOver(error) {
        if (failedOver) return;
        failedOver = true;
        activeRepository = fallback;
        let closeError;
        try {
            await primary.close();
        } catch (failure) {
            closeError = failure;
        }
        await onFallback(error, closeError);
    }

    async function invoke(method, ...args) {
        if (activeRepository === fallback) return fallback[method](...args);
        try {
            return await primary[method](...args);
        } catch (error) {
            if (!isTransientDatabaseError(error)) throw error;
            await failOver(error);
            return fallback[method](...args);
        }
    }

    return Object.freeze({
        initialize: () => invoke('initialize'),
        list: (...args) => invoke('list', ...args),
        findById: (...args) => invoke('findById', ...args),
        create: (...args) => invoke('create', ...args),
        update: (...args) => invoke('update', ...args),
        remove: (...args) => invoke('remove', ...args),
        async close() {
            const results = await Promise.allSettled([primary.close(), fallback.close()]);
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;
        }
    });
}

module.exports = { createResilientProductRepository };
