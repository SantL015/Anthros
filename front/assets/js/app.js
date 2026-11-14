        let cart = [];
        let appliedPromo = null;
        let appliedPromoCode = null;
        let menuOpen = false;
        const API_BASE = '/api';
        const PROMO_CODES = {
            'ANTHROS10': 10,
            'BIENVENIDO': 15,
            'VERANO2026': 20
        };

        async function apiRequest(endpoint, options = {}) {
            return AnthrosServices.api.request(endpoint, { baseUrl: API_BASE, ...options });
        }

        // Resolvemos las fotos desde la carpeta actual para servirlas desde cualquier ruta.
        function resolveImageUrl(source) {
            const imagePath = String(source ?? '').trim();
            if (!imagePath) return '';

            try {
                const pathForPage = imagePath.startsWith('//') ? imagePath : imagePath.replace(/^\/+/, '');
                return new URL(pathForPage, document.baseURI).href;
            } catch (error) {
                console.error('No se pudo resolver la ruta de imagen del producto', error);
                return '';
            }
        }

        function calcularPrecioConDescuento(precio, procentajeDescuento) {
            const valorDescuento = precio * (procentajeDescuento / 100);
            return precio - valorDescuento;
        }

        function calcularPrecioConImpuesto(precio, porcentajeImpuesto) {
            return precio + (precio * (porcentajeImpuesto / 100));
        }

        function calcularTotalPedido(precioUnitario, cantidad, costoEnvio) {
            if (cantidad > 5) costoEnvio = 0;
            let total = (precioUnitario * cantidad) + costoEnvio;
            if (total > 100000) total = calcularPrecioConDescuento(total, 10);
            return total;
        }

        function formatPrice(price) {
            return '$' + Math.round(price).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }

        function showToast(message, type = 'default') {
            const toast = AnthrosServices.document.byId('toast');
            if (!toast) return;
            toast.classList.remove('success', 'error', 'info');
            const content = AnthrosServices.document.create('span', { text: message });
            toast.innerHTML = '';
            toast.appendChild(content);
            if (type && type !== 'default') toast.classList.add(type);
            toast.classList.add('show');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
        }

        function applyPromo() {
            const input = document.getElementById('promoInput');
            const msg = document.getElementById('promoMessage');
            const code = input.value.trim().toUpperCase();
            if (!code) { msg.textContent = 'Ingresa un código'; msg.className = 'promo-message error'; showToast('Ingresa un código promocional', 'error'); return; }
            if (PROMO_CODES[code]) {
                appliedPromo = PROMO_CODES[code];
                appliedPromoCode = code;
                msg.textContent = ` ${appliedPromo}% de descuento aplicado`;
                msg.className = 'promo-message success';
                updateCart();
                saveCart();
                showToast(`¡${appliedPromo}% OFF aplicado correctamente!`, 'success');
            } else {
                appliedPromo = null;
                appliedPromoCode = null;
                msg.textContent = ' Código inválido';
                msg.className = 'promo-message error';
                saveCart();
                showToast('Código inválido', 'error');
            }
        }

        function toggleCart() {
            if (cart.length === 0 && !window.location.pathname.toLowerCase().includes('carrito')) {
                window.location.href = './carrito.html';
                return;
            }
            const cartModal = document.getElementById('cartModal');
            if (!cartModal) return;
            cartModal.classList.toggle('open');
            document.body.style.overflow = cartModal.classList.contains('open') ? 'hidden' : '';
        }

        function closeCartOutside(e) {
            if (e.target.id === 'cartModal') toggleCart();
        }

        function checkout() {
            if (cart.length === 0) {
                window.location.href = './carrito.html';
                return;
            }
            window.location.href = './checkout.html';
        }

        function initCheckoutPage() {
            const itemsEl = document.getElementById('checkoutItems');
            const totalsEl = document.getElementById('checkoutTotals');
            if (!itemsEl || !totalsEl) return;
            const submitButton = document.querySelector('.checkout-form button[type="submit"]');
            if (!cart.length) {
                itemsEl.innerHTML = '<p class="checkout-empty">Tu carrito está vacío. <a href="./catalogo.html">Explorar colección</a></p>';
                totalsEl.innerHTML = '';
                if (submitButton) submitButton.disabled = true;
            } else {
                const breakdown = calcularDesglosePedidoCompleto();
                itemsEl.innerHTML = cart.map(item => `<div class="checkout-item"><img src="${escapeHTML(resolveImageUrl(item.img))}" alt="${escapeHTML(item.name)}"><div><strong>${escapeHTML(item.name)}</strong><small>${item.qty} × ${formatPrice(item.price)} · Talla ${escapeHTML(item.size || 'M')}</small></div><b>${formatPrice(item.price * item.qty)}</b></div>`).join('');
                totalsEl.innerHTML = `<div class="checkout-total-row"><span>Subtotal</span><b>${formatPrice(breakdown.subtotal)}</b></div>${breakdown.promoDiscount ? `<div class="checkout-total-row discount-row"><span>Descuento</span><b> ${formatPrice(breakdown.promoDiscount)}</b></div>` : ''}${breakdown.umbralDisc ? `<div class="checkout-total-row discount-row"><span>Bono Anthros</span><b> ${formatPrice(breakdown.umbralDisc)}</b></div>` : ''}<div class="checkout-total-row"><span>Envío</span><b>${breakdown.shipping ? formatPrice(breakdown.shipping) : 'Gratis'}</b></div><div class="checkout-total-row checkout-grand-total"><span>Total</span><b>${formatPrice(breakdown.total)}</b></div>`;
                if (submitButton) submitButton.disabled = false;
            }
            const city = document.getElementById('checkoutCity');
            const cash = document.querySelector('#cashPaymentOption input');
            const note = document.getElementById('cashPaymentNote');
            const updateCashAvailability = () => {
                const available = city.value === 'Barranquilla';
                cash.disabled = !available;
                document.getElementById('cashPaymentOption').classList.toggle('disabled', !available);
                note.textContent = available ? 'Contraentrega disponible para Barranquilla.' : 'Selecciona Barranquilla para activar contraentrega.';
                if (!available && cash.checked) cash.checked = false;
            };
            city.addEventListener('change', updateCashAvailability);
            updateCashAvailability();
            document.querySelectorAll('input[name="payment"]').forEach(input => input.addEventListener('change', () => {
                const extra = document.getElementById('paymentExtra');
                extra.textContent = 'Este sitio registra pedidos, pero no procesa cobros. No ingreses datos de tarjeta; coordina el pago con ANTHROS por WhatsApp.';
            }));
        }

        async function finalizeCheckout(e) {
            e.preventDefault();
            if (!cart.length) { showToast('Añade productos antes de pagar', 'error'); return; }
            const form = e.currentTarget;
            const data = new FormData(form);
            if (data.get('payment') === 'cash' && data.get('city') !== 'Barranquilla') { showToast('Contraentrega solo está disponible en Barranquilla', 'error'); return; }
            if (!validateEmail(data.get('email')) || !validatePhone(data.get('phone')) ||
                !validateRequired(data.get('name'), 2, 100) || !validateRequired(data.get('city'), 2, 80) ||
                !validateRequired(data.get('address'), 5, 180)) {
                showToast('Revisa nombre, correo, teléfono y dirección', 'error');
                return;
            }
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Validando pedido…';
            }
            try {
                const result = await apiRequest('/orders', {
                    method: 'POST',
                    body: JSON.stringify({
                        customer: {
                            name: data.get('name'),
                            email: data.get('email'),
                            phone: data.get('phone'),
                            city: data.get('city'),
                            address: data.get('address')
                        },
                        payment: data.get('payment'),
                        acceptedTerms: data.get('acceptedTerms') === 'on',
                        promoCode: appliedPromoCode || '',
                        items: cart.map(item => ({ id: item.id, size: item.size, qty: item.qty }))
                    })
                });
                const order = result.order;
                if (!order?.id || !Array.isArray(order.items) || !Number.isSafeInteger(order.total)) {
                    throw new Error('El servidor no devolvió una confirmación válida del pedido.');
                }
                saveOrderToHistory(order);
                let whatsappUrl = '';
                try {
                    whatsappUrl = AnthrosServices.integrations.whatsappOrderLink({
                        phone: APP_CONFIG.WHATSAPP,
                        items: order.items,
                        total: order.total,
                        customer: order.customer
                    });
                } catch (error) {
                    console.warn('No fue posible preparar el enlace de confirmación por WhatsApp', error);
                }
                cart = [];
                appliedPromo = null;
                appliedPromoCode = null;
                saveCart();
                const whatsappAction = whatsappUrl
                    ? `<a class="checkout-submit" href="${escapeHTML(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Confirmar por WhatsApp</a>`
                    : '';
                form.innerHTML = `<div class="checkout-success"><span></span><p class="section-eyebrow">Pedido registrado · pendiente de pago</p><h2>Gracias por elegir Anthros.</h2><p>Tu pedido <strong>#${escapeHTML(order.id.slice(-8))}</strong> fue registrado. El total confirmado es <strong>${formatPrice(order.total)}</strong>.</p><p>El checkout no realiza cobros. Coordina el pago con el equipo de ANTHROS.</p>${whatsappAction}<a href="./index.html" class="checkout-submit">Volver al inicio</a></div>`;
            } catch (error) {
                console.error('No se pudo confirmar el pedido:', error.message);
                showToast('No se pudo confirmar el pedido. Tu carrito sigue intacto; inténtalo nuevamente.', 'error');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Confirmar pedido';
                }
                return;
            }
        }

        function selectSize(el) {
            el.parentElement.querySelectorAll('.size-option').forEach(s => s.classList.remove('selected'));
            el.classList.add('selected');
        }

        function toggleFav(btn) {
            btn.classList.toggle('active');
            const esActivo = btn.classList.contains('active');
            btn.textContent = esActivo ? 'Guardado' : 'Guardar';
            const card = btn.closest('.product-card');
            const id = Number(card?.dataset.id);
            if (Number.isInteger(id) && id > 0) toggleFavoritoById(id);
            showToast(esActivo ? ' Añadido a favoritos' : ' Eliminado de favoritos', 'info');
        }

        function filterProducts(cat, btn) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _catalogFilters.category = cat;
            applyCatalogFilters();
        }

        async function subscribeNewsletter(e) {
            e.preventDefault();
            const input = document.getElementById('newsletterEmail');
            const email = String(input?.value || '').trim();
            if (!validateEmail(email)) {
                showToast(' Ingresa un correo válido', 'error');
                if (input) { input.style.borderColor = 'var(--red-primary)'; setTimeout(() => input.style.borderColor = '', 1500); }
                return;
            }
            let serverCreated = false;
            try {
                const result = await apiRequest('/newsletter', { method: 'POST', body: JSON.stringify({ email }) });
                serverCreated = result.created;
            } catch (error) {
                console.warn('Newsletter guardado localmente; API no disponible:', error.message);
            }
            const nuevo = saveNewsletterSubscriber(email);
            if (nuevo || serverCreated) {
                showToast(' ¡Suscripción exitosa! 10% OFF listo', 'success');
            } else {
                showToast(' Ya estás suscrito a nuestras novedades', 'info');
            }
            if (input) input.value = '';
        }

        function closeNewsletterFloat() {
            const newsletter = document.getElementById('newsletterFloat');
            if (newsletter) newsletter.classList.add('is-closed');
        }

        async function subscribeLoyalty(e) {
            e.preventDefault();
            const emailInput = document.getElementById('loyaltyEmail');
            const tierInput = document.getElementById('loyaltyTier');
            const email = String(emailInput?.value || '').trim().toLowerCase();
            const tier = String(tierInput?.value || 'esencial');
            if (!validateEmail(email)) {
                showToast('Ingresa un correo válido para unirte', 'error');
                emailInput?.focus();
                return;
            }
            try {
                let serverCreated = false;
                try {
                    const result = await apiRequest('/loyalty', { method: 'POST', body: JSON.stringify({ email, tier }) });
                    serverCreated = result.created;
                } catch (error) {
                    console.warn('Membresía guardada localmente; API no disponible:', error.message);
                }
                const members = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOYALTY) || '[]');
                if (members.some(member => member.email === email)) {
                    showToast('Este correo ya pertenece al Círculo', 'info');
                } else {
                    members.push({ email, tier, joinedAt: new Date().toISOString(), points: 0 });
                    localStorage.setItem(STORAGE_KEYS.LOYALTY, JSON.stringify(members));
                    showToast(serverCreated ? 'Bienvenido al Círculo Anthros' : 'Bienvenido al Círculo Anthros (guardado localmente)', 'success');
                }
                if (emailInput) emailInput.value = '';
            } catch (error) {
                console.warn('No fue posible guardar la membresía', error);
                showToast('No pudimos completar el registro', 'error');
            }
        }

        function scrollToTop() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        window.addEventListener('scroll', () => {
            const btn = document.getElementById('scrollTop');
            const navEl = document.querySelector('nav');
            if (btn) btn.classList.toggle('visible', window.scrollY > 450);
            if (navEl) navEl.classList.toggle('scrolled', window.scrollY > 20);
        }, { passive: true });

        function toggleMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const btn = document.getElementById('hamburgerBtn');
            const links = document.querySelector('nav .nav-links');
            if (!btn) return;
            if (links && !links.id) links.id = 'primaryNavigation';
            btn.setAttribute('aria-controls', menu ? 'mobileMenu' : links?.id || 'primaryNavigation');
            menuOpen = !menuOpen;
            if (menu) menu.classList.toggle('open', menuOpen);
            else links?.classList.toggle('mobile-nav-open', menuOpen);
            btn.classList.toggle('open', menuOpen);
            btn.setAttribute('aria-expanded', menuOpen);
            document.body.style.overflow = menuOpen ? 'hidden' : '';
            if (menuOpen) (menu?.querySelector('a') || links?.querySelector('a'))?.focus({ preventScroll: true });
        }

        function closeMobileMenu() {
            if (!menuOpen) return;
            menuOpen = false;
            const menu = document.getElementById('mobileMenu');
            const btn = document.getElementById('hamburgerBtn');
            const links = document.querySelector('nav .nav-links');
            menu?.classList.remove('open');
            links?.classList.remove('mobile-nav-open');
            btn?.classList.remove('open');
            btn?.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }

        function closeMenuOutside(e) {
            if (e.target.id === 'mobileMenu') closeMobileMenu();
        }

        /* =========================================================
           MÓDULO 1 · CONSTANTES GLOBALES DE CONFIGURACIÓN ANTHROS
           ========================================================= */
        const APP_CONFIG = Object.freeze({
            STORE_NAME: 'ANTHROS',
            STORE_SLOGAN: 'Moda que se siente, estilo que perdura',
            CURRENCY: 'COP',
            CURRENCY_SYMBOL: '$',
            LOCALE: 'es-CO',
            COUNTRY: 'Colombia',
            CITY: 'Barranquilla',
            ADDRESS: 'Carrera 43 #75-130',
            EMAIL_CONTACTO: 'hola@anthros.com',
            EMAIL_VENTAS: 'ventas@anthros.com',
            PHONE: '+57 (5) 123-4567',
            WHATSAPP: '573001234567',
            HORARIO: 'Lun-Vie 9am-7pm · Sáb 10am-4pm',
            DOMINIO: 'https://anthros.com'
        });

        const SHIPPING_CONFIG = Object.freeze({
            COSTO_ESTANDAR: 5000,
            COSTO_EXPRESS: 12000,
            UMBRAL_GRATIS_CANTIDAD: 5,
            UMBRAL_GRATIS_MONTO: 150000,
            DIAS_ESTANDAR: '3-5 días hábiles',
            DIAS_EXPRESS: '1-2 días hábiles'
        });

        const TAX_CONFIG = Object.freeze({
            IVA_PORCENTAJE: 19,
            INCLUYE_IVA: true,
            BASE_GRAVABLE: 0.81
        });

        Object.assign(PROMO_CODES, {
            'ANTIVERSARIO': 25,
            'AMIGOANTHROS': 12,
            'COLOMBIA': 18,
            'BLACKFRIDAY': 30,
            'CYBERMONDAY': 28,
            'PRIMERACOMPRA': 10
        });

        const PRODUCT_CATEGORIES = Object.freeze({
            ALL: { key: 'all', label: 'Todos', icon: '' },
            HOMBRES: { key: 'hombres', label: 'Hombres', icon: '' },
            MUJERES: { key: 'mujeres', label: 'Mujeres', icon: '' },
            ACCESORIOS: { key: 'accesorios', label: 'Accesorios', icon: '' },
            OFERTAS: { key: 'ofertas', label: 'Ofertas', icon: '' },
            NUEVOS: { key: 'nuevos', label: 'Nuevos', icon: '' }
        });

        const AVAILABLE_SIZES = Object.freeze({
            ROPA_HOMBRE: ['S', 'M', 'L', 'XL', 'XXL'],
            ROPA_MUJER: ['XS', 'S', 'M', 'L', 'XL'],
            CAMISETAS: ['S', 'M', 'L', 'XL'],
            PANTALONES: ['28', '30', '32', '34', '36', '38'],
            ACCESORIOS: ['Talla Única']
        });

        const SORT_OPTIONS = Object.freeze([
            { value: 'default',     label: 'Por defecto' },
            { value: 'price-asc',   label: 'Precio: menor a mayor' },
            { value: 'price-desc',  label: 'Precio: mayor a menor' },
            { value: 'name-asc',    label: 'Nombre: A-Z' },
            { value: 'name-desc',   label: 'Nombre: Z-A' },
            { value: 'discount',    label: 'Mayor descuento' },
            { value: 'news',        label: 'Novedades primero' }
        ]);

        const CUOTAS_CONFIG = Object.freeze({
            MAX_CUOTAS: 12,
            CUOTAS_SIN_INTERES: [1, 3, 6],
            INTERES_MENSUAL: 0.025
        });

        const STORAGE_KEYS = Object.freeze({
            CART: 'anthros_cart_v1',
            FAVORITES: 'anthros_favorites_v1',
            PROMO_APLIED: 'anthros_promo_v1',
            PROMO_CODE: 'anthros_promo_code_v1',
            NEWSLETTER: 'anthros_newsletter_v1',
            LOYALTY: 'anthros_loyalty_v1',
            RECOMMENDATIONS: 'anthros_recommendations_v1',
            ORDER_HISTORY: 'anthros_orders_v1',
            USER_PREFS: 'anthros_user_prefs_v1',
            ACCOUNT: 'anthros_account_v1'
        });

        const FAQ_DATA = Object.freeze([
            { q: '¿Cuánto tarda mi envío?', a: 'Envío estándar 3-5 días hábiles · Express 1-2 días hábiles. Gratis compras > 5 unidades o > $150.000.' },
            { q: '¿Puedo cambiar o devolver?', a: '30 días hábiles después de recibir tu pedido. La prenda debe estar sin uso y con etiquetas.' },
            { q: '¿Qué tallas debo comprar?', a: 'Consulta nuestra guía de tallas. Si aún tienes dudas, contáctanos por WhatsApp y te ayudamos.' },
            { q: '¿Los descuentos se acumulan?', a: 'Solo un código promocional por pedido. El bono > $100k se aplica automáticamente con cualquier código.' },
            { q: '¿Qué métodos de pago aceptan?', a: 'Efectivo contraentrega, PSE, Tarjetas crédito/débito (Visa/Mastercard), Nequi y Daviplata.' },
            { q: '¿Tienen tienda física?', a: '¡Sí! En Barranquilla: Carrera 43 #75-130 · Horario Lun-Vie 9am-7pm · Sáb 10am-4pm.' }
        ]);

        let PRODUCTS_DATA = [
            { id: 1, name: 'Camiseta Manga Larga Essence', category: 'mujeres ofertas', gender: 'Mujer', line: 'Básicos', price: 63920, originalPrice: 79900, discount: 20, isNew: false, badge: '-20%', sizes: ['S','M','L'], collection: 'Brisas de Identidad', year: 2026, material: 'Algodón orgánico 100%', colors: ['Marfil', 'Terracota'], shipping: '3-5 días hábiles', care: 'Lavar en frío y secar a la sombra', img: '/assets/images/camiseta-mujer-manga-larga-de-algodon-ecologico.jpg.webp', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (3).jfif', desc: 'Una base suave y transpirable de algodón orgánico, con manga larga y silueta relajada. Sus tonos marfil y terracota hacen fácil combinarla durante todo el año.', rating: 5, reviews: 124, cut: 'Relaxed Fit', sustainability: { material: 'Algodón orgánico 100%', impact: 'Diseñada para un uso duradero', cert: '' } },
            { id: 2, name: 'Camisa Lino Serenity', category: 'hombres nuevos', gender: 'Hombre', line: 'Camisas', price: 125000, originalPrice: null, discount: 0, isNew: true, badge: 'Nuevo', sizes: ['S','M','L','XL'], collection: 'Brisas de Identidad', year: 2026, material: 'Lino europeo certificado', colors: ['Arena', 'Blanco humo'], shipping: '3-5 días hábiles', care: 'Lavar a mano y planchar a baja temperatura', img: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (13).jfif', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (11).jfif', desc: 'Camisa de lino ligero y transpirable, con una silueta relajada que acompaña tanto los días cálidos como los planes especiales. Disponible en arena y blanco humo.', rating: 4, reviews: 87, cut: 'Relaxed Fit', sustainability: { material: 'Lino europeo certificado', impact: 'Fibra natural y biodegradable', cert: 'European Flax® · OEKO-TEX' } },
            { id: 3, name: 'Camiseta Essential Blanca', category: 'hombres ofertas', gender: 'Hombre', line: 'Básicos', price: 67915, originalPrice: 79900, discount: 15, isNew: false, badge: '-15%', sizes: ['S','M','L','XL'], collection: 'Essentials', year: 2026, material: 'Algodón peinado 100%', colors: ['Blanco óptico', 'Negro carbón'], shipping: '3-5 días hábiles', care: 'Lavar del revés en ciclo suave', img: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (14).jfif', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (10).jfif', desc: 'Un básico de algodón peinado con corte oversize y una paleta clásica en blanco óptico y negro carbón. Una pieza fácil de llevar sola o como primera capa.', rating: 5, reviews: 312, cut: 'Oversize', sustainability: { material: 'Algodón peinado', impact: '', cert: '' } },
            { id: 4, name: 'Camisa Rayas Coastal', category: 'hombres', gender: 'Hombre', line: 'Casual', price: 79900, originalPrice: null, discount: 0, isNew: false, badge: '', sizes: ['S','M','L'], collection: 'Brisas de Identidad', year: 2025, material: 'Algodón y lino', colors: ['Arena', 'Marfil'], shipping: '3-5 días hábiles', care: 'Lavar en frío con colores similares', img: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (11).jfif', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (13).jfif', desc: 'Camisa de rayas verticales en una mezcla ligera de algodón y lino, con un aire costero y corte regular. Sus tonos arena y marfil funcionan para salidas cotidianas y días soleados.', rating: 4, reviews: 58, cut: 'Regular', sustainability: { material: 'Algodón y lino', impact: 'Fibras de origen natural', cert: '' } },
            { id: 5, name: 'Camiseta Urban Cozy', category: 'hombres ofertas', gender: 'Hombre', line: 'Básicos', price: 76930, originalPrice: 109900, discount: 30, isNew: false, badge: '-30%', sizes: ['S','M','L','XL'], collection: 'Eclipse Urbano', year: 2025, material: 'Algodón de tacto suave', colors: ['Gris humo'], shipping: '3-5 días hábiles', care: 'Lavar del revés en ciclo suave', img: '/assets/images/adis-gris-19053-742485_019053-1_703c77d9-da0b-4aec-b78a-a613020cff3a.webp', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (10).jfif', desc: 'Camiseta de silueta oversize en gris humo, una capa ligera y versátil con carácter urbano. Combínala con tus básicos favoritos y lávala del revés en ciclo suave.', rating: 5, reviews: 201, cut: 'Oversize', eclipseMode: 'night', sustainability: { material: 'Algodón de tacto suave', impact: '', cert: '' } },
            { id: 6, name: 'Vestido Ethereal Bloom', category: 'mujeres nuevos', gender: 'Mujer', line: 'Vestidos', price: 149900, originalPrice: null, discount: 0, isNew: true, badge: 'Nuevo', sizes: ['XS','S','M','L'], collection: 'Brisas de Identidad', year: 2026, material: 'Viscosa ECOVERO', colors: ['Rosa arcilla', 'Verde salvia'], shipping: '3-5 días hábiles', care: 'Lavar a mano y colgar para secar', img: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (5).jfif', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (6).jfif', desc: 'Vestido de viscosa ECOVERO con caída ligera y una silueta pensada para moverse con comodidad. Los tonos rosa arcilla y verde salvia aportan color sin perder versatilidad. Lavar a mano y colgar para secar.', rating: 5, reviews: 76, cut: 'Relaxed Fit', sustainability: { material: 'Viscosa ECOVERO', impact: 'Fibra de origen celulósico', cert: '' } },
            { id: 7, name: 'Essential Tee Marfil', category: 'unisex esenciales', gender: 'Unisex', line: 'Essentials', price: 69900, originalPrice: null, discount: 0, isNew: true, badge: 'Esencial', sizes: ['XS','S','M','L','XL'], collection: 'Essentials', year: 2026, material: 'Algodón peinado de tacto suave', colors: ['Marfil'], shipping: '3-5 días hábiles', care: 'Lavar en frío y secar a la sombra', img: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (10).jfif', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (14).jfif', desc: 'Una camiseta unisex de algodón peinado, suave al tacto y de silueta amplia. Su tono marfil y diseño limpio la convierten en un básico fácil de combinar.', rating: 0, reviews: 0, cut: 'Wide', sustainability: { material: 'Algodón peinado', impact: '', cert: '' } },
            { id: 8, name: 'Camisa Fresca de Lino', category: 'unisex nuevos', gender: 'Unisex', line: 'Edición Fresca', price: 119900, originalPrice: null, discount: 0, isNew: true, badge: 'Edición fresca', sizes: ['S','M','L','XL'], collection: 'Brisas de Identidad', year: 2026, material: 'Lino y algodón', colors: ['Arena', 'Blanco humo'], shipping: '3-5 días hábiles', care: 'Lavar a mano y secar a la sombra', img: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (11).jfif', hoverImg: '/assets/images/Brisas de Identidad  Fresco, holgado y sostenible (13).jfif', desc: 'Camisa unisex de lino y algodón con una silueta amplia, ligera y fácil de combinar. Los tonos arena y blanco humo acompañan su carácter fresco; lavar a mano y secar a la sombra.', rating: 0, reviews: 0, cut: 'Wide', sustainability: { material: 'Mezcla de lino y algodón', impact: 'Transpirabilidad natural de las fibras', cert: '' } }
        ];

        /* =========================================================
           MÓDULO 2 · VARIABLES GLOBALES DE ESTADO COMPLEMENTARIO
           ========================================================= */
        let favorites = [];
        let currentSort = 'default';
        let searchQuery = '';
        let newsletterSubscribers = [];
        let orderHistory = [];
        let userPreferences = { theme: 'warm', currency: 'COP' };
        let userAccount = null;

        const CART_LIMITS = Object.freeze({ MAX_QTY_PER_ITEM: 20, MAX_TOTAL_ITEMS: 100 });

        function escapeHTML(value) {
            return AnthrosServices.validation.escapeHTML(value);
        }

        function normalizeCartItem(item) {
            if (!item || !Number.isInteger(Number(item.id)) || Number(item.id) < 1) return null;
            const product = PRODUCTS_DATA.find(candidate => candidate.id === Number(item.id));
            const savedProduct = !product && typeof item.name === 'string' && Number.isFinite(Number(item.price)) && Number(item.price) >= 0
                ? item
                : null;
            const source = product || savedProduct;
            if (!source) return null;
            const sizes = Array.isArray(source.sizes) ? source.sizes : [];
            const size = String(item.size || sizes[0] || 'M');
            const qty = Math.min(CART_LIMITS.MAX_QTY_PER_ITEM, Math.max(1, Math.floor(Number(item.qty) || 1)));
            const selectedSize = sizes.length && !sizes.includes(size) ? sizes[0] : size;
            return { ...source, id: Number(item.id), price: Number(source.price), size: selectedSize, qty };
        }

        function normalizeCart(items) {
            if (!Array.isArray(items)) return [];
            const normalized = [];
            let total = 0;
            items.forEach(item => {
                const valid = normalizeCartItem(item);
                if (!valid || total >= CART_LIMITS.MAX_TOTAL_ITEMS) return;
                valid.qty = Math.min(valid.qty, CART_LIMITS.MAX_TOTAL_ITEMS - total);
                const existing = normalized.find(current => current.id === valid.id && current.size === valid.size);
                if (existing) existing.qty = Math.min(CART_LIMITS.MAX_QTY_PER_ITEM, existing.qty + valid.qty);
                else normalized.push(valid);
                total = normalized.reduce((sum, current) => sum + current.qty, 0);
            });
            return normalized;
        }

        function getProductPayload(product, size, qty = 1) {
            const source = PRODUCTS_DATA.find(candidate => candidate.id === Number(product?.id));
            if (!source) return null;
            const selectedSize = source.sizes?.includes(size) ? size : source.sizes?.[0] || 'M';
            return { ...source, size: selectedSize, qty: Math.min(CART_LIMITS.MAX_QTY_PER_ITEM, Math.max(1, Number(qty) || 1)) };
        }

        /* =========================================================
           MÓDULO 3 · FUNCIONES DE CÁLCULO EXTENDIDAS
           Extiende calculos.js original con utilidades avanzadas
           ========================================================= */
        function calcularSubtotalCarrito(cartItems = cart) {
            return cartItems.reduce((s, i) => s + (i.price * i.qty), 0);
        }

        function calcularCantidadCarrito(cartItems = cart) {
            return cartItems.reduce((s, i) => s + i.qty, 0);
        }

        function calcularIVA(valorBase, porcentaje = TAX_CONFIG.IVA_PORCENTAJE) {
            if (TAX_CONFIG.INCLUYE_IVA) return valorBase - (valorBase / (1 + (porcentaje / 100)));
            return valorBase * (porcentaje / 100);
        }

        function calcularBaseGravable(valor, iva = TAX_CONFIG.IVA_PORCENTAJE) {
            return valor / (1 + (iva / 100));
        }

        function calcularPrecioConIVA(precioSinIVA, iva = TAX_CONFIG.IVA_PORCENTAJE) {
            return calcularPrecioConImpuesto(precioSinIVA, iva);
        }

        function calcularEnvio(totalQty, subtotal, tipoEnvio = 'estandar') {
            if (totalQty > SHIPPING_CONFIG.UMBRAL_GRATIS_CANTIDAD) return 0;
            if (subtotal >= SHIPPING_CONFIG.UMBRAL_GRATIS_MONTO) return 0;
            return tipoEnvio === 'express'
                ? SHIPPING_CONFIG.COSTO_EXPRESS
                : SHIPPING_CONFIG.COSTO_ESTANDAR;
        }

        function calcularAhorroTotal(cartItems = cart, appliedPromoPct = appliedPromo) {
            let ahorro = 0;
            cartItems.forEach(item => {
                const prod = PRODUCTS_DATA.find(p => p.id === item.id);
                if (prod && prod.originalPrice) ahorro += (prod.originalPrice - prod.price) * item.qty;
            });
            const subtotal = calcularSubtotalCarrito(cartItems);
            const qty = calcularCantidadCarrito(cartItems);
            const beforePromo = subtotal;
            if (appliedPromoPct) ahorro += beforePromo * (appliedPromoPct / 100);
            const umbral = (subtotal + calcularEnvio(qty, subtotal));
            if (umbral > 100000) ahorro += umbral * 0.10;
            return Math.round(ahorro);
        }

        function calcularDesglosePedidoCompleto(cartItems = cart, appliedPromoPct = appliedPromo, costoEnvioAdicional = null) {
            const subtotal = calcularSubtotalCarrito(cartItems);
            const totalQty = calcularCantidadCarrito(cartItems);
            const shipping = costoEnvioAdicional ?? calcularEnvio(totalQty, subtotal);
            const promoDiscount = appliedPromoPct ? (subtotal * (appliedPromoPct / 100)) : 0;
            const afterPromo = subtotal - promoDiscount;
            const beforeUmbral = afterPromo + shipping;
            const umbralDisc = beforeUmbral > 100000 ? (beforeUmbral * 0.10) : 0;
            const total = beforeUmbral - umbralDisc;
            const ahorro = calcularAhorroTotal(cartItems, appliedPromoPct);
            const iva = calcularIVA(total);
            const baseGrav = calcularBaseGravable(total);
            return {
                subtotal, totalQty, shipping, promoDiscount, appliedPromoPct,
                umbralDisc, total, ahorro, iva, baseGrav, afterPromo, beforeUmbral
            };
        }

        function calcularCuotas(valor, numCuotas = 1, conInteres = true) {
            if (numCuotas <= 0) return { cuota: valor, total: valor, error: 'Número inválido' };
            if (CUOTAS_CONFIG.CUOTAS_SIN_INTERES.includes(numCuotas)) conInteres = false;
            if (numCuotas > CUOTAS_CONFIG.MAX_CUOTAS) numCuotas = CUOTAS_CONFIG.MAX_CUOTAS;
            let total = valor;
            if (conInteres) {
                const i = CUOTAS_CONFIG.INTERES_MENSUAL;
                const n = numCuotas;
                total = valor * Math.pow(1 + i, n);
            }
            return {
                numCuotas,
                cuota: total / numCuotas,
                total,
                conInteres,
                sinInteres: CUOTAS_CONFIG.CUOTAS_SIN_INTERES.includes(numCuotas),
                texto: `${numCuotas}x ${formatPrice(total / numCuotas)}${conInteres ? ' c/interés' : ' sin interés'}`
            };
        } 



        function obtenerCuotasDisponibles(valor, max = CUOTAS_CONFIG.MAX_CUOTAS) {
            return Array.from({ length: max }, (_, i) => i + 1).map(n => calcularCuotas(valor, n));
        }

        function redondearPrecio(precio, base = 50) {
            return Math.round(precio / base) * base;
        }

        function formatearNumero(num, decimales = 0) {
            return Number(num).toLocaleString(APP_CONFIG.LOCALE, {
                minimumFractionDigits: decimales, maximumFractionDigits: decimales
            });
        }

        function calcularPrecioMayorista(precioUnitario, cantidad, umbrales = [
            { qty: 10, pct: 5 }, { qty: 25, pct: 10 }, { qty: 50, pct: 18 }, { qty: 100, pct: 25 }
        ]) {
            const u = [...umbrales].sort((a,b) => b.qty - a.qty);
            const d = u.find(x => cantidad >= x.qty);
            const pct = d ? d.pct : 0;
            const unitarioConDesc = calcularPrecioConDescuento(precioUnitario, pct);
            return {
                porcentaje: pct,
                precioUnitarioMayorista: unitarioConDesc,
                totalMayorista: unitarioConDesc * cantidad
            };
        }

        function calcularRangoDescuento(precio, originalPrice) {
            if (!originalPrice || originalPrice <= precio) return 0;
            return Math.round(100 - ((precio / originalPrice) * 100));
        }

        /* =========================================================
           MÓDULO 4 · FUNCIONES DE PERSISTENCIA (localStorage)
           Aseguran que carrito, favoritos y pedidos no se pierdan
           ========================================================= */
        function soportaStorage() {
            return AnthrosServices.storage.isAvailable();
        }

        function saveCart() {
            if (!soportaStorage()) return;
            const savedCart = AnthrosServices.storage.setJSON(STORAGE_KEYS.CART, normalizeCart(cart));
            if (!savedCart.ok) console.warn('saveCart falló', savedCart.error);
            if (Number.isFinite(appliedPromo) && appliedPromo > 0 && appliedPromoCode &&
                PROMO_CODES[appliedPromoCode] === appliedPromo) {
                const savedPromo = AnthrosServices.storage.set(STORAGE_KEYS.PROMO_APLIED, String(appliedPromo));
                if (!savedPromo.ok) console.warn('No fue posible guardar el descuento', savedPromo.error);
                const savedCode = AnthrosServices.storage.set(STORAGE_KEYS.PROMO_CODE, appliedPromoCode || '');
                if (!savedCode.ok) console.warn('No fue posible guardar el código promocional', savedCode.error);
            } else {
                appliedPromo = null;
                appliedPromoCode = null;
                const removedPromo = AnthrosServices.storage.remove(STORAGE_KEYS.PROMO_APLIED);
                if (!removedPromo.ok) console.warn('No fue posible limpiar el descuento', removedPromo.error);
                const removedCode = AnthrosServices.storage.remove(STORAGE_KEYS.PROMO_CODE);
                if (!removedCode.ok) console.warn('No fue posible limpiar el código promocional', removedCode.error);
            }
        }

        function loadCart() {
            if (!soportaStorage()) return;
            const storedCart = AnthrosServices.storage.getJSON(STORAGE_KEYS.CART);
            if (!storedCart.ok) {
                console.warn('loadCart falló', storedCart.error);
                return;
            }
            if (storedCart.exists) cart = normalizeCart(storedCart.value);
            const storedPromo = AnthrosServices.storage.get(STORAGE_KEYS.PROMO_APLIED);
            if (!storedPromo.ok) {
                console.warn('No fue posible cargar el descuento', storedPromo.error);
                return;
            }
            const promoValue = Number(storedPromo.value);
            const storedCode = AnthrosServices.storage.get(STORAGE_KEYS.PROMO_CODE);
            const code = storedCode.ok ? storedCode.value : '';
            appliedPromoCode = PROMO_CODES[code] === promoValue ? code : null;
            appliedPromo = appliedPromoCode ? promoValue : null;
            saveCart();
        }

        function saveFavorites() {
            if (!soportaStorage()) return;
            try { localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites)); } catch (e) { console.warn(e); }
        }

        function loadFavorites() {
            if (!soportaStorage()) return;
            try {
                const data = localStorage.getItem(STORAGE_KEYS.FAVORITES);
                const parsed = data ? JSON.parse(data) : [];
                favorites = [...new Set(Array.isArray(parsed) ? parsed.map(Number).filter(id => Number.isInteger(id) && id > 0) : [])];
                saveFavorites();
                sincronizarFavoritosUI();
                updateFavoritesCount();
            } catch (e) { console.warn(e); }
        }

        function sincronizarFavoritosUI() {
            const cards = document.querySelectorAll('.product-card');
            cards.forEach(card => {
                const btn = card.querySelector('.product-fav');
                if (!btn) return;
                const id = Number(card.dataset.id);
                const isFavorite = Number.isInteger(id) && id > 0 && favorites.includes(id);
                btn.classList.toggle('active', isFavorite);
                btn.setAttribute('aria-pressed', String(isFavorite));
                btn.setAttribute('aria-label', isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos');
                btn.textContent = isFavorite ? 'Guardado' : '';
            });
        }

        function esFavorito(productId) {
            return favorites.includes(productId);
        }

        function toggleFavoritoById(productId) {
            const idx = favorites.indexOf(productId);
            if (idx >= 0) favorites.splice(idx, 1);
            else favorites.push(productId);
            saveFavorites();
            sincronizarFavoritosUI();
            updateFavoritesCount();
        }

        function saveNewsletterSubscriber(email) {
            if (!soportaStorage() || !email) return false;
            let added = false;
            const result = AnthrosServices.database.updateCollection(STORAGE_KEYS.NEWSLETTER, subscribers => {
                if (subscribers.includes(email)) return subscribers;
                added = true;
                return [...subscribers, email];
            });
            if (!result.ok) {
                console.warn('No fue posible guardar la suscripción local', result.error);
                return false;
            }
            newsletterSubscribers = result.value;
            return added;
        }

        function saveOrderToHistory(confirmedOrder) {
            if (!soportaStorage()) return null;
            try {
                const data = localStorage.getItem(STORAGE_KEYS.ORDER_HISTORY);
                if (data) orderHistory = JSON.parse(data);
                const order = {
                    id: confirmedOrder.id,
                    fecha: confirmedOrder.createdAt,
                    items: confirmedOrder.items,
                    appliedPromo: confirmedOrder.appliedPromo,
                    promoCode: confirmedOrder.promoCode,
                    desglose: confirmedOrder.breakdown,
                    total: confirmedOrder.total,
                    customer: confirmedOrder.customer,
                    payment: confirmedOrder.payment,
                    status: confirmedOrder.status
                };
                orderHistory.unshift(order);
                localStorage.setItem(STORAGE_KEYS.ORDER_HISTORY, JSON.stringify(orderHistory));
                return order;
            } catch (e) { console.warn(e); return null; }
        }

        function getOrderHistory() {
            if (!soportaStorage()) return [];
            try {
                const data = localStorage.getItem(STORAGE_KEYS.ORDER_HISTORY);
                return data ? JSON.parse(data) : [];
            } catch { return []; }
        }

        function saveUserPrefs() {
            if (!soportaStorage()) return;
            try { localStorage.setItem(STORAGE_KEYS.USER_PREFS, JSON.stringify(userPreferences)); }
            catch (e) { console.warn(e); }
        }

        function loadUserPrefs() {
            if (!soportaStorage()) return;
            try {
                const data = localStorage.getItem(STORAGE_KEYS.USER_PREFS);
                if (data) userPreferences = { ...userPreferences, ...JSON.parse(data) };
            } catch (e) { console.warn(e); }
        }

        function saveUserAccount() {
            if (!soportaStorage() || !userAccount) return;
            try { localStorage.setItem(STORAGE_KEYS.ACCOUNT, JSON.stringify(userAccount)); } catch (error) { console.warn('No fue posible guardar la cuenta', error); }
        }

        function loadUserAccount() {
            if (!soportaStorage()) return;
            try {
                const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNT);
                if (stored) userAccount = JSON.parse(stored);
            } catch (error) { console.warn('No fue posible cargar la cuenta', error); }
        }

        function clearAllAnthrosData() {
            if (!soportaStorage()) return;
            const result = AnthrosServices.storage.clear(Object.values(STORAGE_KEYS));
            if (!result.ok) {
                console.warn('No fue posible limpiar los datos locales de Anthros', result.error);
                showToast('No fue posible limpiar los datos guardados', 'error');
                return;
            }
            cart = []; appliedPromo = null; appliedPromoCode = null; favorites = [];
            updateCart(); sincronizarFavoritosUI();
            showToast('Datos de Anthros eliminados', 'info');
        }

        function exportarDatosUsuario() {
            if (!soportaStorage()) return showToast('Almacenamiento no soportado', 'error');
            const exp = {
                exportDate: new Date().toISOString(),
                store: APP_CONFIG.STORE_NAME,
                cart, favorites, appliedPromo,
                newsletterSubscribers: getOrderHistory(),
                userPreferences
            };
            AnthrosServices.document.downloadJSON(`anthros-datos-${Date.now()}.json`, exp);
            showToast('Resumen exportado', 'success');
        }

        /* =========================================================
           MÓDULO 5 · FUNCIONES UX / UI EXTENDIDAS
           Búsqueda, orden, validaciones, WhatsApp, FAQs, etc.
           ========================================================= */
        function validateEmail(email) {
            return AnthrosServices.validation.email(email);
        }

        function validatePhone(phone) {
            return AnthrosServices.validation.phone(phone);
        }

        function validateRequired(value, minLen = 2, maxLen = 200) {
            return AnthrosServices.validation.required(value, minLen, maxLen);
        }

        function copyToClipboard(text) {
            return AnthrosServices.document.copyText(text).then(() => {
                showToast(`Copiado: ${text}`, 'info');
            }).catch(error => {
                console.warn('No fue posible copiar al portapapeles', error);
                showToast('No fue posible copiar al portapapeles', 'error');
            });
        }

        function buscarProducto(query) {
            searchQuery = String(query || '').toLowerCase().trim();
            if (searchQuery.length > 1) recordRecommendationAction({ type: 'query', value: searchQuery });
            return applyCatalogFilters();
        }

        function ordenarProductos(criterio = 'default') {
            currentSort = criterio;
            const grid = document.getElementById('productsGrid');
            if (!grid) return;
            const cardsArr = Array.from(grid.querySelectorAll('.product-card'));
            const getPrecio = (card) => Number(card.querySelector('.product-price')?.textContent.replace(/[^0-9]/g, '') || 0);
            const getNombre = (card) => card.querySelector('.product-name')?.textContent || '';
            const getDescuento = (card) => {
                const badge = card.querySelector('.product-badge.discount')?.textContent || '';
                const match = badge.match(/-(\d+)/);
                return match ? Number(match[1]) : 0;
            };
            const esNuevo = (card) => card.querySelector('.product-badge:not(.discount)')?.textContent?.includes('Nuevo');
            switch (criterio) {
                case 'price-asc':  cardsArr.sort((a,b) => getPrecio(a) - getPrecio(b)); break;
                case 'price-desc': cardsArr.sort((a,b) => getPrecio(b) - getPrecio(a)); break;
                case 'name-asc':   cardsArr.sort((a,b) => getNombre(a).localeCompare(getNombre(b), 'es')); break;
                case 'name-desc':  cardsArr.sort((a,b) => getNombre(b).localeCompare(getNombre(a), 'es')); break;
                case 'discount':   cardsArr.sort((a,b) => getDescuento(b) - getDescuento(a)); break;
                case 'news':       cardsArr.sort((a,b) => Number(esNuevo(b)) - Number(esNuevo(a))); break;
                default:           cardsArr.sort((a,b) => Number(a.dataset.id || 0) - Number(b.dataset.id || 0));
            }
            cardsArr.forEach(card => grid.appendChild(card));
        }

        function contarProductosPorCategoria() {
            const res = {};
            document.querySelectorAll('.product-card').forEach(card => {
                const cats = (card.dataset.category || 'all').split(/\s+/);
                cats.forEach(c => { res[c] = (res[c] || 0) + 1; });
                res['all'] = (res['all'] || 0) + 1;
            });
            return res;
        }

        function obtenerResumenTienda() {
            const desglose = calcularDesglosePedidoCompleto();
            return {
                totalProductos: PRODUCTS_DATA.length,
                categoriasDisponibles: Object.keys(contarProductosPorCategoria()).length - 1,
                carritoCantidad: calcularCantidadCarrito(),
                carritoSubtotal: desglose.subtotal,
                carritoTotal: desglose.total,
                ahorroAcumulado: desglose.ahorro,
                favoritosCantidad: favorites.length
            };
        }

        function generarMensajeWhatsAppCarrito(numero = APP_CONFIG.WHATSAPP) {
            if (cart.length === 0) return showToast('Tu carrito está vacío', 'error');
            const desglose = calcularDesglosePedidoCompleto();
            return AnthrosServices.integrations.whatsappOrderLink({
                phone: numero,
                items: cart,
                total: desglose.total
            });
        }

        function enviarPedidoPorWhatsApp() {
            const url = generarMensajeWhatsAppCarrito();
            if (!url) return;
            window.open(url, '_blank', 'noopener,noreferrer');
            showToast('Abriendo WhatsApp con tu pedido...', 'success');
        }

        function compartirProducto(productId, red = 'wa') {
            const prod = PRODUCTS_DATA.find(p => p.id === productId);
            if (!prod) return;
            const text = encodeURIComponent(`¡Mira esta prenda de ANTHROS!  ${prod.name} · ${formatPrice(prod.price)} · ${APP_CONFIG.DOMINIO}/#producto-${prod.id}`);
            let url = '';
            if (red === 'wa') url = `https://wa.me/?text=${text}`;
            else if (red === 'fb') url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_CONFIG.DOMINIO + '/#producto-' + prod.id)}&quote=${text}`;
            else if (red === 'copy') return copyToClipboard(decodeURIComponent(text));
            if (url) window.open(url, '_blank', 'noopener,noreferrer');
        }

        function generarCodigoPromoAleatorio(longitud = 8) {
            const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < longitud; i++) code += chars[Math.floor(Math.random() * chars.length)];
            return `ANTHROS-${code}`;
        }

        function mostrarSimuladorCuotas(valor) {
            const cuotas = obtenerCuotasDisponibles(valor, 6);
            const msg = cuotas.map(c => c.texto).join('%0A');
            showToast('Cuotas calculadas. Abre la consola para ver detalles.', 'info');
            console.table(cuotas.map(c => ({
                Cuotas: c.numCuotas,
                'Valor cuota': formatPrice(c.cuota),
                'Total': formatPrice(c.total),
                '¿Sin interés?': c.sinInteres ? 'SÍ' : 'NO'
            })));
            return cuotas;
        }

        function showFAQModal() {
            const html = FAQ_DATA.map(f => `<div style="margin-bottom:14px;"><strong style="color:var(--red-primary);"> ${f.q}</strong><p style="color:var(--text-muted);margin-top:4px;">${f.a}</p></div>`).join('');
            const modal = document.createElement('div');
            modal.id = 'faqModal';
            modal.setAttribute('role','dialog');
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(55,6,23,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:1000000;display:flex;align-items:center;justify-content:center;padding:20px;';
            modal.innerHTML = `
                <div style="background:var(--cream-light);border-radius:var(--radius-lg);padding:28px;max-width:560px;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px var(--shadow-xl);width:100%;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                        <h3 style="font-family:var(--font-display);color:var(--red-deep);font-size:var(--fs-xl);"> Preguntas Frecuentes</h3>
                        <button onclick="closeFAQModal()" aria-label="Cerrar FAQ" style="width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,0.05);font-size:1.3rem;cursor:pointer;"></button>
                    </div>
                    ${html}
                </div>
            `;
            modal.addEventListener('click', e => { if (e.target === modal) closeFAQModal(); });
            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden';
            document.addEventListener('keydown', function escFAQ(e) {
                if (e.key === 'Escape') { closeFAQModal(); document.removeEventListener('keydown', escFAQ); }
            });
        }

        function closeFAQModal() {
            const m = document.getElementById('faqModal');
            if (m) { m.remove(); document.body.style.overflow = ''; }
        }

        function showGenericModal(titulo, contenidoHTML, onClose = null) {
            const modal = document.createElement('div');
            modal.id = 'genericModal';
            modal.setAttribute('role','dialog');
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(55,6,23,0.55);backdrop-filter:blur(8px);z-index:1000001;display:flex;align-items:center;justify-content:center;padding:20px;';
            modal.innerHTML = `
                <div style="background:var(--cream-light);border-radius:var(--radius-lg);padding:26px;max-width:520px;width:100%;box-shadow:0 20px 60px var(--shadow-xl);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                        <h3 style="font-family:var(--font-display);color:var(--red-deep);font-size:var(--fs-lg);">${titulo}</h3>
                        <button onclick="closeGenericModal()" style="width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.05);font-size:1.2rem;cursor:pointer;"></button>
                    </div>
                    <div>${contenidoHTML}</div>
                </div>
            `;
            modal.addEventListener('click', e => { if (e.target === modal) closeGenericModal(); });
            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden';
            window._genericModalOnClose = onClose;
        }

        function closeGenericModal() {
            const m = document.getElementById('genericModal');
            if (m) {
                m.remove();
                document.body.style.overflow = '';
                if (typeof window._genericModalOnClose === 'function') {
                    try { window._genericModalOnClose(); } catch (e) {}
                }
                window._genericModalOnClose = null;
            }
        }

        function generateProductCardHTML(prod) {
            const productId = Number(prod.id);
            const badge = prod.badge
                ? `<span class="product-badge ${prod.badge.includes('%') ? 'discount' : ''}">${escapeHTML(prod.badge)}</span>`
                : '';
            const material = prod.material ? `<span class="product-material-tag">${escapeHTML(prod.material)}</span>` : '';
            const cutTag = prod.cut ? `<span class="product-cut-tag">${escapeHTML(prod.cut)}</span>` : '';
            const sizes = (prod.sizes || ['S','M','L']).map(s => `<div class="size-option" onclick="selectSize(this)">${escapeHTML(s)}</div>`).join('');
            const precioOriginal = prod.originalPrice
                ? `<span class="product-price-original">${formatPrice(prod.originalPrice)}</span>` : '';
            const hoverImg = prod.hoverImg ? resolveImageUrl(prod.hoverImg) : resolveImageUrl(prod.img);
            return `
                <article class="product-card reveal" data-category="${escapeHTML(prod.category)}" data-id="${productId}" data-price="${prod.price}" data-discount="${prod.discount || 0}" data-year="${prod.year || ''}" data-collection="${escapeHTML(prod.collection || '')}" data-cut="${escapeHTML(prod.cut || '')}" data-eclipse-mode="${escapeHTML(prod.eclipseMode || '')}" data-sizes="${escapeHTML((prod.sizes || []).join(','))}">
                    ${badge}
                    <button class="product-fav" onclick="toggleFav(this)" aria-label="Añadir a favoritos"></button>
                    <div class="product-image" onclick="goToProduct(${productId})" role="link" tabindex="0" onkeydown="if(event.key==='Enter')goToProduct(${productId})">
                        <img class="product-img-base" src="${escapeHTML(resolveImageUrl(prod.img))}" alt="${escapeHTML(prod.name)}" loading="lazy">
                        <img class="product-img-hover" src="${escapeHTML(hoverImg)}" alt="${escapeHTML(prod.name)} en modelo" loading="lazy" aria-hidden="true">
                        ${material}
                        ${cutTag}
                        <button class="quick-view-btn" onclick="event.stopPropagation();goToProduct(${productId})" aria-label="Ver detalles de ${escapeHTML(prod.name)}">Ver producto </button>
                    </div>
                    <div class="product-info">
                        <div class="product-category">${escapeHTML(prod.gender)} · ${escapeHTML(prod.line)}</div>
                        <h3 class="product-name" onclick="goToProduct(${productId})">${escapeHTML(prod.name)}</h3>
                        <p class="product-description">${escapeHTML(prod.desc)}</p>
                        <div class="product-size">${sizes}</div>
                        <div class="product-footer">
                            <div class="price-container">
                                ${precioOriginal}
                                <span class="product-price">${formatPrice(prod.price)}</span>
                            </div>
                            <button class="add-to-cart-btn" onclick="addProductById(${productId}, event)" aria-label="Añadir al carrito">+</button>
                        </div>
                    </div>
                </article>
            `;
        }

        function addProductById(productId, eventObject) {
            const product = PRODUCTS_DATA.find(item => item.id === Number(productId));
            if (!product) return showToast('Producto no disponible', 'error');
            addToCart(product, eventObject);
        }

        function renderProductsFromData(products = PRODUCTS_DATA) {
            const grid = document.getElementById('productsGrid');
            if (!grid) return;
            grid.innerHTML = products.map(generateProductCardHTML).join('');
            document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
            sincronizarFavoritosUI();
            renderRecommendations();
        }

        /* ============================================================
           MÓDULO · MágicoBot (Asistente conversacional de ANTHROS)
           ------------------------------------------------------------
           Envía consultas a la ruta de IA del servidor y conserva la
           guía local como respaldo si la API no está disponible.
           ============================================================ */
        function initializeAssistantWidget() {
            if (document.getElementById('anthrosAssistant')) return;

            const widget = document.createElement('aside');
            widget.className = 'assistant-widget';
            widget.id = 'anthrosAssistant';
            widget.innerHTML = `
                <section class="assistant-panel" id="assistantPanel" aria-labelledby="assistantTitle" hidden>
                    <header class="assistant-header">
                        <div>
                            <span class="assistant-status">Listo para ayudarte</span>
                            <h2 id="assistantTitle">MágicoBot</h2>
                        </div>
                        <button class="assistant-close" type="button" aria-label="Cerrar asistente">×</button>
                    </header>
                    <p class="assistant-intro">Soy MágicoBot, el asistente de ANTHROS. Pregúntame por productos, tallas, envíos o sostenibilidad.</p>
                    <p class="assistant-preview-note" id="assistantFeedback" role="status" aria-live="polite">
                        Puedo orientarte con información de la marca, las colecciones y la tienda.
                    </p>
                    <form class="assistant-form">
                        <label class="assistant-sr-only" for="assistantMessage">Escribe tu consulta</label>
                        <input id="assistantMessage" name="message" type="text" maxlength="500" placeholder="Ej: ¿Qué camisas de lino tienen?" autocomplete="off">
                        <button type="submit">Enviar</button>
                    </form>
                </section>
                <button class="assistant-launcher" type="button" aria-expanded="false" aria-controls="assistantPanel">
                    <span aria-hidden="true">✦</span> MágicoBot
                </button>
            `;
            document.body.append(widget);

            const panel = widget.querySelector('#assistantPanel');
            const launcher = widget.querySelector('.assistant-launcher');
            const messageField = widget.querySelector('#assistantMessage');
            const feedback = widget.querySelector('#assistantFeedback');
            const closeButton = widget.querySelector('.assistant-close');
            const chatHistory = [];

            function setAssistantOpen(isOpen) {
                panel.hidden = !isOpen;
                launcher.setAttribute('aria-expanded', String(isOpen));
                if (isOpen) messageField.focus();
                else launcher.focus();
            }

            launcher.addEventListener('click', () => setAssistantOpen(panel.hidden));
            closeButton.addEventListener('click', () => setAssistantOpen(false));
            widget.querySelector('.assistant-form').addEventListener('submit', async event => {
                event.preventDefault();
                const message = messageField.value.trim();
                if (!message) return;

                const submitButton = widget.querySelector('.assistant-form button[type="submit"]');
                const localAnswer = findAssistantAnswer(message);
                feedback.textContent = 'Un momento, estoy buscando la mejor respuesta...';
                messageField.disabled = true;
                submitButton.disabled = true;
                chatHistory.push({ role: 'user', content: message });
                try {
                    const result = await AnthrosServices.api.chat({
                        messages: chatHistory.slice(-10)
                    });
                    const answer = result.fallback ? localAnswer : result.answer;
                    chatHistory.push({ role: 'assistant', content: answer });
                    feedback.textContent = result.fallback
                        ? `${localAnswer} (Respuesta de la guía local; el asistente de IA no está disponible ahora.)`
                        : answer;
                    window.dispatchEvent(new CustomEvent('anthros:assistant-message', {
                        detail: { message, answer }
                    }));
                    messageField.value = '';
                } catch (error) {
                    console.warn('No fue posible consultar el asistente de IA:', error.message);
                    chatHistory.push({ role: 'assistant', content: localAnswer });
                    feedback.textContent = `${localAnswer} (Respuesta de la guía local; el asistente de IA no está disponible ahora.)`;
                    window.dispatchEvent(new CustomEvent('anthros:assistant-message', {
                        detail: { message, answer: localAnswer, error }
                    }));
                } finally {
                    messageField.disabled = false;
                    submitButton.disabled = false;
                    messageField.focus();
                }
            });
            widget.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !panel.hidden) setAssistantOpen(false);
            });
        }

        function normalizeAssistantText(value) {
            return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        }

        function findAssistantAnswer(message) {
            const knowledge = window.AnthrosKnowledge;
            const loaded = knowledge?.load();
            if (!loaded || loaded.error) {
                console.warn('No se pudo cargar la guía local del asistente', loaded?.error);
            }
            const normalizedMessage = normalizeAssistantText(message);
            const terms = normalizedMessage.split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2);
            const entries = loaded?.entries || [];
            const match = entries
                .map(entry => {
                    const searchable = normalizeAssistantText(`${entry.question} ${entry.keywords.join(' ')}`);
                    const score = entry.keywords.reduce((total, keyword) => {
                        const term = normalizeAssistantText(keyword);
                        return total + (term && normalizedMessage.includes(term) ? 3 : 0);
                    }, 0) + terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
                    return { entry, score };
                })
                .sort((left, right) => right.score - left.score)[0];
            if (match?.score > 0) return match.entry.answer;

            const productMatches = PRODUCTS_DATA.filter(product => {
                const searchable = normalizeAssistantText(`${product.name} ${product.collection} ${product.material}`);
                return terms.some(term => searchable.includes(term));
            }).slice(0, 3);
            if (productMatches.length) {
                return `Puedo recomendarte: ${productMatches.map(product => `${product.name} (${formatPrice(product.price)}; ${product.collection}; tallas ${(product.sizes || []).join(', ')})`).join(' · ')}. Revisa el catálogo para ver los detalles y la disponibilidad.`;
            }
            return 'No encuentro una respuesta confirmada en la guía de Anthros. Prueba con otra pregunta o escríbenos a hola@anthros.com.';
        }

        function goToProduct(productId) {
            const product = PRODUCTS_DATA.find(item => item.id === Number(productId));
            if (!product) return showToast('Producto no encontrado', 'error');
            recordRecommendationAction({ type: 'view', productId: product.id });
            window.location.href = `./producto.html?id=${product.id}`;
        }

        /* =========================================================
           MÓDULO 6 · LISTENERS Y AUTO-EJECUCIÓN
           Integración con el flujo existente
           ========================================================= */
        window.addEventListener('beforeunload', () => { saveCart(); saveFavorites(); saveUserPrefs(); });
        window.addEventListener('pagehide',    () => { saveCart(); saveFavorites(); });
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                const inp = prompt(' Buscar productos en ANTHROS:');
                if (inp !== null) {
                    const encontrados = buscarProducto(inp);
                    showToast(`${encontrados} producto(s) encontrado(s)`, encontrados ? 'success' : 'info');
                }
            }
        });

        (function inicializarModulosNuevos() {
            if (!soportaStorage()) return;
            loadUserPrefs();
            loadUserAccount();
            try {
                const data = localStorage.getItem(STORAGE_KEYS.NEWSLETTER);
                if (data) newsletterSubscribers = JSON.parse(data);
            } catch {}
            try {
                const data = localStorage.getItem(STORAGE_KEYS.ORDER_HISTORY);
                if (data) orderHistory = JSON.parse(data);
            } catch {}
        })();

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    en.target.classList.add('visible');
                    observer.unobserve(en.target);
                }
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('cartModal');
                if (modal.classList.contains('open')) toggleCart();
                closeQuickView();
                closeSizeGuideModal();
                if (menuOpen) closeMobileMenu();
            }
        });

        /* =========================================================
           MÓDULO 7 · NUEVAS FUNCIONES UI (FALTANTES)
           navigateTo, toggleTheme, search, filters, modals, etc.
           ========================================================= */
        const _debouncedProductSearch = AnthrosServices.process.debounce(value => {
            const count = buscarProducto(value);
            const label = AnthrosServices.document.byId('searchResultsCount');
            if (!label) return;
            label.style.display = value ? 'block' : 'none';
            label.textContent = count ? ` ${count} producto(s) encontrado(s)` : ` No se encontraron productos para "${value}"`;
            label.style.color = count ? 'var(--success)' : 'var(--red-primary)';
        }, 280);
        let _currentViewMode = 'grid';
        let _currentPriceMax = 500000;
        const _catalogFilters = { category: 'all', year: 'all', collection: 'all', cut: 'all', size: 'all', offers: false };
        let _testimonialIndex = 0;
        let _testimonialAutoTimer = null;
        let _heroIndex = 0;
        let _heroTimer = null;
        let _heroTransitionTimer = null;
        let _countdownTarget = null;
        let _quickViewData = { productId: null, qty: 1, size: null };
        let _emptyCartSlide = 0;
        let _emptyCartTimer = null;

        const HERO_SLIDES = Object.freeze([
            { image: './assets/images/Brisas de Identidad  Fresco, holgado y sostenible (1).jfif', label: 'Anthros / 01' },
            { image: './assets/images/Brisas de Identidad  Fresco, holgado y sostenible (4).jfif', label: 'Anthros / 02' },
            { image: './assets/images/camiseta-mujer-manga-larga-de-algodon-ecologico.jpg.webp', label: 'Anthros / 03' }
        ]);

        function renderHeroSlide() {
            const hero = document.querySelector('.hero-carousel-shell');
            const dots = document.getElementById('heroCarouselDots');
            if (!hero || !dots) return;
            const slide = HERO_SLIDES[_heroIndex];
            hero.querySelectorAll('.hero-slide-media.is-active').forEach(image => {
                image.classList.remove('is-active');
                image.classList.add('is-leaving');
            });
            const image = document.createElement('div');
            image.className = 'hero-slide-media is-active';
            image.setAttribute('aria-hidden', 'true');
            image.style.backgroundImage = `linear-gradient(90deg, rgba(91, 27, 43, 0.82) 0%, rgba(91, 27, 43, 0.55) 46%, rgba(91, 27, 43, 0.12) 100%), url("${slide.image}")`;
            hero.appendChild(image);
            clearTimeout(_heroTransitionTimer);
            _heroTransitionTimer = setTimeout(() => {
                hero.querySelectorAll('.hero-slide-media:not(.is-active)').forEach(previous => previous.remove());
            }, 900);
            dots.innerHTML = HERO_SLIDES.map((item, index) => `<button type="button" class="hero-carousel-dot ${index === _heroIndex ? 'active' : ''}" onclick="setHeroSlide(${index})" aria-label="Ir a ${item.label}"></button>`).join('');
        }

        function setHeroSlide(index) {
            _heroIndex = (index + HERO_SLIDES.length) % HERO_SLIDES.length;
            renderHeroSlide();
        }

        function changeHeroSlide(direction) {
            setHeroSlide(_heroIndex + direction);
            restartHeroTimer();
        }

        function restartHeroTimer() {
            clearInterval(_heroTimer);
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            _heroTimer = setInterval(() => {
                if (!document.hidden) setHeroSlide(_heroIndex + 1);
            }, 3000);
        }

        function initHeroCarousel() {
            const hero = document.querySelector('.hero-carousel-shell');
            if (!hero) return;
            renderHeroSlide();
            restartHeroTimer();
        }

        /* 1) NAVIGATE MPA (navegación real entre páginas) */
        function navigateTo(section, anchorId = null) {
            const pages = {
                home: 'index.html',
                productos: 'catalogo.html',
                catalogo: 'catalogo.html',
                coleccion: 'catalogo.html',
                nosotros: 'nosotros.html',
                cart: 'carrito.html',
                carrito: 'carrito.html',
                checkout: 'carrito.html',
                favorites: 'favoritos.html',
                favoritos: 'favoritos.html',
                orders: 'pedidos.html',
                pedidos: 'pedidos.html',
                howtobuy: 'index.html#howtobuy',
                contacto: 'index.html#contacto'
            };
            let target = pages[section] || 'index.html';
            if (anchorId && target.includes('#') === false) {
                target = target + '#' + anchorId;
            }
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            const targetPage = target.split('#')[0];
            if (targetPage === 'index.html' && (!currentPage || currentPage === 'index.html') && target.includes('#')) {
                closeMobileMenu();
                if (AnthrosServices.navigation.goToAnchor(decodeURIComponent(target.split('#')[1]))) return;
            }
            AnthrosServices.navigation.navigate(target, { beforeNavigate: closeMobileMenu });
        }

        /* 2) TOGGLE TEMA CLARO / OSCURO */
        function toggleTheme() {
            const root = document.documentElement;
            const isDark = root.classList.toggle('theme-dark');
            userPreferences.theme = isDark ? 'dark' : 'warm';
            updateThemeControls();
            saveUserPrefs();
            showToast(isDark ? ' Tema oscuro activado' : ' Tema cálido activado', 'info');
        }

        function updateThemeControls() {
            const isDark = document.documentElement.classList.contains('theme-dark');
            document.querySelectorAll('.theme-toggle, #mobileThemeToggle').forEach(button => {
                button.textContent = isDark ? 'Tema claro' : 'Tema oscuro';
                button.setAttribute('aria-label', isDark ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro');
                button.setAttribute('aria-pressed', String(isDark));
                button.title = isDark ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro';
            });
        }

        function setEclipseMode(mode) {
            if (mode !== 'day' && mode !== 'night') return;
            const section = document.getElementById('eclipse');
            const image = section?.querySelector('.eclipse-visual img');
            const description = document.getElementById('eclipseDescription');
            const caption = section?.querySelector('[data-eclipse-caption]');
            if (!section || !image || !description || !caption) return;

            const isNight = mode === 'night';
            section.dataset.mode = mode;
            image.src = isNight ? image.dataset.nightImage : image.dataset.dayImage;
            description.textContent = isNight
                ? 'Filo y Fuego. Contrastes profundos, capas esenciales y una energía que despierta cuando cae el sol.'
                : 'Sombra y Tierra. Siluetas relajadas, texturas honestas y una luz que acompaña el ritmo de la ciudad.';
            caption.textContent = isNight ? 'Filo y Fuego' : 'Sombra y Tierra';
            section.querySelectorAll('[data-eclipse-mode]').forEach(button => {
                const active = button.dataset.eclipseMode === mode;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', String(active));
            });

            // Filtrar la cuadrícula de productos por modo de Eclipse Urbano
            const grid = document.getElementById('productsGrid');
            if (grid) {
                const eclipseProducts = PRODUCTS_DATA.filter(p => p.collection === 'Eclipse Urbano' && p.eclipseMode === mode);
                const productsToShow = eclipseProducts.length ? eclipseProducts : PRODUCTS_DATA.filter(p => p.collection === 'Eclipse Urbano');
                renderProductsFromData(productsToShow);
                showToast(isNight ? 'Mostrando Eclipse Urbano · Noche' : 'Mostrando Eclipse Urbano · Día', 'info');
            }
        }

        /* 3) SCROLL PROGRESS BAR */
        function updateScrollProgress() {
            const bar = document.getElementById('scrollProgress');
            if (!bar) return;
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const pct = height > 0 ? Math.min(100, (scrollTop / height) * 100) : 0;
            bar.style.width = pct + '%';
        }
        window.addEventListener('scroll', updateScrollProgress, { passive: true });
        window.addEventListener('resize', updateScrollProgress, { passive: true });

        /* 4) BÚSQUEDA (debounce) */
        function onSearchInput(value) {
            _debouncedProductSearch(value);
        }
        function executeSearch() {
            const input = document.getElementById('searchInput');
            if (!input) return;
            onSearchInput(input.value);
            showToast('Búsqueda ejecutada ', 'info');
        }

        /* 5) SORT PRODUCTOS (wrapper para <select>) */
        function sortProducts(criterio) {
            ordenarProductos(criterio);
            const label = criterio ? SORT_OPTIONS.find(s => s.value === criterio)?.label : 'Por defecto';
            if (criterio && criterio !== 'default') showToast(`Ordenado: ${label}`, 'info');
        }

        /* 6) VIEW MODE (GRID / LISTA) */
        function setViewMode(mode, btn) {
            _currentViewMode = mode === 'list' ? 'list' : 'grid';
            const grid = document.getElementById('productsGrid');
            if (grid) grid.classList.toggle('list-mode', _currentViewMode === 'list');
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
        }

        /* 7) FILTRO RANGO DE PRECIOS */
        function onPriceFilterChange(value) {
            _currentPriceMax = Number(value) || 500000;
            const label = document.getElementById('priceRangeLabel');
            if (label) label.textContent = formatearNumero(_currentPriceMax);
            return applyCatalogFilters();
        }

        function applyCatalogFilters() {
            const cards = document.querySelectorAll('.product-card');
            let countVisible = 0;
            cards.forEach(card => {
                const precio = Number(card.dataset.price || 0);
                const nombre = (card.querySelector('.product-name')?.textContent || '').toLowerCase();
                const categoria = (card.dataset.category || '').toLowerCase();
                const descripcion = (card.querySelector('.product-description')?.textContent || '').toLowerCase();
                const matchesSearch = !searchQuery || nombre.includes(searchQuery) || categoria.includes(searchQuery) || descripcion.includes(searchQuery);
                const matchesCategory = _catalogFilters.category === 'all' || categoria.includes(_catalogFilters.category);
                const matchesYear = _catalogFilters.year === 'all' || card.dataset.year === _catalogFilters.year;
                const matchesCollection = _catalogFilters.collection === 'all' || card.dataset.collection === _catalogFilters.collection;
                const matchesCut = _catalogFilters.cut === 'all' || card.dataset.cut === _catalogFilters.cut;
                const matchesSize = _catalogFilters.size === 'all' || (card.dataset.sizes || '').split(',').includes(_catalogFilters.size);
                const matchesOffers = !_catalogFilters.offers || Number(card.dataset.discount || 0) > 0 || card.querySelector('.product-badge.discount');
                const show = matchesSearch && matchesCategory && matchesYear && matchesCollection && matchesCut && matchesSize && matchesOffers && precio <= _currentPriceMax;
                if (show) {
                    countVisible++;
                    card.style.display = '';
                    setTimeout(() => { card.style.opacity = '1'; card.style.transform = 'scale(1)'; }, 30);
                } else {
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.92) translateY(6px)';
                    setTimeout(() => { card.style.display = 'none'; }, 260);
                }
            });
            const resultLabel = document.getElementById('searchResultsCount');
            if (resultLabel && (searchQuery || _catalogFilters.category !== 'all' || _catalogFilters.year !== 'all' || _catalogFilters.collection !== 'all' || _catalogFilters.cut !== 'all' || _catalogFilters.size !== 'all' || _catalogFilters.offers || _currentPriceMax < 500000)) {
                resultLabel.style.display = 'block';
                resultLabel.textContent = `${countVisible} producto(s) coinciden con tus filtros`;
                resultLabel.style.color = countVisible ? 'var(--success)' : 'var(--red-primary)';
            }
            return countVisible;
        }

        function updateAdvancedFilter(name, value) {
            if (name === 'offers') _catalogFilters.offers = Boolean(value);
            else _catalogFilters[name] = value || 'all';
            applyCatalogFilters();
        }

        function clearCatalogFilters() {
            Object.assign(_catalogFilters, { category: 'all', year: 'all', collection: 'all', cut: 'all', size: 'all', offers: false });
            _currentPriceMax = 500000;
            ['catalogYear', 'catalogCollection', 'catalogCut', 'catalogSize'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 'all'; });
            const range = document.getElementById('priceRangeFilter');
            if (range) range.value = '500000';
            const offers = document.getElementById('offersOnly');
            if (offers) offers.checked = false;
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all'));
            applyCatalogFilters();
        }

        /* Las medidas publicadas son orientativas y se basan en la tabla oficial compartida para ANTHROS. */
        const SIZE_GUIDES = Object.freeze({
            'Brisas de Identidad': {
                title: 'Brisas de Identidad · corte recto y fresco',
                headers: ['Talla', 'Pecho (cm)', 'Largo de prenda (cm)', 'Hombros (cm)'],
                rows: [['S', 100, 70, 44], ['M', 106, 72, 46], ['L', 112, 74, 48]],
                note: 'Medidas orientativas para lino y algodón natural.'
            },
            'Eclipse Urbano': {
                title: 'Eclipse Urbano · Oversize / Wide Fit',
                headers: ['Talla', 'Hombro caído (cm)', 'Largo (cm)', 'Manga (cm)'],
                rows: [['S', 54, 74, 58], ['M', 57, 76, 60], ['L', 60, 78, 62]],
                note: 'Medidas orientativas para una caída amplia. La ficha oficial no precisa si la medida de manga corresponde al ancho o al largo.'
            }
        });

        /* 8) MODAL GUÍA DE TALLAS */
        function showSizeGuideModal(productId) {
            const product = PRODUCTS_DATA.find(item => item.id === Number(productId));
            const guide = SIZE_GUIDES[product?.collection];
            const headers = guide?.headers.map(value => `<th>${escapeHTML(value)}</th>`).join('') || '';
            const rows = guide?.rows.map(row => `<tr>${row.map(value => `<td>${escapeHTML(value)}</td>`).join('')}</tr>`).join('') || '';
            let modal = document.getElementById('sizeGuideModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'sizeGuideModal';
                modal.className = 'size-guide-modal';
                modal.addEventListener('click', e => { if (e.target === modal) closeSizeGuideModal(); });
                modal.innerHTML = `
                    <div class="size-guide-panel">
                        <button class="sg-close" onclick="closeSizeGuideModal()" aria-label="Cerrar guía de tallas"></button>
                        <h3 id="sizeGuideTitle">${guide ? escapeHTML(guide.title) : 'Guía de medidas ANTHROS'}</h3>
                        ${guide ? `
                            <p class="size-guide-note">${escapeHTML(guide.note)} Estas medidas son orientativas; compara una prenda similar antes de elegir.</p>
                            <div class="size-guide-scroll">
                                <table class="size-guide-table">
                                    <thead><tr>${headers}</tr></thead>
                                    <tbody>${rows}</tbody>
                                </table>
                            </div>
                        ` : '<p class="size-guide-note">Aún no hay una tabla de medidas verificada para esta colección. Escríbenos y te ayudaremos a elegir.</p>'}
                        <div class="size-guide-note">Producción local e independiente en talleres de Bogotá y Medellín, bajo principios de comercio justo y sostenibilidad.</div>
                        <div class="size-guide-actions">
                            <button class="qv-btn-primary" onclick="closeSizeGuideModal()">Entendido</button>
                            <button class="qv-btn-secondary" onclick="closeSizeGuideModal();navigateTo('home','productos');">Ver productos</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function closeSizeGuideModal() {
            const m = document.getElementById('sizeGuideModal');
            if (m) { m.classList.remove('open'); if (!isCartOpen() && !isQuickViewOpen()) document.body.style.overflow = ''; }
        }
        function isCartOpen() { return document.getElementById('cartModal')?.classList.contains('open'); }
        function isQuickViewOpen() { return document.getElementById('quickViewModal')?.classList.contains('open'); }

        /* 9) QUICK VIEW MODAL */
        function openQuickView(productId) {
            const prod = PRODUCTS_DATA.find(p => p.id === Number(productId));
            if (!prod) return showToast('Producto no encontrado', 'error');
            recordRecommendationAction({ type: 'view', productId: prod.id });
            _quickViewData = { productId: prod.id, qty: 1, size: prod.sizes?.[1] || 'M' };
            let modal = document.getElementById('quickViewModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'quickViewModal';
                modal.className = 'quick-view-modal';
                modal.addEventListener('click', e => { if (e.target === modal) closeQuickView(); });
                document.body.appendChild(modal);
            }
            const starsHtml = `Calificación ${prod.rating || 0}/5`;
            const sizesHtml = (prod.sizes || ['S','M','L']).map((s, idx) =>
                `<div class="size-option ${s === _quickViewData.size ? 'selected' : ''}" onclick="qvSelectSize('${s}', this)">${s}</div>`
            ).join('');
            const priceOrigHtml = prod.originalPrice
                ? `<span class="qv-price-orig">${formatPrice(prod.originalPrice)}</span>
                   <span style="display:inline-block;padding:3px 10px;border-radius:var(--radius-full);background:rgba(230,57,70,0.12);color:var(--red-primary);font-weight:800;font-size:var(--fs-xs);">-${prod.discount}%</span>`
                : '';
            modal.innerHTML = `
                <div class="quick-view-panel">
                    <button class="qv-close" onclick="closeQuickView()" aria-label="Cerrar vista rápida"></button>
                    <div class="qv-image-wrap"><img src="${escapeHTML(resolveImageUrl(prod.img))}" alt="${escapeHTML(prod.name)}" loading="lazy"></div>
                    <div class="qv-info">
                        <div class="qv-cat">${escapeHTML(prod.gender)} · ${escapeHTML(prod.line)}${prod.isNew ? ' · <span style=\\"color:var(--red-primary);\\">NUEVO</span>' : ''}</div>
                        <h3 class="qv-name">${escapeHTML(prod.name)}</h3>
                        <div class="qv-rating">
                            <div class="rating-stars" style="font-size:1rem;">${starsHtml}</div>
                            <span class="rating-count">(${prod.reviews || 0} reseñas)</span>
                        </div>
                        <div class="qv-price-row">
                            <span class="qv-price">${formatPrice(prod.price)}</span>
                            ${priceOrigHtml}
                        </div>
                        <p class="qv-desc">${escapeHTML(prod.desc)}</p>
                        <div class="qv-product-facts">
                            <div><span>Material</span><strong>${escapeHTML(prod.material || 'Textil seleccionado Anthros')}</strong></div>
                            <div><span>Colores</span><strong>${escapeHTML((prod.colors || []).join(' · ') || 'Consulta disponibilidad')}</strong></div>
                            <div><span>Envío estimado</span><strong>${escapeHTML(prod.shipping || '3-5 días hábiles')}</strong></div>
                            <div><span>Cuidado</span><strong>${escapeHTML(prod.care || 'Seguir instrucciones de la etiqueta')}</strong></div>
                        </div>
                        <div>
                            <div class="qv-size-title"> Elige tu talla</div>
                            <div class="qv-sizes">${sizesHtml}</div>
                            <button class="qv-btn-secondary" style="margin-top:var(--space-2);padding:8px 14px;font-size:var(--fs-xs);" onclick="showSizeGuideModal()"> Ver guía de tallas</button>
                        </div>
                        <div class="qv-qty-row">
                            <div><span class="qv-size-title">Cantidad</span></div>
                            <div class="qv-qty">
                                <button class="qv-qty-btn" onclick="qvChangeQty(-1)" aria-label="Restar"></button>
                                <span class="qv-qty-val" id="qvQtyVal">1</span>
                                <button class="qv-qty-btn" onclick="qvChangeQty(1)" aria-label="Sumar">+</button>
                            </div>
                        </div>
                        <div class="qv-actions">
                            <button class="qv-btn-primary" onclick="qvAddToCart()"> Añadir al carrito</button>
                            <button class="qv-btn-secondary" onclick="toggleQuickViewFav()" title="Favorito" aria-label="Añadir favorito">${esFavorito(prod.id) ? '' : ''}</button>
                        </div>
                        <div class="qv-share-row">
                            <span>Compartir:</span>
                            <button class="qv-share-btn" title="WhatsApp" onclick="compartirProducto(${prod.id},'wa')">WhatsApp</button>
                            <button class="qv-share-btn" title="Facebook" onclick="compartirProducto(${prod.id},'fb')">Facebook</button>
                            <button class="qv-share-btn" title="Copiar enlace" onclick="compartirProducto(${prod.id},'copy')">Copiar</button>
                        </div>
                    </div>
                </div>
            `;
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function closeQuickView() {
            const m = document.getElementById('quickViewModal');
            if (m) { m.classList.remove('open'); if (!isCartOpen()) document.body.style.overflow = ''; }
        }
        function qvSelectSize(size, el) {
            _quickViewData.size = size;
            el.parentElement?.querySelectorAll('.size-option').forEach(s => s.classList.remove('selected'));
            el.classList.add('selected');
        }
        function qvChangeQty(delta) {
            _quickViewData.qty = Math.max(1, (_quickViewData.qty || 1) + delta);
            const v = document.getElementById('qvQtyVal');
            if (v) v.textContent = _quickViewData.qty;
        }
        function qvAddToCart() {
            const prod = PRODUCTS_DATA.find(p => p.id === Number(_quickViewData.productId));
            if (!prod) return;
            for (let i = 0; i < _quickViewData.qty; i++) {
                addToCart({
                    id: prod.id,
                    name: prod.name,
                    price: prod.price,
                    img: prod.img,
                    category: prod.gender,
                    originalPrice: prod.originalPrice || undefined,
                    _forcedSize: _quickViewData.size
                });
            }
            showToast(` ${_quickViewData.qty} × ${prod.name} (${_quickViewData.size}) añadido(s) al carrito`, 'success');
            setTimeout(closeQuickView, 400);
        }
        function toggleQuickViewFav() {
            const id = Number(_quickViewData.productId);
            if (!id) return;
            if (esFavorito(id)) {
                favorites.splice(favorites.indexOf(id), 1);
            } else {
                favorites.push(id);
            }
            saveFavorites();
            sincronizarFavoritosUI();
            updateFavoritesCount();
            const prod = PRODUCTS_DATA.find(p => p.id === id);
            showToast(esFavorito(id) ? ` ${prod?.name} en favoritos` : ` Eliminado de favoritos`, 'info');
            openQuickView(id);
        }

        function recordRecommendationAction(action) {
            if (!soportaStorage()) return;
            try {
                const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS) || '{"views":{},"carts":{},"queries":{}}');
                if (action.type === 'view') history.views[action.productId] = (history.views[action.productId] || 0) + 1;
                if (action.type === 'cart') history.carts[action.productId] = (history.carts[action.productId] || 0) + 1;
                if (action.type === 'query' && action.value) history.queries[action.value] = (history.queries[action.value] || 0) + 1;
                localStorage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(history));
            } catch (error) { console.warn('No se pudo actualizar el historial de recomendaciones', error); }
        }

        function getRecommendationHistory() {
            try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS) || '{"views":{},"carts":{},"queries":{}}'); }
            catch { return { views: {}, carts: {}, queries: {} }; }
        }

        function normalizeRecommendationText(value) {
            return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        function getRecommendedProducts(limit = 4) {
            const history = getRecommendationHistory();
            const viewedIds = Object.keys(history.views).map(Number);
            const viewedProducts = PRODUCTS_DATA.filter(product => viewedIds.includes(product.id));
            const queryText = Object.keys(history.queries).join(' ').toLowerCase();
            const anchor = viewedProducts[viewedProducts.length - 1];
            return [...PRODUCTS_DATA].sort((a, b) => {
                const score = product => {
                    let points = Number(history.views[product.id] || 0) * 5;
                    points += Number(history.carts?.[product.id] || 0) * 9;
                    if (anchor && product.collection === anchor.collection) points += 7;
                    if (anchor && product.material && anchor.material && product.material.split(' ').some(word => word.length > 4 && anchor.material.includes(word))) points += 5;
                    if (queryText && `${product.name} ${product.material} ${product.collection} ${product.category}`.toLowerCase().split(' ').some(word => queryText.includes(word) && word.length > 3)) points += 4;
                    if (userAccount?.preferences?.collection && product.collection === userAccount.preferences.collection) points += 5;
                    if (userAccount?.preferences?.gender && product.gender.toLowerCase() === userAccount.preferences.gender) points += 3;
                    if (userAccount?.preferences?.materials?.some(material => normalizeRecommendationText(product.material).includes(normalizeRecommendationText(material)))) points += 6;
                    if (userAccount?.preferences?.size && product.sizes.includes(userAccount.preferences.size)) points += 2;
                    if (userAccount?.preferences?.style && normalizeRecommendationText(product.line).includes(normalizeRecommendationText(userAccount.preferences.style))) points += 2;
                    if (product.isNew) points += 1;
                    return points;
                };
                return score(b) - score(a);
            }).filter(product => !anchor || product.id !== anchor.id).slice(0, limit);
        }

        function renderRecommendations() {
            const container = document.getElementById('recommendationsPanel');
            if (!container) return;
            const recommendations = getRecommendedProducts();
            container.innerHTML = recommendations.map(product => `<article class="recommendation-card" onclick="goToProduct(${Number(product.id)})" tabindex="0" role="link"><div class="recommendation-image"><img src="${escapeHTML(resolveImageUrl(product.img))}" alt="${escapeHTML(product.name)}" loading="lazy"></div><div><span>${escapeHTML(product.collection)} · ${escapeHTML(product.material)}</span><h3>${escapeHTML(product.name)}</h3><strong>${formatPrice(product.price)}</strong></div></article>`).join('');
        }

        let productPageQuantity = 1;
        let productPageFit = 'regular';

        function getProductFromUrl() {
            const id = new URLSearchParams(window.location.search).get('id');
            return PRODUCTS_DATA.find(product => product.id === Number(id));
        }

        function initProductPage() {
            const detail = document.getElementById('productDetail');
            if (!detail) return;
            const product = getProductFromUrl();
            if (!product) {
                detail.innerHTML = '<section class="product-not-found"><span class="section-eyebrow">404 / Producto</span><h1>No encontramos esta pieza.</h1><p>Puede que haya cambiado de colección.</p><a class="checkout-submit" href="./catalogo.html">Volver al catálogo </a></section>';
                return;
            }
            recordRecommendationAction({ type: 'view', productId: product.id });
            productPageQuantity = 1;
            productPageFit = 'regular';
            document.title = `${product.name} | Anthros`;
            const safeName = escapeHTML(product.name);
            const safeCollection = escapeHTML(product.collection);
            const safeLine = escapeHTML(product.line);
            const safeGender = escapeHTML(product.gender);
            const safeDescription = escapeHTML(product.desc);
            const safeMaterial = escapeHTML(product.material);
            const safeColors = (product.colors || []).map(escapeHTML).join(' · ');
            const safeShipping = escapeHTML(product.shipping);
            const safeCare = escapeHTML(product.care);
            const originalPrice = product.originalPrice ? `<span class="product-detail-original">${formatPrice(product.originalPrice)}</span><span class="product-detail-discount">-${product.discount}%</span>` : '';
            const sizes = (product.sizes || ['S', 'M', 'L']).map((size, index) => `<button type="button" class="detail-size ${index === 1 ? 'selected' : ''}" onclick="selectProductSize(this)">${escapeHTML(size)}</button>`).join('');
            const safeSustainability = product.sustainability || {};
            const safeCut = escapeHTML(product.cut || 'Regular');
            const sustMaterial = escapeHTML(safeSustainability.material || product.material || '');
            const sustImpact = escapeHTML(safeSustainability.impact || '');
            const sustCert = escapeHTML(safeSustainability.cert || '');
            detail.innerHTML = `
                <nav class="product-breadcrumb" aria-label="Migas de pan"><a href="./index.html">Inicio</a><span>/</span><a href="./catalogo.html">Colección</a><span>/</span><strong>${safeName}</strong></nav>
                <section class="product-detail-shell">
                    <div class="product-detail-visual"><span class="product-detail-collection">${safeCollection} / ${product.year}</span><img src="${escapeHTML(resolveImageUrl(product.img))}" alt="${safeName}" fetchpriority="high"><span class="product-detail-index">0${product.id}  ${safeLine}</span></div>
                    <div class="product-detail-copy"><p class="product-detail-category">${safeGender} · ${safeLine}${product.isNew ? ' · NUEVO' : ''} · ${safeCut}</p><h1>${safeName}</h1><div class="product-detail-rating"><span aria-label="Calificación ${Number(product.rating) || 0} de 5">${'★'.repeat(Number(product.rating) || 0)}${'☆'.repeat(Math.max(0, 5 - (Number(product.rating) || 0)))}</span><small>${Number(product.reviews) || 0} reseñas</small></div><p class="product-detail-description">${safeDescription}</p>
                        <div class="product-detail-price"><strong>${formatPrice(product.price)}</strong>${originalPrice}</div>
                        <div class="product-detail-data"><div><span>Material</span><strong>${safeMaterial}</strong></div><div><span>Color disponible</span><strong>${safeColors}</strong></div><div><span>Corte</span><strong>${safeCut}</strong></div><div><span>Envío</span><strong>${safeShipping}</strong></div><div><span>Cuidado</span><strong>${safeCare}</strong></div></div>
                        <section class="fit-guide" aria-labelledby="fitGuideTitle">
                            <div class="fit-guide-heading"><span>ENCUENTRA TU SILUETA</span><a href="#" onclick="event.preventDefault();showSizeGuideModal(${product.id});">Guía de medidas ↗</a></div>
                            <h2 id="fitGuideTitle">Elige cómo llevarla</h2>
                            <div class="fit-options" role="group" aria-label="Preferencia de calce">
                                <button type="button" class="fit-option is-selected" data-fit="regular" aria-pressed="true" onclick="setProductFit('regular')"><span class="fit-silhouette regular" aria-hidden="true"></span><strong>Regular</strong><small>Tu talla habitual</small></button>
                                <button type="button" class="fit-option" data-fit="oversize" aria-pressed="false" onclick="setProductFit('oversize')"><span class="fit-silhouette oversize" aria-hidden="true"></span><strong>Oversize</strong><small>Más amplitud</small></button>
                            </div>
                            <div class="fit-suggester">
                                <label>Estatura (cm)<input id="fitHeight" type="number" inputmode="numeric" min="130" max="220" placeholder="170"></label>
                                <label>Peso (kg)<input id="fitWeight" type="number" inputmode="numeric" min="35" max="180" placeholder="65"></label>
                                <button type="button" onclick="suggestProductSize(${product.id})">Orientarme</button>
                            </div>
                            <p class="fit-suggestion" id="fitSuggestion" aria-live="polite">La sugerencia es orientativa. Compara tus medidas con la guía antes de elegir.</p>
                        </section>
                        <div class="detail-choice"><span>Talla</span><div class="detail-sizes">${sizes}</div></div>
                        <section class="product-sustainability" aria-labelledby="sustTitle">
                            <span class="sustainability-eyebrow">SOSTENIBILIDAD</span>
                            <h3 id="sustTitle">Tejido con propósito</h3>
                            <div class="sustainability-grid">
                                <div class="sustainability-item"><span>Material</span><strong>${sustMaterial}</strong></div>
                                ${sustImpact ? `<div class="sustainability-item"><span>Impacto</span><strong>${sustImpact}</strong></div>` : ''}
                                ${sustCert ? `<div class="sustainability-item"><span>Certificaciones</span><strong>${sustCert}</strong></div>` : ''}
                                <div class="sustainability-item"><span>Origen</span><strong>Producción local e independiente en Colombia</strong></div>
                            </div>
                            <p class="sustainability-note">${safeCare}. Trabajamos con talleres locales de Bogotá y Medellín bajo principios de comercio justo y sostenibilidad; consulta la ficha para conocer la composición de sus fibras.</p>
                        </section>
                        <div class="detail-buy-row"><div class="detail-quantity"><button type="button" onclick="changeProductQuantity(-1)" aria-label="Restar cantidad"></button><strong id="productQuantity">1</strong><button type="button" onclick="changeProductQuantity(1)" aria-label="Sumar cantidad">+</button></div><button type="button" class="detail-add-button" onclick="addProductFromPage(${product.id})">Añadir al carrito <span></span></button></div>
                        <div class="detail-service"><span></span><p><strong>Compra con calma.</strong><br>14 días para cambios y devoluciones. Revisa nuestra <a href="./garantias.html">política de garantías</a>.</p></div>
                    </div>
                </section>`;
            renderProductRecommendations(product.id);
        }

        function setProductFit(fit) {
            if (fit !== 'regular' && fit !== 'oversize') return;
            productPageFit = fit;
            document.querySelectorAll('.fit-option').forEach(button => {
                const selected = button.dataset.fit === fit;
                button.classList.toggle('is-selected', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
        }

        function suggestProductSize(productId) {
            const product = PRODUCTS_DATA.find(item => item.id === Number(productId));
            const height = Number(document.getElementById('fitHeight')?.value);
            const weight = Number(document.getElementById('fitWeight')?.value);
            const output = document.getElementById('fitSuggestion');
            if (!product || !output) return;
            if (!Number.isFinite(height) || height < 130 || height > 220 || !Number.isFinite(weight) || weight < 35 || weight > 180) {
                output.textContent = 'Ingresa una estatura entre 130–220 cm y un peso entre 35–180 kg.';
                return;
            }

            const sizes = product.sizes || ['S', 'M', 'L'];
            let index = height < 160 ? 0 : height < 170 ? 1 : height < 180 ? 2 : height < 190 ? 3 : 4;
            const expectedWeight = height - 105;
            if (weight >= expectedWeight + 20) index += 2;
            else if (weight >= expectedWeight + 9) index += 1;
            else if (weight <= expectedWeight - 13) index -= 1;
            if (productPageFit === 'oversize') index += 1;
            const suggestedSize = sizes[Math.max(0, Math.min(sizes.length - 1, index))];
            document.querySelectorAll('.detail-size').forEach(button => {
                button.classList.toggle('selected', button.textContent.trim() === suggestedSize);
            });
            output.textContent = `Como punto de partida, prueba la talla ${suggestedSize} en calce ${productPageFit === 'oversize' ? 'oversize' : 'regular'}. Es una estimación general: verifica las medidas de la tabla para confirmar tu ajuste.`;
        }

        function selectProductSize(button) {
            button.parentElement.querySelectorAll('.detail-size').forEach(size => size.classList.remove('selected'));
            button.classList.add('selected');
        }

        function changeProductQuantity(delta) {
            productPageQuantity = Math.max(1, productPageQuantity + delta);
            const output = document.getElementById('productQuantity');
            if (output) output.textContent = productPageQuantity;
        }

        function addProductFromPage(productId) {
            const product = PRODUCTS_DATA.find(item => item.id === Number(productId));
            const selectedSize = document.querySelector('.detail-size.selected')?.textContent.trim() || product?.sizes?.[1] || 'M';
            if (!product) return;
            for (let index = 0; index < productPageQuantity; index++) addToCart({ id: product.id, name: product.name, price: product.price, img: product.img, category: product.gender, originalPrice: product.originalPrice || undefined, _forcedSize: selectedSize });
            showToast(`${productPageQuantity} × ${product.name} añadido al carrito`, 'success');
        }

        function renderProductRecommendations(currentId) {
            const rail = document.getElementById('productRecommendations');
            if (!rail) return;
            const products = getRecommendedProducts(5).filter(product => product.id !== Number(currentId));
            rail.innerHTML = products.map(product => `<article class="product-rail-card" onclick="goToProduct(${Number(product.id)})" tabindex="0" role="link"><div class="product-rail-image"><img src="${escapeHTML(resolveImageUrl(product.img))}" alt="${escapeHTML(product.name)}" loading="lazy"><span>${escapeHTML(product.collection)}</span></div><div class="product-rail-copy"><small>${escapeHTML(product.material)}</small><h3>${escapeHTML(product.name)}</h3><strong>${formatPrice(product.price)}</strong></div></article>`).join('');
        }

        function initAccountPage() {
            loadUserAccount();
            if (userAccount) showAccountSettings();
        }

        async function saveAccount(event) {
            event.preventDefault();
            const form = event.currentTarget;
            const name = document.getElementById('accountName')?.value.trim().replace(/\s+/g, ' ');
            const email = document.getElementById('accountEmail')?.value.trim().toLowerCase();
            const password = document.getElementById('accountPassword')?.value || '';
            if (!validateRequired(name, 2, 100) || !validateEmail(email) ||
                password.length < 8 || password.length > 128) {
                showToast('Revisa tu nombre, correo y contraseña (mínimo 8 caracteres)', 'error');
                return;
            }
            const button = form.querySelector('button[type="submit"]');
            if (button) {
                button.disabled = true;
                button.textContent = 'Creando cuenta…';
            }
            try {
                const result = await apiRequest('/accounts/register', {
                    method: 'POST',
                    body: JSON.stringify({ name, email, password })
                });
                userAccount = {
                    name: result.account.name,
                    email: result.account.email,
                    provider: 'password',
                    createdAt: result.account.createdAt,
                    preferences: userAccount?.preferences || {}
                };
                saveUserAccount();
                document.getElementById('accountPassword').value = '';
                showAccountSettings();
                showToast('Cuenta creada correctamente', 'success');
            } catch (error) {
                const message = error.code === 'ACCOUNT_ALREADY_EXISTS'
                    ? 'Ya existe una cuenta con ese correo.'
                    : error.message || 'No fue posible crear la cuenta. Inténtalo nuevamente.';
                showToast(message, 'error');
            } finally {
                if (button?.isConnected) {
                    button.disabled = false;
                    button.textContent = 'Crear mi cuenta';
                }
            }
        }

        function showAccountSettings() {
            const accountCard = document.getElementById('accountCard');
            const settings = document.getElementById('accountSettings');
            if (accountCard) accountCard.classList.add('account-card-saved');
            if (settings) settings.hidden = false;
            const nameInput = document.getElementById('accountName');
            if (nameInput && userAccount) nameInput.value = userAccount.name || '';
            const preferences = userAccount?.preferences || {};
            ['profileCity', 'profileAge', 'profileGender', 'profileSize', 'profileStyle', 'profileFrequency'].forEach(id => { const field = document.getElementById(id); const key = id.replace('profile', '').toLowerCase(); if (field && preferences[key]) field.value = preferences[key]; });
            document.querySelectorAll('#materialChoices input').forEach(input => { input.checked = (preferences.materials || []).includes(input.value); });
        }

        function saveAccountPreferences(event) {
            event.preventDefault();
            if (!userAccount) return showToast('Primero crea tu cuenta', 'error');
            const materials = Array.from(document.querySelectorAll('#materialChoices input:checked')).slice(0, 3).map(input => input.value);
            userAccount.preferences = { city: document.getElementById('profileCity')?.value || '', age: document.getElementById('profileAge')?.value || '', gender: document.getElementById('profileGender')?.value || 'unisex', size: document.getElementById('profileSize')?.value || '', materials, style: document.getElementById('profileStyle')?.value || 'atemporal', frequency: document.getElementById('profileFrequency')?.value || 'ocasional' };
            saveUserAccount();
            showToast('Preferencias guardadas. Ajustamos tus recomendaciones', 'success');
        }

        function resetAccount() {
            userAccount = null;
            if (soportaStorage()) localStorage.removeItem(STORAGE_KEYS.ACCOUNT);
            window.location.reload();
        }

        function getEmptyCartProducts() {
            const offers = PRODUCTS_DATA.filter(product => product.discount > 0).sort((a, b) => b.discount - a.discount);
            const bestSellers = PRODUCTS_DATA.filter(product => !offers.includes(product)).sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
            return [...offers, ...bestSellers].slice(0, 6);
        }

        function renderEmptyCartCarousel() {
            const carousel = document.getElementById('emptyCartRecommendations');
            if (!carousel) return;
            const products = getEmptyCartProducts();
            if (!products.length) return;
            const product = products[_emptyCartSlide % products.length];
            const label = product.discount > 0 ? `Oferta / ${product.discount}% menos` : `Más vendido / ${product.reviews} reseñas`;
            carousel.innerHTML = `<div class="empty-cart-carousel-heading"><span class="section-eyebrow">Una pista para empezar</span><h2 id="emptyCartCarouselTitle">Descubre algo que pueda gustarte</h2></div><article class="empty-cart-slide"><div class="empty-cart-slide-image"><img src="${escapeHTML(resolveImageUrl(product.img))}" alt="${escapeHTML(product.name)}"><span>${escapeHTML(label)}</span></div><div class="empty-cart-slide-copy"><small>${escapeHTML(product.collection)} · ${escapeHTML(product.material)}</small><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.desc)}</p><div><strong>${formatPrice(product.price)}</strong>${product.originalPrice ? `<del>${formatPrice(product.originalPrice)}</del>` : ''}</div><button type="button" class="qv-btn-primary" onclick="goToProduct(${Number(product.id)})">Ver producto </button></div></article><div class="empty-cart-carousel-controls"><button type="button" onclick="changeEmptyCartSlide(-1)" aria-label="Recomendación anterior"></button><span>${String((_emptyCartSlide % products.length) + 1).padStart(2, '0')} / ${String(products.length).padStart(2, '0')}</span><button type="button" onclick="changeEmptyCartSlide(1)" aria-label="Siguiente recomendación"></button></div>`;
            restartEmptyCartCarousel(products.length);
        }

        function changeEmptyCartSlide(direction) {
            const products = getEmptyCartProducts();
            if (!products.length) return;
            _emptyCartSlide = (_emptyCartSlide + direction + products.length) % products.length;
            renderEmptyCartCarousel();
        }

        function restartEmptyCartCarousel(totalSlides) {
            clearInterval(_emptyCartTimer);
            _emptyCartTimer = setInterval(() => {
                _emptyCartSlide = (_emptyCartSlide + 1) % totalSlides;
                renderEmptyCartCarousel();
            }, 3000);
        }

        /* 10) COUNTDOWN TIMER OFERTA */
        function initCountdownTimer() {
            if (!document.getElementById('cdDays')) return;
            const stored = localStorage.getItem('anthros_countdown_end_v1');
            let target;
            if (stored) { target = new Date(Number(stored)); if (target < new Date()) target = null; }
            if (!target) { target = new Date(Date.now() + (47 * 60 * 60 * 1000) + (55 * 60 * 1000)); localStorage.setItem('anthros_countdown_end_v1', String(target.getTime())); }
            _countdownTarget = target;
            const tick = () => {
                const now = new Date();
                let diff = Math.max(0, target - now);
                const d = Math.floor(diff / (24 * 60 * 60 * 1000)); diff -= d * 24 * 60 * 60 * 1000;
                const h = Math.floor(diff / (60 * 60 * 1000)); diff -= h * 60 * 60 * 1000;
                const m = Math.floor(diff / (60 * 1000)); diff -= m * 60 * 1000;
                const s = Math.floor(diff / 1000);
                const pad = n => String(n).padStart(2, '0');
                ['cdDays','cdHours','cdMinutes','cdSeconds'].forEach((id, i) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    const val = [d, h, m, s][i];
                    el.textContent = pad(val);
                    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
                });
            };
            tick(); setInterval(tick, 1000);
        }

        /* 11) CARRUSEL TESTIMONIOS */
        function initTestimonialsCarousel() {
            const track = document.getElementById('testimonialsTrack');
            const dotsContainer = document.getElementById('testimonialDots');
            if (!track) return;
            const slides = track.querySelectorAll('.testimonial-slide');
            if (!slides.length) return;
            if (dotsContainer) {
                dotsContainer.innerHTML = '';
                slides.forEach((_, i) => {
                    const dot = document.createElement('button');
                    dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
                    dot.setAttribute('aria-label', `Ir al testimonio ${i + 1}`);
                    dot.onclick = () => goToTestimonial(i);
                    dotsContainer.appendChild(dot);
                });
            }
            const applyTransform = () => {
                const pct = (_testimonialIndex % slides.length) * 100;
                track.style.transform = `translateX(-${pct}%)`;
                const dots = dotsContainer?.querySelectorAll('.testimonial-dot');
                dots?.forEach((d, i) => d.classList.toggle('active', i === (_testimonialIndex % slides.length)));
            };
            applyTransform();
            if (_testimonialAutoTimer) clearInterval(_testimonialAutoTimer);
            _testimonialAutoTimer = setInterval(() => nextTestimonial(true), 7500);
            slides.forEach(s => {
                s.addEventListener('mouseenter', () => { if (_testimonialAutoTimer) clearInterval(_testimonialAutoTimer); });
                s.addEventListener('mouseleave', () => { _testimonialAutoTimer = setInterval(() => nextTestimonial(true), 7500); });
            });
            window._testimonialApplyTransform = applyTransform;
            window._testimonialSlidesLen = slides.length;
        }
        function goToTestimonial(idx) { _testimonialIndex = idx; window._testimonialApplyTransform?.(); }
        function prevTestimonial() {
            const n = window._testimonialSlidesLen || 4;
            _testimonialIndex = (_testimonialIndex - 1 + n) % n;
            window._testimonialApplyTransform?.();
        }
        function nextTestimonial(fromAuto = false) {
            const n = window._testimonialSlidesLen || 4;
            _testimonialIndex = (_testimonialIndex + 1) % n;
            window._testimonialApplyTransform?.();
            if (!fromAuto && _testimonialAutoTimer) { clearInterval(_testimonialAutoTimer); _testimonialAutoTimer = setInterval(() => nextTestimonial(true), 7500); }
        }

        /* 12) FAVORITOS SPA CONTADOR */
        function updateFavoritesCount() {
            const n = favorites.length;
            document.querySelectorAll('.favorites-count').forEach(badge => {
                badge.style.display = n > 0 ? 'inline-flex' : 'none';
                badge.textContent = String(n);
            });
        }

        /* 13) FAVORITOS SPA RENDER */
        function renderFavoritesSPA() {
            updateFavoritesCount();
            const wrap = document.getElementById('favoritesContent');
            if (!wrap) return;
            if (favorites.length === 0) {
                wrap.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"></div>
                        <h3>Aún no tienes favoritos</h3>
                        <p>Explora nuestra colección y guarda tus prendas preferidas para después.</p>
                        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                            <button class="qv-btn-primary" style="min-width:200px;" onclick="navigateTo('home','productos')"> Explorar Colección</button>
                            <button class="qv-btn-secondary" style="min-width:200px;" onclick="navigateTo('home','howtobuy')">¿Cómo comprar?</button>
                        </div>
                    </div>`;
                return;
            }
            const prods = favorites.map(id => PRODUCTS_DATA.find(p => p.id === id)).filter(Boolean);
            wrap.innerHTML = `
                <p style="color:var(--text-muted);margin-bottom:var(--space-5);font-size:var(--fs-sm);">Tienes <strong style="color:var(--red-primary);">${prods.length}</strong> ${prods.length === 1 ? 'prenda' : 'prendas'} guardada(s) como favorita(s).</p>
                <div class="products-grid" id="favGrid">
                    ${prods.map(prod => {
                        const badge = prod.badge ? `<span class="product-badge ${prod.badge.includes('%') ? 'discount' : ''}">${escapeHTML(prod.badge)}</span>` : '';
                        const origHtml = prod.originalPrice ? `<span class="product-price-original">${formatPrice(prod.originalPrice)}</span>` : '';
                        const sizesHtml = (prod.sizes || ['S','M','L']).map(s => `<div class="size-option" onclick="selectSize(this)">${escapeHTML(s)}</div>`).join('');
                        const stars = `Calificación ${prod.rating || 0}/5`;
                        return `
                        <article class="product-card reveal visible" data-category="${escapeHTML(prod.category)}" data-id="${Number(prod.id)}" data-price="${prod.price}" data-discount="${prod.discount}" data-isnew="${prod.isNew}">
                            ${badge}
                            <button class="product-fav active" onclick="removeFromFavSpa(${prod.id})" aria-label="Quitar de favoritos"></button>
                            <button class="quick-view-btn" style="opacity:1;transform:translateY(0);" onclick="goToProduct(${Number(prod.id)})">Ver producto </button>
                            <div class="product-image"><img src="${escapeHTML(resolveImageUrl(prod.img))}" alt="${escapeHTML(prod.name)}" loading="lazy"></div>
                            <div class="product-info">
                                <div class="product-category">${escapeHTML(prod.gender)} · ${escapeHTML(prod.line)}</div>
                                <h3 class="product-name">${escapeHTML(prod.name)}</h3>
                                <div class="product-rating"><div class="rating-stars">${stars}</div><div class="rating-count">(${prod.reviews || 0})</div></div>
                                <p class="product-description">${escapeHTML(prod.desc)}</p>
                                <div class="product-size">${sizesHtml}</div>
                                <div class="product-footer">
                                    <div class="price-container">${origHtml}<span class="product-price">${formatPrice(prod.price)}</span></div>
                                    <button class="add-to-cart-btn" onclick="addProductById(${Number(prod.id)}, event)" aria-label="Añadir al carrito">+</button>
                                </div>
                            </div>
                        </article>`;
                    }).join('')}
                </div>
            `;
        }
        function removeFromFavSpa(id) {
            const i = favorites.indexOf(id);
            if (i >= 0) favorites.splice(i, 1);
            saveFavorites();
            sincronizarFavoritosUI();
            const p = PRODUCTS_DATA.find(x => x.id === id);
            showToast(` ${p?.name || 'Producto'} eliminado de favoritos`, 'info');
            renderFavoritesSPA();
        }

        /* 14) HISTORIAL PEDIDOS SPA */
        function renderOrdersSPA() {
            const wrap = document.getElementById('ordersContent');
            if (!wrap) return;
            const history = getOrderHistory();
            if (history.length === 0) {
                wrap.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"></div>
                        <h3>No tienes pedidos aún</h3>
                        <p>Tu historial de compras aparecerá aquí. ¡Anímate a hacer tu primera compra Anthros!</p>
                        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                            <button class="qv-btn-primary" style="min-width:200px;" onclick="navigateTo('home','productos')"> Ver Productos</button>
                            <button class="qv-btn-secondary" style="min-width:200px;" onclick="showFAQModal()"> Ayuda</button>
                        </div>
                    </div>`;
                return;
            }
            const fmtDate = iso => {
                try {
                    const d = new Date(iso);
                    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                } catch { return iso; }
            };
            wrap.innerHTML = `
                <p style="color:var(--text-muted);margin-bottom:var(--space-5);font-size:var(--fs-sm);">Total <strong style="color:var(--red-primary);">${history.length}</strong> ${history.length === 1 ? 'pedido' : 'pedidos'} registrado(s).</p>
                <div>
                    ${history.map(o => {
                        const chips = (o.items || []).slice(0, 4).map(it => `<span class="history-chip">${Number(it.qty) || 0}× ${escapeHTML(String(it.name || '').slice(0, 22))}</span>`).join('');
                        const extra = (o.items?.length > 4) ? `<span class="history-chip">+${o.items.length - 4} más</span>` : '';
                        return `
                        <div class="history-item" onclick="showOrderDetail('${o.id}')">
                            <div class="history-header">
                                <span class="history-id">#${o.id.slice(-8)}</span>
                                <span class="history-date"> ${fmtDate(o.fecha)}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:var(--space-3);flex-wrap:wrap;">
                                <div style="flex:1;">
                                    <div class="history-items-preview">${chips}${extra}</div>
                                    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                                        <span class="history-chip" style="background:rgba(230,57,70,0.08);color:var(--red-primary);">${o.items?.length || 0} artículo(s)</span>
                                        ${o.appliedPromo ? `<span class="history-chip" style="background:rgba(120,0,0,0.1);color:var(--red-deep);"> Promo ${o.appliedPromo}% OFF</span>` : ''}
                                        ${o.desglose?.envioGratisAplicado || o.desglose?.envio === 0 ? `<span class="history-chip" style="background:rgba(34,197,94,0.12);color:var(--success);"> Envío Gratis</span>` : ''}
                                    </div>
                                </div>
                                <span class="history-total">${formatPrice(o.total || 0)}</span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `;
        }
        function showOrderDetail(orderId) {
            const o = getOrderHistory().find(x => x.id === orderId);
            if (!o) return;
            const itemsHtml = (o.items || []).map(it => `
                <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px dashed rgba(214,140,69,0.25);">
                    <div style="width:54px;height:54px;border-radius:var(--radius-sm);overflow:hidden;background:#fff;flex-shrink:0;"><img src="${escapeHTML(resolveImageUrl(it.img))}" style="width:100%;height:100%;object-fit:cover;" alt=""></div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:700;color:var(--red-deep);font-size:var(--fs-sm);">${escapeHTML(it.name)}</div>
                        <div style="font-size:var(--fs-xs);color:var(--text-light);">${Number(it.qty) || 0} × ${escapeHTML(it.size || '')} · ${formatPrice(it.price)} c/u</div>
                    </div>
                    <div style="font-weight:800;color:var(--red-primary);font-size:var(--fs-sm);">${formatPrice(it.price * it.qty)}</div>
                </div>
            `).join('');
            const d = o.desglose || {};
            showGenericModal(` Pedido #${o.id.slice(-8)}`, `
                <p style="font-size:var(--fs-xs);color:var(--text-light);margin-bottom:14px;">${new Date(o.fecha).toLocaleString('es-CO')}</p>
                ${itemsHtml}
                <div style="margin-top:14px;padding:14px;border-radius:var(--radius-md);background:rgba(255,245,236,0.7);">
                    <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:var(--text-muted);font-size:var(--fs-sm);">Subtotal</span><span style="font-weight:700;">${formatPrice(d.subtotal || 0)}</span></div>
                    ${d.promoDiscount > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--success);"><span style="font-size:var(--fs-sm);"> Promo ${o.appliedPromo}%</span><span style="font-weight:700;"> ${formatPrice(d.promoDiscount)}</span></div>` : ''}
                    ${d.bonoUmbral100k || d.umbralDisc ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--success);"><span style="font-size:var(--fs-sm);"> Bono $100k</span><span style="font-weight:700;"> ${formatPrice(d.bonoUmbral100k || d.umbralDisc || 0)}</span></div>` : ''}
                    <div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:var(--text-muted);font-size:var(--fs-sm);">Envío</span><span style="font-weight:700;">${(d.envio === 0 || d.envioGratisAplicado) ? ' Gratis' : formatPrice(d.envio || 0)}</span></div>
                    <div style="border-top:2px solid var(--orange-warm);margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;"><span style="font-weight:800;font-size:var(--fs-md);color:var(--red-deep);">Total</span><span style="font-weight:900;font-size:var(--fs-lg);color:var(--red-primary);">${formatPrice(o.total || 0)}</span></div>
                </div>
                <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="qv-btn-secondary" style="flex:1;min-width:160px;" onclick="closeGenericModal();navigateTo('favorites')"> Mis Favoritos</button>
                    <button class="qv-btn-primary" style="flex:1;min-width:160px;" onclick="closeGenericModal();navigateTo('home','productos')"> Comprar de nuevo</button>
                </div>
            `);
        }

        /* 15) BENEFITS PROGRESS (en el carrito) */
        function renderBenefitsProgress() {
            const subtotal = calcularSubtotalCarrito();
            const totalQty = calcularCantidadCarrito();
            const envioCantOk = totalQty > SHIPPING_CONFIG.UMBRAL_GRATIS_CANTIDAD;
            const envioMontoOk = subtotal >= SHIPPING_CONFIG.UMBRAL_GRATIS_MONTO;
            const bono100kOk = subtotal > CONFIG_TIENDA ? true : subtotal > 100000;
            const pctEnvioQty = Math.min(100, Math.round((totalQty / (SHIPPING_CONFIG.UMBRAL_GRATIS_CANTIDAD + 1)) * 100));
            const pctEnvioMonto = Math.min(100, Math.round((subtotal / SHIPPING_CONFIG.UMBRAL_GRATIS_MONTO) * 100));
            const pctBono = Math.min(100, Math.round((subtotal / 100001) * 100));
            const overallPct = Math.max(pctEnvioQty, pctEnvioMonto, pctBono);
            const prox = calcularProximosBeneficios ? calcularProximosBeneficios(cart, appliedPromo || 0) : null;
            const nextMsg = prox && !prox.tieneBono100k
                ? `Faltan $${formatearCOPConSimbolo ? formatearCOPConSimbolo(prox.paraBono100k) : formatPrice(prox.paraBono100k)} para bono 10% `
                : (prox && !prox.tieneEnvioGratisPorCantidad && !prox.tieneEnvioGratisPorMonto
                    ? `Compra ${prox.paraEnvioGratisCantidad} producto(s) más para envío gratis `
                    : bono100kOk ? ' ¡Todos los beneficios activos!' : 'Sigue añadiendo productos para obtener beneficios');
            return `
                <div class="benefits-progress">
                    <div class="benefits-item ${envioCantOk || envioMontoOk ? 'done' : ''}">
                        <span>${envioCantOk || envioMontoOk ? '' : ''} Envío gratis</span>
                        <span style="font-size:0.7rem;">${envioCantOk ? '5+ prod ' : (envioMontoOk ? '>$150k ' : `${totalQty}/${SHIPPING_CONFIG.UMBRAL_GRATIS_CANTIDAD + 1}`)}</span>
                    </div>
                    <div class="benefits-bar"><div class="benefits-bar-fill" style="width:${overallPct}%;"></div></div>
                    <div class="benefits-item ${bono100kOk ? 'done' : ''}">
                        <span>${bono100kOk ? '' : ''} Bono 10% > $100k</span>
                        <span style="font-size:0.7rem;">${bono100kOk ? 'Activo ' : formatPrice(subtotal) + ' / $100.001'}</span>
                    </div>
                    <div class="benefits-next">${nextMsg}</div>
                </div>
            `;
        }

        function refreshCartViews() {
            updateCart();
            if (document.getElementById('fullCartItems')) renderFullCartPage();
        }

        async function syncProductsFromApi() {
            const storageAvailable = soportaStorage();
            if (storageAvailable) {
                loadCart();
                loadFavorites();
            }
            updateCart();
            if (document.getElementById('fullCartItems')) renderFullCartPage();
            if (window.location.pathname.toLowerCase().includes('favoritos')) renderFavoritesFullPage();

            let apiAvailable = false;
            if (window.location.protocol !== 'file:') {
                try {
                    const result = await AnthrosServices.api.products({ limit: 100 });
                    if (!Array.isArray(result?.products) || result.products.some(product =>
                        !Number.isInteger(Number(product.id)) || typeof product.name !== 'string'
                    )) {
                        throw new AnthrosServices.api.ApiError('La API devolvió un catálogo con formato inválido', {
                            code: 'INVALID_PRODUCT_CATALOG'
                        });
                    }
                    PRODUCTS_DATA = result.products;
                    apiAvailable = true;
                } catch (error) {
                    console.warn('No fue posible sincronizar el catálogo con la API', error);
                    const status = document.getElementById('catalogApiStatus');
                    if (status) {
                        status.textContent = `Mostrando el catálogo disponible en este dispositivo. ${error.message}${error.help ? ` ${error.help}` : ''}`;
                        status.hidden = false;
                    }
                }
            }

            cart = normalizeCart(cart);
            favorites = [...new Set(favorites.filter(id => PRODUCTS_DATA.some(product => product.id === id)))];
            if (storageAvailable) {
                saveCart();
                saveFavorites();
            }
            sincronizarFavoritosUI();
            if (document.getElementById('fullCartItems')) renderFullCartPage();

            const status = document.getElementById('catalogApiStatus');
            if (status && apiAvailable) {
                status.textContent = '';
                status.hidden = true;
            }
            updateCart();

            const pathname = window.location.pathname.toLowerCase();
            if (document.getElementById('productDetail')) {
                initProductPage();
            } else if (document.getElementById('productsGrid')) {
                const products = pathname.includes('catalogo') ? PRODUCTS_DATA : PRODUCTS_DATA.slice(0, 6);
                renderProductsFromData(products);
                applyCatalogFilters();
            } else if (pathname.includes('favoritos')) {
                renderFavoritesFullPage();
            }
            updateFavoritesCount();
        }

        function removeFromCart(index) {
            const itemIndex = Number(index);
            if (!Number.isInteger(itemIndex) || !cart[itemIndex]) return;
            cart.splice(itemIndex, 1);
            cart = normalizeCart(cart);
            saveCart();
            refreshCartViews();
            showToast('Producto eliminado', 'info');
        }

        function changeQty(index, delta) {
            const itemIndex = Number(index);
            const amount = Number(delta);
            const item = cart[itemIndex];
            if (!Number.isInteger(itemIndex) || !item || !Number.isFinite(amount) || amount === 0) return;
            item.qty = Math.min(CART_LIMITS.MAX_QTY_PER_ITEM, Math.max(0, item.qty + amount));
            if (item.qty === 0) cart.splice(itemIndex, 1);
            cart = normalizeCart(cart);
            saveCart();
            refreshCartViews();
        }

        /* 16) ADD TO CART CON TALLA SELECCIONADA */
        function addToCart(product, eventObject = typeof event !== 'undefined' ? event : null) {
            const card = eventObject?.target?.closest ? eventObject.target.closest('.product-card') : null;
            let selectedSize = product._forcedSize || 'M';
            if (card && !product._forcedSize) {
                const sizeEl = card.querySelector('.size-option.selected');
                if (sizeEl) selectedSize = sizeEl.textContent.trim();
                else {
                    const firstSize = card.querySelector('.size-option');
                    if (firstSize) { firstSize.classList.add('selected'); selectedSize = firstSize.textContent.trim(); }
                }
                card.classList.remove('just-added'); void card.offsetWidth; card.classList.add('just-added');
                setTimeout(() => card.classList.remove('just-added'), 500);
            }
            const payload = getProductPayload(product, selectedSize, product.qty || 1);
            if (!payload) return showToast('Producto no disponible', 'error');
            const existing = cart.find(i => i.id === payload.id && i.size === payload.size);
            if (existing) existing.qty = Math.min(CART_LIMITS.MAX_QTY_PER_ITEM, existing.qty + payload.qty);
            else if (calcularCantidadCarrito() + payload.qty <= CART_LIMITS.MAX_TOTAL_ITEMS) cart.push(payload);
            else return showToast('El carrito alcanzó su límite de unidades', 'error');
            cart = normalizeCart(cart);
            saveCart();
            refreshCartViews();
            showToast(`${product.name} (${selectedSize}) añadido al carrito`, 'success');
        }

        /* 17) CARRITO CON BENEFICIOS */
        function updateCart() {
            const itemsEl = document.getElementById('cartItems');
            const emptyEl = document.getElementById('cartEmpty');
            const summaryEl = document.getElementById('cartSummary');
            const countEl = document.getElementById('cartCount');
            const checkoutBtn = document.getElementById('checkoutBtn');
            if (!itemsEl || !summaryEl || !countEl) return;
            const totalQty = cart.reduce((s, i) => s + i.qty, 0);
            document.querySelectorAll('.cart-count, #navCartCount').forEach(badge => {
                badge.textContent = totalQty;
                badge.classList.remove('pop'); void badge.offsetWidth;
                if (totalQty > 0) badge.classList.add('pop');
            });
            try { updateFavoritesCount(); } catch(e) {}

            if (cart.length === 0) {
                itemsEl.innerHTML = '';
                summaryEl.innerHTML = '';
                if (emptyEl) {
                    summaryEl.appendChild(emptyEl);
                    emptyEl.style.display = 'block';
                }
                if (checkoutBtn) checkoutBtn.style.display = 'none';
                return;
            }
            itemsEl.innerHTML = cart.map((item, idx) => `
                <div class="cart-item">
                    <div class="cart-item-img"><img src="${escapeHTML(resolveImageUrl(item.img))}" alt="${escapeHTML(item.name)}" loading="lazy"></div>
                    <div class="cart-item-details">
                        <div class="cart-item-name">${escapeHTML(item.name)}</div>
                        <div class="cart-item-size">Talla: ${escapeHTML(item.size)} · ${escapeHTML(item.gender || item.category)}</div>
                        <div class="cart-item-price">${formatPrice(item.price * item.qty)}</div>
                        <div class="cart-item-qty">
                            <button class="qty-btn" onclick="changeQty(${idx}, -1)" aria-label="Restar"></button>
                            <span class="qty-value">${item.qty}</span>
                            <button class="qty-btn" onclick="changeQty(${idx}, 1)" aria-label="Sumar">+</button>
                        </div>
                    </div>
                    <button class="cart-remove" onclick="removeFromCart(${idx})" aria-label="Eliminar"></button>
                </div>
            `).join('');

            const breakdown = calcularDesglosePedidoCompleto();

            summaryEl.innerHTML = `
                ${renderBenefitsProgress()}
                <div class="summary-row">
                    <span>Subtotal (${breakdown.totalQty} ${breakdown.totalQty === 1 ? 'producto' : 'productos'})</span>
                    <span>${formatPrice(breakdown.subtotal)}</span>
                </div>
                ${breakdown.promoDiscount ? `
                <div class="summary-row discount-row">
                    <span>Código (${breakdown.appliedPromoPct}%)</span>
                    <span> ${formatPrice(breakdown.promoDiscount)}</span>
                </div>` : ''}
                ${breakdown.umbralDisc > 0 ? `
                <div class="summary-row discount-row">
                    <span> Bono > $100k</span>
                    <span> ${formatPrice(breakdown.umbralDisc)}</span>
                </div>` : ''}
                <div class="summary-row">
                    <span>Envío ${breakdown.shipping === 0 ? '<span style="color:var(--success);">· Gratis </span>' : ''}</span>
                    <span>${breakdown.shipping === 0 ? formatPrice(0) : formatPrice(breakdown.shipping)}</span>
                </div>
                <div class="summary-row total-row">
                    <span>Total</span>
                    <span>${formatPrice(breakdown.total)}</span>
                </div>
            `;
            if (checkoutBtn) checkoutBtn.style.display = 'block';
        }

        /* FUNCIONES FULL PAGE (MPA) */
        function renderFavoritesFullPage() {
            const wrap = document.getElementById('favoritesContent');
            if (!wrap) { if (typeof renderFavoritesSPA === 'function') return renderFavoritesSPA(); }
            if (favorites.length === 0) {
                wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon"></div><h3>Aún no tienes favoritos</h3><p>Explora nuestra colección y guarda tus prendas preferidas para después.</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;"><a href="catalogo.html" class="qv-btn-primary" style="min-width:200px;text-align:center;display:inline-block;text-decoration:none;"> Explorar Colección</a><a href="index.html#howtobuy" class="qv-btn-secondary" style="min-width:200px;text-align:center;display:inline-block;text-decoration:none;">¿Cómo comprar?</a></div></div>`;
                return;
            }
            const prods = favorites.map(id => PRODUCTS_DATA.find(p => p.id === id)).filter(Boolean);
            wrap.innerHTML = `<p style="color:var(--text-muted);margin-bottom:var(--space-5);font-size:var(--fs-sm);">Tienes <strong style="color:var(--red-primary);">${prods.length}</strong> ${prods.length === 1 ? 'prenda' : 'prendas'} guardada(s) como favorita(s).</p><div class="products-grid" id="favGrid">${prods.map(prod => {
                const badge = prod.badge ? `<span class="product-badge ${prod.badge.includes('%') ? 'discount' : ''}">${escapeHTML(prod.badge)}</span>` : '';
                const origHtml = prod.originalPrice ? `<span class="product-price-original">${formatPrice(prod.originalPrice)}</span>` : '';
                const sizesHtml = (prod.sizes || ['S','M','L']).map(s => `<div class="size-option" onclick="selectSize(this)">${escapeHTML(s)}</div>`).join('');
                const stars = `Calificación ${prod.rating || 0}/5`;
                return `<article class="product-card reveal visible" data-category="${escapeHTML(prod.category)}" data-id="${Number(prod.id)}" data-price="${prod.price}" data-discount="${prod.discount}" data-isnew="${prod.isNew}">${badge}<button class="product-fav active" onclick="removeFromFavFull(${Number(prod.id)})" aria-label="Quitar de favoritos"></button><button class="quick-view-btn" style="opacity:1;transform:translateY(0);" onclick="goToProduct(${Number(prod.id)})">Ver producto </button><div class="product-image" onclick="goToProduct(${Number(prod.id)})"><img src="${escapeHTML(resolveImageUrl(prod.img))}" alt="${escapeHTML(prod.name)}" loading="lazy"></div><div class="product-info"><div class="product-category">${escapeHTML(prod.gender)} · ${escapeHTML(prod.line)}</div><h3 class="product-name" onclick="goToProduct(${Number(prod.id)})">${escapeHTML(prod.name)}</h3><div class="product-rating"><div class="rating-stars">${stars}</div><div class="rating-count">(${prod.reviews || 0})</div></div><p class="product-description">${escapeHTML(prod.desc)}</p><div class="product-size">${sizesHtml}</div><div class="product-footer"><div class="price-container">${origHtml}<span class="product-price">${formatPrice(prod.price)}</span></div><button class="add-to-cart-btn" onclick="addProductById(${Number(prod.id)}, event)" aria-label="Añadir al carrito">+</button></div></div></article>`;
            }).join('')}</div>`;
            sincronizarFavoritosUI();
        }
        function removeFromFavFull(id) {
            const i = favorites.indexOf(id);
            if (i >= 0) favorites.splice(i, 1);
            saveFavorites(); sincronizarFavoritosUI();
            const p = PRODUCTS_DATA.find(x => x.id === id);
            showToast(` ${p?.name || 'Producto'} eliminado de favoritos`, 'info');
            renderFavoritesFullPage();
        }
        function renderOrdersFullPage() {
            if (typeof renderOrdersSPA === 'function') {
                const orig = document.getElementById('ordersContent');
                if (!orig) {
                    const wrap = document.getElementById('pedidosContent');
                    if (wrap) {
                        const existingContent = document.getElementById('ordersContent');
                        if (!existingContent) { wrap.setAttribute('id', 'ordersContent'); }
                    }
                }
                return renderOrdersSPA();
            }
        }
        function renderFullCartPage() {
            const itemsContainer = document.getElementById('fullCartItems');
            const summaryContainer = document.getElementById('fullCartSummary');
            const emptyContainer = document.getElementById('fullCartEmpty');
            if (!itemsContainer && !summaryContainer) return;
            try {
                if (emptyContainer) emptyContainer.style.display = cart.length ? 'none' : 'block';
                if (cart.length === 0) renderEmptyCartCarousel();
                else clearInterval(_emptyCartTimer);
                if (typeof updateFullCartUI === 'function') return updateFullCartUI();
                if (typeof updateCart === 'function') {
                    updateCart();
                    const modalItems = document.getElementById('cartItems');
                    const modalSummary = document.getElementById('cartSummary');
                    if (itemsContainer && modalItems) itemsContainer.innerHTML = modalItems.innerHTML;
                    if (summaryContainer && modalSummary) {
                        summaryContainer.innerHTML = modalSummary.innerHTML;
                        const promoRow = `
                            <div style="margin:var(--space-4) 0;padding:var(--space-3);border-radius:var(--radius-md);background:rgba(255,245,236,0.6);">
                                <div style="font-weight:700;margin-bottom:var(--space-2);color:var(--red-deep);"> Código Promocional</div>
                                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                    <input type="text" id="promoInputFull" placeholder="Ej: ANTHROS10" style="flex:1;min-width:140px;padding:10px 14px;border:2px solid rgba(214,140,69,0.25);border-radius:var(--radius-sm);font-size:var(--fs-sm);background:#fff;" />
                                    <button class="qv-btn-secondary" onclick="applyPromoFull()">Aplicar</button>
                                </div>
                                <div id="promoMsgFull" style="margin-top:8px;font-size:var(--fs-xs);color:var(--text-light);"></div>
                            </div>
                            <div style="margin-top:var(--space-4);display:flex;flex-direction:column;gap:10px;">
                                <button class="qv-btn-primary" style="width:100%;justify-content:center;padding:14px 20px;font-size:var(--fs-md);" onclick="checkout()"> Finalizar Compra</button>
                                <button class="qv-btn-secondary" style="width:100%;justify-content:center;padding:12px 18px;" onclick="navigateTo('catalogo')"> Seguir Comprando</button>
                            </div>`;
                        summaryContainer.insertAdjacentHTML('beforeend', promoRow);
                    }
                }
            } catch (e) { console.warn(e); }
        }
        function applyPromoFull() {
            const input = document.getElementById('promoInputFull');
            const msg = document.getElementById('promoMsgFull');
            const code = (input?.value || '').toUpperCase().trim();
            if (!code) { if (msg) msg.textContent = 'Escribe un código'; return; }
            const pct = PROMO_CODES[code];
            if (!pct) {
                appliedPromo = null;
                appliedPromoCode = null;
                saveCart();
                if (msg) { msg.textContent = 'Código inválido. Prueba: ANTHROS10, BIENVENIDO o VERANO2026'; msg.style.color = 'var(--red-primary)'; }
                if (typeof renderFullCartPage === 'function') renderFullCartPage();
                return;
            }
            appliedPromo = pct;
            appliedPromoCode = code;
            saveCart();
            if (msg) { msg.textContent = ` Código ${code} aplicado: ${pct}% OFF`; msg.style.color = 'var(--success)'; }
            showToast(` ${code}: ${pct}% OFF aplicado!`, 'success');
            if (typeof renderFullCartPage === 'function') renderFullCartPage();
        }

        /* =========================================================
           MÓDULO 8 · AUTO-EJECUCIÓN DE NUEVOS MÓDULOS
           ========================================================= */
        (function autoInitAllNewModules() {
            document.querySelectorAll('.theme-toggle').forEach(button => {
                if (!button.textContent.trim()) button.textContent = 'Tema';
            });
            document.querySelectorAll('.favorites-btn').forEach(button => {
                const count = button.querySelector('.favorites-count');
                if (count && !button.firstChild?.textContent?.trim()) button.insertBefore(document.createTextNode('Favoritos '), button.firstChild);
                if (!count && !button.textContent.trim()) button.textContent = 'Favoritos';
            });
            document.documentElement.classList.toggle('theme-dark', userPreferences.theme === 'dark');
            updateThemeControls();
            updateFavoritesCount();
            initTestimonialsCarousel();
            initHeroCarousel();
            sincronizarFavoritosUI();
            updateScrollProgress();
        })();

        (function autoRenderByPage() {
            const path = window.location.pathname.toLowerCase();
            const isPage = (name) => path.includes(name);
            try { sincronizarFavoritosUI(); } catch(e) {}
            try {
                if (isPage('catalogo')) {
                    if (typeof renderProductsFromData === 'function') renderProductsFromData(PRODUCTS_DATA);
                } else if (isPage('index.html') || path === '/' || path === '' || path.endsWith('/frontend/')) {
                    const featured = PRODUCTS_DATA.slice(0, 6);
                    if (typeof renderProductsFromData === 'function' && document.getElementById('productsGrid')) {
                        renderProductsFromData(featured);
                    }
                } else if (isPage('favoritos') || isPage('favorites')) {
                    if (typeof renderFavoritesFullPage === 'function') renderFavoritesFullPage();
                    else if (typeof renderFavoritesSPA === 'function') renderFavoritesSPA();
                } else if (isPage('pedidos') || isPage('orders')) {
                    if (typeof renderOrdersFullPage === 'function') renderOrdersFullPage();
                    else if (typeof renderOrdersSPA === 'function') renderOrdersSPA();
                } else if (isPage('carrito') || isPage('cart')) {
                    if (typeof renderFullCartPage === 'function') renderFullCartPage();
                }
            } catch (e) { console.warn('autoRenderByPage error', e); }
        })();

        initializeAssistantWidget();
        updateCart();
        syncProductsFromApi();
