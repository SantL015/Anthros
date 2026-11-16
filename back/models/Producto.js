'use strict';

const mongoose = require('mongoose');

// Conserva el contrato del catálogo actual y ofrece los nombres españoles del modelo.
const productoSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 100, alias: 'nombre' },
    collection: { type: String, required: true, trim: true, maxlength: 80, alias: 'coleccion' },
    mode: { type: String, enum: ['day', 'night', 'verano'], alias: 'modo' },
    price: { type: Number, required: true, min: 0, alias: 'precio' },
    material: { type: String, required: true, trim: true, maxlength: 120 },
    origin: { type: String, trim: true, maxlength: 80 },
    cut: { type: String, required: true, trim: true, maxlength: 40, alias: 'corte' },
    img: { type: String, required: true, trim: true, maxlength: 240, alias: 'imagen' },
    desc: { type: String, required: true, trim: true, maxlength: 500, alias: 'descripcion' }
}, {
    timestamps: true,
    strict: false,
    suppressReservedKeysWarning: true,
    collection: 'products'
});

productoSchema.index({ collection: 1, mode: 1 });

module.exports = mongoose.models.Producto || mongoose.model('Producto', productoSchema);
