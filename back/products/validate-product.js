'use strict';

const PRODUCT_FIELDS = new Set([
    'id', 'name', 'category', 'gender', 'line', 'price', 'originalPrice', 'discount',
    'isNew', 'badge', 'sizes', 'collection', 'year', 'material', 'colors', 'shipping',
    'care', 'img', 'hoverImg', 'desc', 'rating', 'reviews', 'cut', 'origin', 'sustainability'
]);
const TEXT_LIMITS = Object.freeze({
    name: 100,
    category: 80,
    gender: 30,
    line: 40,
    badge: 30,
    collection: 50,
    material: 120,
    shipping: 80,
    care: 160,
    desc: 500,
    cut: 40,
    origin: 80
});
const VALID_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL']);

class ProductValidationError extends Error {
    constructor(errors) {
        super('El producto contiene campos inválidos');
        this.name = 'ProductValidationError';
        this.status = 400;
        this.code = 'PRODUCT_VALIDATION_FAILED';
        this.details = errors;
    }
}

function cleanText(value, field, errors, { required = true, maxLength = TEXT_LIMITS[field] || 80 } = {}) {
    if (typeof value !== 'string') {
        if (!required && (value === null || value === undefined || value === '')) return '';
        errors[field] = 'Debe ser texto';
        return '';
    }
    const cleaned = value.trim();
    if (required && !cleaned) errors[field] = 'Este campo es obligatorio';
    else if (cleaned.length > maxLength) errors[field] = `No puede superar ${maxLength} caracteres`;
    return cleaned;
}

function cleanNumber(value, field, errors, min, max, fallback = undefined) {
    if (value === null && fallback === null) return null;
    if ((value === undefined || value === '') && fallback !== undefined) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        errors[field] = `Debe ser un número entre ${min} y ${max}`;
        return fallback ?? min;
    }
    return number;
}

function cleanStringList(value, field, errors, { allowed, maxItems = 12, maxLength = 40 } = {}) {
    if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
        errors[field] = `Debe ser una lista de 1 a ${maxItems} elementos`;
        return [];
    }
    const cleaned = value.map(item => {
        if (typeof item !== 'string') return '';
        return item.trim().slice(0, maxLength);
    });
    if (cleaned.some(item => !item || (allowed && !allowed.has(item)))) {
        errors[field] = allowed ? 'La lista contiene una talla no permitida' : 'La lista contiene un elemento inválido';
    }
    return [...new Set(cleaned.filter(Boolean))];
}

function cleanSustainability(value, errors) {
    const allowedFields = new Set(['material', 'impact', 'cert']);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.sustainability = 'Debe ser un objeto con información de sostenibilidad';
        return undefined;
    }
    if (Object.keys(value).some(key => !allowedFields.has(key))) {
        errors.sustainability = 'Solo se permiten material, impact y cert';
        return undefined;
    }
    const limits = { material: 120, impact: 300, cert: 120 };
    const cleaned = {};
    for (const [field, maxLength] of Object.entries(limits)) {
        if (Object.prototype.hasOwnProperty.call(value, field)) {
            cleaned[field] = cleanText(value[field], `sustainability.${field}`, errors, {
                required: false,
                maxLength
            });
        }
    }
    return cleaned;
}

