(function initializeContactForm() {
    'use strict';

    const form = document.getElementById('contactForm');
    if (!form) return;

    const status = document.getElementById('contactStatus');
    const submit = form.querySelector('[type="submit"]');

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        submit.disabled = true;
        submit.textContent = 'Enviando…';
        status.textContent = 'Estamos enviando tu mensaje.';
        status.dataset.kind = '';

        try {
            await window.AnthrosServices.api.submitContact(data);
            form.reset();
            status.textContent = '¡Gracias! Recibimos tu mensaje y pronto nos pondremos en contacto.';
            status.dataset.kind = 'success';
        } catch (error) {
            status.textContent = error.message || 'No pudimos enviar tu mensaje. Inténtalo de nuevo.';
            status.dataset.kind = 'error';
        } finally {
            submit.disabled = false;
            submit.textContent = 'Enviar mensaje';
        }
    });
})();
