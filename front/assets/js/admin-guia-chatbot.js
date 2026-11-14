(function initializeAssistantGuide() {
    'use strict';

    const knowledge = window.AnthrosKnowledge;
    const editor = document.getElementById('knowledgeEditor');
    const status = document.getElementById('knowledgeStatus');
    const importInput = document.getElementById('knowledgeImport');

    function showStatus(message, kind = '') {
        status.textContent = message;
        status.dataset.kind = kind;
    }

    function setEntries(entries) {
        editor.value = JSON.stringify(entries, null, 2);
    }

    function downloadEntries(entries) {
        const file = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'anthros-guia-chatbot.json';
        link.click();
        URL.revokeObjectURL(url);
    }

    const loaded = knowledge.load();
    setEntries(loaded.entries);
    if (loaded.error) {
        showStatus('No se pudo leer la guía guardada. Se muestran las respuestas base; guarda para reemplazar la copia local.', 'error');
    }

    document.getElementById('saveKnowledge').addEventListener('click', () => {
        try {
            const entries = knowledge.save(JSON.parse(editor.value));
            setEntries(entries);
            showStatus('Guía guardada en este navegador. El asistente ya puede usar estos cambios aquí.', 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        }
    });

    document.getElementById('resetKnowledge').addEventListener('click', () => {
        try {
            const entries = knowledge.reset();
            setEntries(entries);
            showStatus('Se restauraron las respuestas base de Anthros.', 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        }
    });

    document.getElementById('exportKnowledge').addEventListener('click', () => {
        try {
            const entries = knowledge.normalize(JSON.parse(editor.value));
            downloadEntries(entries);
            showStatus('Guía exportada. Para compartirla con todos, publícala junto con el sitio.', 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        }
    });

    document.getElementById('importKnowledge').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
        const [file] = importInput.files || [];
        if (!file) return;
        try {
            const entries = knowledge.normalize(JSON.parse(await file.text()));
            setEntries(entries);
            showStatus('Archivo cargado. Guarda los cambios para que el asistente los use en este navegador.', 'success');
        } catch (error) {
            showStatus(`No se pudo importar el archivo: ${error.message}`, 'error');
        } finally {
            importInput.value = '';
        }
    });
})();
