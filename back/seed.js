'use strict';

require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const { connectDatabase } = require('./config/database');
const Producto = require('./models/Producto');

// Importa ejemplos del catálogo actual solo si productos no tiene registros.
async function seedProducts() {
    const connected = await connectDatabase();
    if (!connected) throw new Error('Configura MONGO_URI antes de ejecutar el seed.');
    if (await Producto.estimatedDocumentCount()) {
        console.log('El catálogo de MongoDB ya tiene productos; no se modificó.');
        return;
    }

    const sourcePath = path.join(__dirname, 'data', 'products.json');
    const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    const products = source
        .filter(product => ['Brisas de Identidad', 'Eclipse Urbano'].includes(product.collection))
        .map(product => ({
            ...product,
            mode: product.collection === 'Brisas de Identidad'
                ? 'verano'
                : product.eclipseMode === 'day' ? 'day' : 'night',
            cut: product.cut || 'Regular'
        }));

    if (!products.length) throw new Error('No hay productos de Brisas de Identidad o Eclipse Urbano para importar.');
    await Producto.insertMany(products);
    console.log(`Se agregaron ${products.length} productos de ejemplo a MongoDB.`);
}

if (require.main === module) {
    seedProducts()
        .catch(error => {
            console.error('No fue posible poblar el catálogo:', error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        });
}

module.exports = { seedProducts };
