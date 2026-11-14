'use strict';

const mongoose = require('mongoose');

// Guarda el cliente, la copia de las prendas compradas y el total confirmado.
const pedidoSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    cliente: {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
        phone: { type: String, required: true, trim: true, maxlength: 40 },
        city: { type: String, required: true, trim: true, maxlength: 80 },
        address: { type: String, required: true, trim: true, maxlength: 180 }
    },
    items: { type: [mongoose.Schema.Types.Mixed], required: true, validate: items => items.length > 0 },
    total: { type: Number, required: true, min: 0 },
    fecha: { type: Date, default: Date.now, required: true },
    payment: { type: String, enum: ['card', 'bank', 'pse', 'efecty', 'cash'], required: true },
    status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending', required: true },
    appliedPromo: { type: Number, min: 0, max: 100, default: 0 },
    promoCode: { type: String, trim: true, maxlength: 32, default: '' },
    breakdown: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true,
    collection: 'pedidos'
});

pedidoSchema.index({ fecha: -1 });

module.exports = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);
