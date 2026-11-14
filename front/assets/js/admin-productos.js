(function initializeProductAdmin() {
    'use strict';

    const api = window.AnthrosServices.api;
    const list = document.getElementById('productList');
    const editor = document.getElementById('productJson');
    const tokenInput = document.getElementById('adminToken');
    const saveButton = document.getElementById('saveButton');
    const deleteButton = document.getElementById('deleteButton');
    const editorStatus = document.getElementById('editorStatus');
    const listStatus = document.getElementById('listStatus');
    let selectedId = null;

    function showStatus(element, message, kind = '') {
        element.textContent = message;
        element.dataset.kind = kind;
    }

    function errorMessage(error) {
        const help = error.help ? ` ${error.help}` : '';
        const requestId = error.requestId ? ` (solicitud ${error.requestId})` : '';
        return `${error.message}${help}${requestId}`;
    }

    function authToken() {
        const token = tokenInput.value.trim();
        if (!token) throw new Error('Ingresa el token administrativo para guardar o borrar productos.');
        return token;
    }

    function selectProduct(product) {
        selectedId = Number(product.id);
        editor.value = JSON.stringify(product, null, 2);
        saveButton.textContent = 'Guardar cambios';
        deleteButton.disabled = false;
        showStatus(editorStatus, `Editando ${product.name} · ID ${selectedId}`);
    }

    function renderProducts(products) {
        list.replaceChildren();
        if (!products.length) {
            showStatus(listStatus, 'No encontramos productos con esos términos.');
            return;
        }
        showStatus(listStatus, `${products.length} producto(s) en esta página.`, 'success');
        products.forEach(product => {
            const row = document.createElement('article');
            row.className = 'admin-product-row';
            const image = document.createElement('img');
            image.src = product.img;
            image.alt = '';
            image.loading = 'lazy';
            const info = document.createElement('div');
            info.className = 'admin-product-info';
            const name = document.createElement('strong');
            name.textContent = product.name;
            const meta = document.createElement('small');
            meta.textContent = `ID ${product.id} · ${product.collection} · ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(product.price)}`;
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'admin-row-action';
            edit.textContent = '↗';
            edit.setAttribute('aria-label', `Editar ${product.name}`);
            edit.addEventListener('click', () => selectProduct(product));
            info.append(name, meta);
            row.append(image, info, edit);
            list.append(row);
        });
    }

    async function loadProducts() {
        showStatus(listStatus, 'Cargando catálogo…');
        try {
            const query = document.getElementById('productSearch').value.trim();
            const result = await api.products(query ? { q: query, limit: 100 } : { limit: 100 });
            renderProducts(result.products);
        } catch (error) {
            showStatus(listStatus, errorMessage(error), 'error');
        }
    }

    function parseEditor() {
        let product;
        try {
            product = JSON.parse(editor.value);
        } catch {
            throw new Error('La ficha no contiene JSON válido.');
        }
        if (!product || typeof product !== 'object' || Array.isArray(product)) {
            throw new Error('La ficha debe ser un objeto JSON de producto.');
        }
        delete product.id;
        return product;
    }

    async function saveProduct() {
        saveButton.disabled = true;
        try {
            const token = authToken();
            const product = parseEditor();
            const creating = selectedId === null;
            const result = creating
                ? await api.createProduct(product, token)
                : await api.updateProduct(selectedId, product, token);
            selectProduct(result.product);
            showStatus(editorStatus, `Producto ${creating ? 'creado' : 'actualizado'} correctamente.`, 'success');
            await loadProducts();
        } catch (error) {
            showStatus(editorStatus, errorMessage(error), 'error');
        } finally {
            saveButton.disabled = false;
        }
    }

    async function deleteProduct() {
        if (selectedId === null || !window.confirm('¿Eliminar esta pieza del catálogo? Esta acción no se puede deshacer.')) return;
        deleteButton.disabled = true;
        try {
            await api.deleteProduct(selectedId, authToken());
            clearEditor();
            showStatus(editorStatus, 'Producto eliminado.', 'success');
            await loadProducts();
        } catch (error) {
            showStatus(editorStatus, errorMessage(error), 'error');
            deleteButton.disabled = false;
        }
    }

    function clearEditor() {
        selectedId = null;
        editor.value = '';
        saveButton.textContent = 'Crear producto';
        deleteButton.disabled = true;
        showStatus(editorStatus, '');
    }

    document.getElementById('searchButton').addEventListener('click', loadProducts);
    document.getElementById('refreshButton').addEventListener('click', loadProducts);
    document.getElementById('productSearch').addEventListener('keydown', event => {
        if (event.key === 'Enter') loadProducts();
    });
    saveButton.addEventListener('click', saveProduct);
    deleteButton.addEventListener('click', deleteProduct);
    document.getElementById('clearButton').addEventListener('click', clearEditor);
    loadProducts();
})();
