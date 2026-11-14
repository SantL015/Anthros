'use strict';

const PROMO_CODES = Object.freeze({
    ANTHROS10: 10,
    BIENVENIDO: 15,
    VERANO2026: 20
});

function orderError(message, code, status) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

async function priceCart(items, promoCode, productRepository) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
        throw orderError('El pedido debe incluir entre 1 y 30 productos.', 'INVALID_ORDER_ITEMS', 400);
    }

    const normalizedPromo = typeof promoCode === 'string' ? promoCode.trim().toUpperCase() : '';
    const promoPercent = normalizedPromo ? PROMO_CODES[normalizedPromo] : 0;
    if (normalizedPromo && !promoPercent) {
        throw orderError('El código promocional no es válido.', 'INVALID_PROMO_CODE', 400);
    }

    let totalQuantity = 0;
    const pricedItems = [];
    for (const item of items) {
        const id = Number(item?.id);
        const quantity = Number(item?.qty);
        const size = typeof item?.size === 'string' ? item.size.trim() : '';
        if (!Number.isSafeInteger(id) || id < 1 ||
            !Number.isInteger(quantity) || quantity < 1 || quantity > 20 ||
            !size || size.length > 8) {
            throw orderError('Revisa el identificador, la talla y la cantidad de cada producto.', 'INVALID_ORDER_ITEM', 400);
        }

        const product = await productRepository.findById(id);
        if (!product) throw orderError(`No encontramos el producto ${id}.`, 'PRODUCT_NOT_FOUND', 404);
        const price = Number(product.price);
        if (!Number.isSafeInteger(price) || price < 0 ||
            !Array.isArray(product.sizes) || !product.sizes.includes(size)) {
            throw orderError('El producto o la talla ya no están disponibles para este pedido.', 'PRODUCT_UNAVAILABLE', 409);
        }

        totalQuantity += quantity;
        if (totalQuantity > 100) {
            throw orderError('El carrito supera el máximo de 100 unidades.', 'ORDER_QUANTITY_LIMIT', 400);
        }
        pricedItems.push({
            id,
            name: String(product.name),
            size,
            qty: quantity,
            price,
            img: typeof product.img === 'string' ? product.img : ''
        });
    }

    const subtotal = pricedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (!Number.isSafeInteger(subtotal)) {
        throw orderError('El total del pedido supera el límite permitido.', 'ORDER_TOTAL_LIMIT', 400);
    }
    const shipping = totalQuantity > 5 || subtotal >= 150000 ? 0 : 5000;
    const promoDiscount = Math.round(subtotal * promoPercent / 100);
    const afterPromo = subtotal - promoDiscount;
    const beforeThresholdDiscount = afterPromo + shipping;
    const thresholdDiscount = beforeThresholdDiscount > 100000
        ? Math.round(beforeThresholdDiscount * 0.1)
        : 0;
    const total = beforeThresholdDiscount - thresholdDiscount;

    return {
        items: pricedItems,
        promoCode: normalizedPromo,
        appliedPromo: promoPercent,
        total,
        breakdown: {
            subtotal,
            totalQty: totalQuantity,
            shipping,
            promoDiscount,
            appliedPromoPct: promoPercent,
            umbralDisc: thresholdDiscount,
            total
        }
    };
}

module.exports = { PROMO_CODES, priceCart };
