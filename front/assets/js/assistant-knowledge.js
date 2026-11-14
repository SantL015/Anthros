(function initializeAnthrosKnowledge(global) {
    'use strict';

    const STORAGE_KEY = 'anthros_assistant_knowledge_v1';
    const DEFAULTS = [
        {
            question: '¿Qué es ANTHROS?',
            answer: 'ANTHROS es una marca colombiana de moda consciente y slow fashion: “Moda que se siente, estilo que perdura”. Diseñamos prendas atemporales con materiales honestos para quienes convierten lo cotidiano en algo propio.',
            keywords: ['anthros', 'marca', 'historia', 'quienes somos', 'quiénes somos', 'colombia', 'slow fashion', 'manifiesto']
        },
        {
            question: '¿Cuál es el propósito de Anthros?',
            answer: 'Creamos prendas atemporales con materiales honestos, cuidando su impacto y priorizando calidad, comodidad y diseño duradero. Nuestro lema es “Moda que se siente, estilo que perdura”.',
            keywords: ['proposito', 'propósito', 'mision', 'misión', 'vision', 'visión', 'valores', 'sostenibilidad']
        },
        {
            question: '¿Qué distingue a Brisas de Identidad?',
            answer: 'Brisas de Identidad celebra la frescura, la ligereza y lo orgánico. La Camisa Aire combina lino y algodón orgánico transpirable, cuello nerú/mao y caída fluida; la Henley Senda ofrece punto suave de algodón orgánico en tonos tierra y arena.',
            keywords: ['brisas', 'camisa aire', 'henley senda', 'lino', 'algodon organico', 'algodón orgánico', 'coleccion', 'colección']
        },
        {
            question: '¿Qué es Eclipse Urbano?',
            answer: 'Eclipse Urbano propone siluetas contemporáneas y estructuradas para la ciudad, con tejidos de mayor gramaje, tonos neutros profundos y acabados duraderos de alta resistencia.',
            keywords: ['eclipse', 'urbano', 'streetwear', 'ciudad', 'coleccion', 'colección']
        },
        {
            question: '¿Cómo produce ANTHROS sus prendas?',
            answer: 'Confeccionamos responsablemente en talleres locales aliados en Bogotá y Medellín, con comercio justo y trazabilidad textil. Trabajamos en lotes pequeños para evitar la sobreproducción y usamos empaques sin plásticos de un solo uso.',
            keywords: ['produccion', 'producción', 'etica', 'ética', 'talleres', 'bogota', 'bogotá', 'medellin', 'medellín', 'trazabilidad', 'empaques']
        },
        {
            question: '¿Qué prendas hay en Essentials?',
            answer: 'Essentials reúne básicos versátiles para acompañarte todos los días. Puedes revisar las prendas disponibles y sus tallas en la colección del catálogo.',
            keywords: ['essentials', 'esenciales', 'basicos', 'básicos', 'diario', 'camiseta']
        },
        {
            question: '¿Cuánto tarda el envío?',
            answer: 'Hacemos envíos seguros a toda Colombia. En ciudades principales, el plazo estimado es de 2 a 5 días hábiles; para confirmar el despacho de tu pedido, escríbenos a hola@anthros.com.',
            keywords: ['envio', 'envío', 'entrega', 'domicilio', 'dias', 'días', 'colombia']
        },
        {
            question: '¿Cómo cuido mis prendas?',
            answer: 'Lávalas en frío con ciclo delicado, sécalas a la sombra y no uses blanqueadores para preservar las fibras naturales. Revisa también las instrucciones específicas de la ficha de cada prenda.',
            keywords: ['cuidado', 'lavado', 'lavar', 'secar', 'prenda', 'material']
        },
        {
            question: '¿Cómo elijo mi talla?',
            answer: 'Nuestras hormas reales tienen regular fit relajado y cortes limpios en XS, S, M, L y XL. Revisa la tabla de medidas exactas de la ficha; si dudas entre dos tallas, elige tu talla habitual para un calce natural o una más para un estilo oversize.',
            keywords: ['talla', 'tallas', 'medidas', 'calce', 'fit', 'guia', 'guía', 'oversize', 'horma']
        },
        {
            question: '¿Cómo compro en ANTHROS?',
            answer: 'Agrega tus prendas a la selección Atelier y finaliza el pedido con una confirmación personalizada por WhatsApp; allí coordinamos el pago y el despacho. Si necesitas ayuda, escríbenos a hola@anthros.com.',
            keywords: ['comprar', 'compra', 'atelier', 'pedido', 'whatsapp', 'pago', 'despacho']
        },
        {
            question: '¿Puedo cambiar o devolver un producto?',
            answer: 'La política de cambios y devoluciones contempla un plazo de 30 días hábiles desde la recepción. La prenda debe estar sin uso y conservar sus etiquetas. Consulta la página de Garantías para ver las condiciones completas.',
            keywords: ['cambio', 'cambios', 'devolucion', 'devolución', 'garantia', 'garantía', 'reembolso']
        },
        {
            question: '¿Qué medios de pago aceptan?',
            answer: 'Los medios de pago disponibles son efectivo contraentrega, PSE, tarjetas Visa o Mastercard, Nequi y Daviplata.',
            keywords: ['pago', 'pagos', 'pse', 'tarjeta', 'nequi', 'daviplata', 'contraentrega']
        },
        {
            question: '¿Cómo contacto a Anthros?',
            answer: 'Para atención directa, pedidos o dudas sobre una prenda, escríbenos a hola@anthros.com. También puedes coordinar la confirmación de tu pedido por WhatsApp.',
            keywords: ['contacto', 'contactar', 'correo', 'email', 'telefono', 'teléfono', 'whatsapp', 'direccion', 'dirección', 'horario', 'hola@anthros.com']
        }
    ];

    function normalizeEntries(value) {
        if (!Array.isArray(value) || value.length > 100) {
            throw new TypeError('La guía debe ser una lista de hasta 100 respuestas.');
        }

        return value.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new TypeError(`La entrada ${index + 1} debe ser un objeto.`);
            }
            const question = String(entry.question ?? '').trim();
            const answer = String(entry.answer ?? '').trim();
            const keywords = Array.isArray(entry.keywords)
                ? [...new Set(entry.keywords.map(keyword => String(keyword).trim()).filter(Boolean))]
                : [];
            if (!question || question.length > 160 || !answer || answer.length > 1500 || keywords.length > 30) {
                throw new TypeError(`La entrada ${index + 1} debe tener pregunta, respuesta y hasta 30 palabras clave.`);
            }
            return { question, answer, keywords };
        });
    }

    global.AnthrosKnowledge = Object.freeze({
        storageKey: STORAGE_KEY,
        defaults: Object.freeze(DEFAULTS.map(entry => Object.freeze({
            ...entry,
            keywords: Object.freeze([...entry.keywords])
        }))),
        load() {
            try {
                const stored = global.localStorage.getItem(STORAGE_KEY);
                return { entries: stored ? normalizeEntries(JSON.parse(stored)) : normalizeEntries(DEFAULTS) };
            } catch (error) {
                return { entries: normalizeEntries(DEFAULTS), error };
            }
        },
        save(value) {
            const entries = normalizeEntries(value);
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
            return entries;
        },
        reset() {
            global.localStorage.removeItem(STORAGE_KEY);
            return normalizeEntries(DEFAULTS);
        },
        normalize: normalizeEntries
    });
})(window);
