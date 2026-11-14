'use strict';

const express = require('express');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Pedido = require('../models/Pedido');
const { isTransientDatabaseError } = require('../config/database');
const { priceCart } = require('../orders/pricing');

const PAYMENT_METHODS = new Set(['card', 'bank', 'pse', 'efecty', 'cash']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PERSON_OR_CITY_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,99}$/u;

function createOrderError(message, code, status) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function cleanText(value, maxLength) {
    return typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
        : '';
}

function validateCustomer(payload) {
    const name = cleanText(payload?.name, 100);
    const email = cleanText(payload?.email, 254).toLowerCase();
    const phone = cleanText(payload?.phone, 40).replace(/[\s()-]/g, '');
    const city = cleanText(payload?.city, 80);
    const address = cleanText(payload?.address, 180);

    if (!PERSON_OR_CITY_PATTERN.test(name) ||
        !EMAIL_PATTERN.test(email) || email.includes('..') ||
        !/^\+?\d{7,15}$/.test(phone) ||
        !PERSON_OR_CITY_PATTERN.test(city) ||
        address.length < 5 || /[<>{}\u0000-\u001f]/.test(address)) {
        throw createOrderError('Revisa el nombre, correo, teléfono, ciudad y dirección de entrega.', 'INVALID_CUSTOMER', 400);
    }
    return { name, email, phone, city, address };
}

function toApiOrder(pedido) {
    const record = typeof pedido.toObject === 'function' ? pedido.toObject() : pedido;
    return {
        id: record.id,
        createdAt: new Date(record.fecha || record.createdAt).toISOString(),
        customer: record.cliente || record.customer,
        payment: record.payment,
        status: record.status || 'pending',
        items: record.items,
        appliedPromo: record.appliedPromo,
        promoCode: record.promoCode || '',
        breakdown: record.breakdown,
        total: record.total
    };
}

function createOrdersRouter({
    productRepository,
    getLocalOrders,
    saveLocalOrder,
    onDatabaseFallback = async () => {}
}) {
    const router = express.Router();

    router.get('/', async (request, response, next) => {
        try {
            if (mongoose.connection.readyState === 1) {
                try {
                    const orders = (await Pedido.find().sort({ fecha: -1 }).limit(200).lean()).map(toApiOrder);
                    response.json({ orders });
                    return;
                } catch (error) {
                    if (!isTransientDatabaseError(error)) throw error;
                    await onDatabaseFallback(error);
                }
            } else {
                await onDatabaseFallback({ name: 'MongoNotConnectedError', code: 'DATABASE_DISCONNECTED' });
            }
            response.json({ orders: await getLocalOrders() });
        } catch (error) {
            next(error);
        }
    });

    router.post('/', async (request, response, next) => {
        try {
            const payload = request.body;
            if (!Array.isArray(payload?.items) || payload.items.length === 0) {
                throw createOrderError('El carrito está vacío. Añade al menos un producto.', 'INVALID_ORDER_ITEMS', 400);
            }
            const customer = validateCustomer(payload?.customer);
            if (payload.acceptedTerms !== true) {
                throw createOrderError('Debes aceptar los Términos y la Política de Privacidad.', 'TERMS_NOT_ACCEPTED', 400);
            }
            const payment = cleanText(payload?.payment, 30).toLowerCase();
            if (!PAYMENT_METHODS.has(payment)) {
                throw createOrderError('Selecciona un método de pago disponible.', 'INVALID_PAYMENT_METHOD', 400);
            }
            if (payment === 'cash' && customer.city.toLocaleLowerCase('es') !== 'barranquilla') {
                throw createOrderError('La contraentrega solo está disponible en Barranquilla.', 'PAYMENT_METHOD_UNAVAILABLE', 400);
            }

            const pricedCart = await priceCart(payload.items, payload.promoCode, productRepository);
            const order = {
                id: `ORD-${crypto.randomUUID()}`,
                createdAt: new Date().toISOString(),
                customer,
                payment,
                status: 'pending',
                items: pricedCart.items,
                appliedPromo: pricedCart.appliedPromo,
                promoCode: pricedCart.promoCode,
                breakdown: pricedCart.breakdown,
                total: pricedCart.total
            };

            if (mongoose.connection.readyState === 1) {
                try {
                    const pedido = await Pedido.create({
                        id: order.id,
                        cliente: customer,
                        items: order.items,
                        total: order.total,
                        fecha: order.createdAt,
                        payment,
                        status: order.status,
                        appliedPromo: order.appliedPromo,
                        promoCode: order.promoCode,
                        breakdown: order.breakdown
                    });
                    response.status(201).json({ ok: true, order: toApiOrder(pedido), requestId: request.requestId });
                    return;
                } catch (error) {
                    if (!isTransientDatabaseError(error)) throw error;
                    await onDatabaseFallback(error);
                }
            } else {
                await onDatabaseFallback({ name: 'MongoNotConnectedError', code: 'DATABASE_DISCONNECTED' });
            }

            await saveLocalOrder(order);
            response.status(201).json({ ok: true, order, requestId: request.requestId });
        } catch (error) {
            next(error);
        }
    });

    return router;
}

module.exports = { createOrdersRouter, validateCustomer };
