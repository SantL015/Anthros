'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { validateProduct } = require('./validate-product');

const root = path.resolve(__dirname, '..', '..');
const aboutPage = fs.readFileSync(path.join(root, 'front', 'nosotros.html'), 'utf8');
const requiredNames = [
    'Sobrecamisa Arquitectónica Noche',
    'Hoodie Pesado Eclipse',
    'Camiseta Heavyweight',
    'Pantalón Utilitario',
    'Jean Eclipse de corte relaxed',
    'Sudadera Streetwear Holgada'
];
const expectedImages = {
    'Sobrecamisa Arquitectónica Noche': 'Gemini_Generated_Image_9gsghg9gsghg9gsg.jpg',
    'Hoodie Pesado Eclipse': 'Gemini_Generated_Image_uvhojbuvhojbuvho.jpg',
    'Camiseta Heavyweight': 'Gemini_Generated_Image_cxyvm0cxyvm0cxyv.jpg',
    'Pantalón Utilitario': 'Gemini_Generated_Image_cq5ypccq5ypccq5y.jpg',
    'Jean Eclipse de corte relaxed': 'Gemini_Generated_Image_m2wvufm2wvufm2wv.jpg',
    'Sudadera Streetwear Holgada': 'Gemini_Generated_Image_xmkch8xmkch8xmkc.jpg'
};
const requiredSpecifications = {
    'Sobrecamisa Arquitectónica Noche': 'dril de algodón orgánico 340 g/m²',
    'Hoodie Pesado Eclipse': 'French Terry carbón lavado 420 g/m²'
};

test('el catálogo y el seed incluyen las nuevas piezas con imágenes disponibles', () => {
    for (const filename of ['back/data/products.json', 'back/data/catalog.json']) {
        const products = JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
        const byName = new Map(products.map(product => [product.name, product]));
        assert.equal(new Set(products.map(product => product.id)).size, products.length, `${filename} no debe repetir identificadores`);

        for (const name of requiredNames) {
            const product = byName.get(name);
            assert.ok(product, `${filename} debe incluir ${name}`);
            assert.ok(Number.isSafeInteger(product.price) && product.price > 0, `${name} requiere un precio COP válido`);
            assert.ok(product.sizes.length > 0, `${name} requiere tallas`);
            assert.ok(product.img.endsWith(expectedImages[name]), `${filename} debe asignar la imagen correcta a ${name}`);
            assert.deepEqual(product.sizes, ['XS', 'S', 'M', 'L', 'XL'], `${name} debe ofrecer XS a XL`);
            assert.equal(product.origin, 'Talleres aliados de Bogotá y Medellín', `${name} debe informar su origen`);
            if (requiredSpecifications[name]) {
                assert.equal(product.material, requiredSpecifications[name]);
            }
            if (filename.endsWith('products.json')) validateProduct(product);
        }
        for (const product of products) {
            for (const image of [product.img, product.hoverImg]) {
                if (!image) continue;
                assert.ok(
                    fs.existsSync(path.join(root, 'front', image.slice(1))),
                    `${filename} (${product.name}) referencia una imagen disponible: ${image}`
                );
            }
        }
    }
});

test('la sección Impacto usa la imagen del taller local', () => {
    assert.match(aboutPage, /Gemini_Generated_Image_ic80esic80esic80\.jpg/);
});
