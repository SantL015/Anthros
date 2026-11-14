'use strict';

const express = require('express');

// Deja la API de catálogo existente detrás del enrutador Express sin alterar su contrato.
function createProductsRouter(handleProductsApi) {
    const router = express.Router();
    router.use((request, response, next) => {
        const url = new URL(request.originalUrl, `http://${request.headers.host || 'localhost'}`);
        Promise.resolve(handleProductsApi(request, response, url)).catch(next);
    });
    return router;
}

module.exports = { createProductsRouter };
