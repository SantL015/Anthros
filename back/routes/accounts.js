'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,99}$/u;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return `scrypt$16384$${salt}$${key.toString('hex')}`;
}

function createAccountsRouter(recordStore) {
    const router = express.Router();
    router.post('/register', async (request, response, next) => {
        try {
            const name = typeof request.body?.name === 'string'
                ? request.body.name.trim().replace(/\s+/g, ' ')
                : '';
            const email = typeof request.body?.email === 'string'
                ? request.body.email.trim().toLowerCase()
                : '';
            const password = typeof request.body?.password === 'string' ? request.body.password : '';

            if (!NAME_PATTERN.test(name)) {
                const error = new Error('Ingresa un nombre válido de 2 a 100 caracteres.');
                error.status = 400;
                error.code = 'INVALID_ACCOUNT_NAME';
                throw error;
            }
            if (email.length > 254 || !EMAIL_PATTERN.test(email) || email.includes('..')) {
                const error = new Error('Ingresa un correo electrónico válido.');
                error.status = 400;
                error.code = 'INVALID_EMAIL';
                throw error;
            }
            if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH || password.includes('\0')) {
                const error = new Error(`La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`);
                error.status = 400;
                error.code = 'INVALID_PASSWORD';
                throw error;
            }

            const passwordHash = await hashPassword(password);
            const createdAt = new Date().toISOString();
            const created = await recordStore.addUnique('accounts', 'accounts', {
                name,
                email,
                passwordHash,
                createdAt
            });
            if (!created) {
                const error = new Error('Ya existe una cuenta con ese correo.');
                error.status = 409;
                error.code = 'ACCOUNT_ALREADY_EXISTS';
                throw error;
            }
            response.status(201).json({
                ok: true,
                account: { name, email, createdAt },
                requestId: request.requestId
            });
        } catch (error) {
            next(error);
        }
    });
    return router;
}

module.exports = { createAccountsRouter, hashPassword };
