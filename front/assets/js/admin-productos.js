(function initializeProductAdmin() {
    'use strict';

    const api = window.AnthrosServices.api;
    const list = document.getElementById('productList');
    const form = document.getElementById('productForm');
    const loginForm = document.getElementById('loginForm');
    const loginInput = document.getElementById('adminToken');
    const workspace = document.getElementById('adminWorkspace');
    const saveButton = document.getElementById('saveButton');
    const deleteButton = document.getElementById('deleteButton');
    const editorStatus = document.getElementById('editorStatus');
    const listStatus = document.getElementById('listStatus');
    const messagesStatus = document.getElementById('messagesStatus');
    const messageList = document.getElementById('messageList');
    let token = '';
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

    function field(name) {
        return form.elements.namedItem(name);
    }

    function productFields() {
        return {
            name: field('name').value.trim(),
            collection: field('collection').value.trim(),
            price: Number(field('price').value),
            sizes: field('sizes').value.split(',').map(size => size.trim()).filter(Boolean),
            img: field('img').value.trim(),
            desc: field('desc').value.trim()
        };
    }

    function selectProduct(product) {
        selectedId = Number(product.id);
        field('name').value = product.name || '';
        field('collection').value = product.collection || '';
        field('price').value = product.price ?? '';
        field('sizes').value = Array.isArray(product.sizes) ? product.sizes.join(', ') : '';
        field('img').value = product.img || '';
        field('desc').value = product.desc || '';
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

    async function loadMessages() {
        showStatus(messagesStatus, 'Cargando mensajes…');
        try {
            const result = await api.contacts(token);
            messageList.replaceChildren();
            if (!result.contacts.length) {
                showStatus(messagesStatus, 'Aún no hay mensajes de contacto.');
                return;
            }
            showStatus(messagesStatus, `${result.contacts.length} mensaje(s) recibidos.`, 'success');
            result.contacts.forEach(contact => {
                const article = document.createElement('article');
                article.className = 'admin-message';
                const title = document.createElement('h3');
                title.textContent = contact.subject;
                const meta = document.createElement('small');
                meta.textContent = `${contact.name} · ${contact.email} · ${new Date(contact.createdAt).toLocaleString('es-CO')}`;
                const message = document.createElement('p');
                message.textContent = contact.message;
                article.append(title, meta, message);
                messageList.append(article);
            });
        } catch (error) {
            showStatus(messagesStatus, errorMessage(error), 'error');
        }
    }

    async function login(event) {
        event.preventDefault();
        const loginButton = document.getElementById('loginButton');
        const candidate = loginInput.value.trim();
        if (!candidate) return;
        loginButton.disabled = true;
        loginButton.textContent = 'Verificando…';
        showStatus(document.getElementById('loginStatus'), 'Validando acceso…');
        try {
            await api.verifyAdmin(candidate);
            token = candidate;
            loginInput.value = '';
            document.getElementById('adminLogin').hidden = true;
            workspace.hidden = false;
            await Promise.all([loadProducts(), loadMessages()]);
        } catch (error) {
            showStatus(document.getElementById('loginStatus'), errorMessage(error), 'error');
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Iniciar sesión';
        }
    }

    async function saveProduct(event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        saveButton.disabled = true;
        try {
            const fields = productFields();
            const creating = selectedId === null;
            const result = creating
                ? await api.createProduct({
                    ...fields,
                    category: 'unisex',
                    gender: 'Unisex',
                    line: 'Atelier',
                    originalPrice: null,
                    discount: 0,
                    isNew: false,
                    badge: '',
                    year: new Date().getFullYear(),
                    material: 'Material sostenible',
                    colors: ['Natural'],
                    shipping: '3-5 días hábiles',
                    care: 'Seguir las instrucciones de la etiqueta',
                    rating: 0,
                    reviews: 0
                }, token)
                : await api.patchProduct(selectedId, fields, token);
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
            await api.deleteProduct(selectedId, token);
            clearForm();
            showStatus(editorStatus, 'Producto eliminado.', 'success');
            await loadProducts();
        } catch (error) {
            showStatus(editorStatus, errorMessage(error), 'error');
            deleteButton.disabled = false;
        }
    }

    function clearForm() {
        selectedId = null;
        form.reset();
        saveButton.textContent = 'Crear producto';
        deleteButton.disabled = true;
        showStatus(editorStatus, '');
    }

    function logout() {
        token = '';
        selectedId = null;
        form.reset();
        messageList.replaceChildren();
        list.replaceChildren();
        workspace.hidden = true;
        document.getElementById('adminLogin').hidden = false;
        showStatus(document.getElementById('loginStatus'), 'Sesión cerrada.');
    }

    loginForm.addEventListener('submit', login);
    document.getElementById('searchButton').addEventListener('click', loadProducts);
    document.getElementById('refreshButton').addEventListener('click', loadProducts);
    document.getElementById('refreshMessagesButton').addEventListener('click', loadMessages);
    document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('productSearch').addEventListener('keydown', event => {
        if (event.key === 'Enter') loadProducts();
    });
    form.addEventListener('submit', saveProduct);
    deleteButton.addEventListener('click', deleteProduct);
    document.getElementById('clearButton').addEventListener('click', clearForm);
})();