function validateProduct(input, { partial = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ProductValidationError({ body: 'Debe enviarse un objeto de producto' });
    }

    const errors = {};
    for (const key of Object.keys(input)) {
        if (!PRODUCT_FIELDS.has(key)) errors[key] = 'Campo no permitido';
    }

    const product = {};
    const stringFields = ['name', 'category', 'gender', 'line', 'collection', 'material', 'shipping', 'care', 'desc'];
    for (const field of stringFields) {
        if (partial && !Object.prototype.hasOwnProperty.call(input, field)) continue;
        product[field] = cleanText(input[field], field, errors, { maxLength: TEXT_LIMITS[field] });
    }
    for (const field of ['cut', 'hoverImg', 'origin']) {
        if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
        product[field] = cleanText(input[field], field, errors, {
            required: false,
            maxLength: field === 'cut' ? TEXT_LIMITS.cut : 180
        });
    }
    if (Object.prototype.hasOwnProperty.call(input, 'sustainability')) {
        product.sustainability = cleanSustainability(input.sustainability, errors);
    }
    if (partial && Object.prototype.hasOwnProperty.call(input, 'badge')) {
        product.badge = cleanText(input.badge, 'badge', errors, { required: false, maxLength: TEXT_LIMITS.badge });
    } else if (!partial) {
        product.badge = cleanText(input.badge ?? '', 'badge', errors, { required: false, maxLength: TEXT_LIMITS.badge });
    }

    const numericFields = {
        price: [0, 100000000],
        discount: [0, 100],
        year: [2000, 2100],
        rating: [0, 5],
        reviews: [0, 10000000]
    };
    for (const [field, range] of Object.entries(numericFields)) {
        if (partial && !Object.prototype.hasOwnProperty.call(input, field)) continue;
        product[field] = cleanNumber(input[field], field, errors, ...range, { discount: 0, rating: 0, reviews: 0 }[field]);
    }
    if (partial && Object.prototype.hasOwnProperty.call(input, 'originalPrice')) {
        product.originalPrice = cleanNumber(input.originalPrice, 'originalPrice', errors, 0, 100000000, null);
    } else if (!partial) {
        product.originalPrice = input.originalPrice === null || input.originalPrice === undefined
            ? null
            : cleanNumber(input.originalPrice, 'originalPrice', errors, 0, 100000000, null);
    }

    if (partial && Object.prototype.hasOwnProperty.call(input, 'isNew')) {
        if (typeof input.isNew !== 'boolean') errors.isNew = 'Debe ser booleano';
        else product.isNew = input.isNew;
    } else if (!partial) {
        if (input.isNew !== undefined && typeof input.isNew !== 'boolean') errors.isNew = 'Debe ser booleano';
        product.isNew = input.isNew === true;
    }

    if (partial && Object.prototype.hasOwnProperty.call(input, 'sizes')) {
        product.sizes = cleanStringList(input.sizes, 'sizes', errors, { allowed: VALID_SIZES, maxItems: 6, maxLength: 3 });
    } else if (!partial) {
        product.sizes = cleanStringList(input.sizes, 'sizes', errors, { allowed: VALID_SIZES, maxItems: 6, maxLength: 3 });
    }
    if (partial && Object.prototype.hasOwnProperty.call(input, 'colors')) {
        product.colors = cleanStringList(input.colors, 'colors', errors, { maxItems: 8, maxLength: 30 });
    } else if (!partial) {
        product.colors = cleanStringList(input.colors, 'colors', errors, { maxItems: 8, maxLength: 30 });
    }
    if (partial && Object.prototype.hasOwnProperty.call(input, 'img')) {
        product.img = cleanText(input.img, 'img', errors, { maxLength: 180 });
    } else if (!partial) {
        product.img = cleanText(input.img, 'img', errors, { maxLength: 180 });
    }
    if (product.img && !/^\/assets\/images\/[A-Za-z0-9()[\]. ,_-]+$/.test(product.img)) {
        errors.img = 'La imagen debe estar dentro de /assets/images/';
    }
    if (product.hoverImg && !/^\/assets\/images\/[A-Za-z0-9()[\]. ,_-]+$/.test(product.hoverImg)) {
        errors.hoverImg = 'La imagen debe estar dentro de /assets/images/';
    }

    if (partial && Object.prototype.hasOwnProperty.call(input, 'id')) {
        errors.id = 'El identificador no se puede modificar';
    }
    if (Object.keys(errors).length) throw new ProductValidationError(errors);
    return product;
}

function parseProductId(value) {
    if (!/^[1-9]\d{0,9}$/.test(String(value))) {
        const error = new Error('El identificador debe ser un entero positivo');
        error.status = 400;
        error.code = 'INVALID_PRODUCT_ID';
        throw error;
    }
    return Number(value);
}

module.exports = { PRODUCT_FIELDS, ProductValidationError, parseProductId, validateProduct };
