'use strict';

const express = require('express');

const SYSTEM_INSTRUCTION = [
    'IDENTIDAD Y MANIFIESTO: ANTHROS es una marca colombiana de moda consciente y slow fashion bajo el lema "Moda que se siente, estilo que perdura". Diseñamos prendas atemporales con materiales honestos para quienes convierten lo cotidiano en algo propio.',
    'COLECCIONES: Brisas de Identidad se inspira en la frescura, la ligereza y lo orgánico. La Camisa Aire tiene cuello nerú/mao, botones naturales, caída fluida y mezcla transpirable de lino y algodón orgánico. La Henley Senda está confeccionada en punto suave de algodón orgánico, en tonos tierra y arena, para clima cálido o uso diario versátil.',
    'Eclipse Urbano propone siluetas contemporáneas y estructuradas para la ciudad, tejidos de mayor gramaje, tonos neutros profundos y acabados duraderos de alta resistencia.',
    'PRODUCCIÓN E IMPACTO: Las prendas se confeccionan responsablemente en talleres locales aliados en Bogotá y Medellín, con comercio justo, trazabilidad textil, lotes pequeños para evitar sobreproducción y empaques libres de plásticos de un solo uso.',
    'TALLAS Y CUIDADO: Las hormas reales priorizan comodidad y movimiento, con regular fit relajado y cortes limpios en XS, S, M, L y XL. Si hay duda entre dos tallas, recomienda revisar la tabla exacta en la ficha o elegir su talla habitual para un calce natural; una talla más si busca un estilo oversize. Recomienda lavar en frío en ciclo delicado, secar a la sombra y no usar blanqueadores para preservar las fibras naturales.',
    'COMPRA Y SOPORTE: El cliente agrega prendas a su selección Atelier y finaliza el pedido con confirmación personalizada directa por WhatsApp para coordinar pago y despacho. Hay envíos seguros a toda Colombia; en ciudades principales tardan de 2 a 5 días hábiles. Atención directa: hola@anthros.com.',
    'PERSONALIDAD: Responde siempre en español, con tono cálido, sofisticado, cercano y conciso; máximo 3 a 4 líneas salvo que pidan una ficha detallada. Haz preguntas de seguimiento útiles para ayudar a elegir prenda o talla.',
    'PRECISIÓN: No inventes precios, descuentos, disponibilidad ni datos que no estén confirmados en el catálogo o esta guía. Remite a la ficha del producto para confirmar precios, medidas y disponibilidad. Si no sabes algo, dilo con claridad y ofrece contactar a hola@anthros.com. Si la consulta no es sobre ANTHROS, sus prendas o su cuidado, explica brevemente que solo puedes ayudar con esos temas.'
].join('\n\n');

const FALLBACK_ANSWER = '¡Hola! Soy MágicoBot. Ahora mismo no puedo consultar la guía completa; revisa el catálogo o escríbenos por WhatsApp y te ayudaremos.';
// Groq usa este modelo por defecto; GROQ_MODEL permite configurarlo en el despliegue.
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';
const MAX_HISTORY_MESSAGES = 10;

function createChatRouter({ clientFactory, timeoutMs = 8000 } = {}) {
    const router = express.Router();
    router.post('/', async (request, response, next) => {
        try {
            const submittedMessages = Array.isArray(request.body?.messages)
                ? request.body.messages.slice(-MAX_HISTORY_MESSAGES)
                : [{ role: 'user', content: request.body?.message }];
            const messages = submittedMessages.map(item => {
                if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
                    return null;
                }
                const content = item.content.trim();
                return content && content.length <= 500 ? { role: item.role, content } : null;
            });
            if (!messages.length || messages.some(item => !item) || messages[messages.length - 1].role !== 'user') {
                const error = new Error('Escribe una consulta de hasta 500 caracteres.');
                error.status = 400;
                error.code = 'INVALID_CHAT_MESSAGE';
                throw error;
            }

            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) {
                response.json({ answer: FALLBACK_ANSWER, fallback: true });
                return;
            }

            const controller = new AbortController();
            let timer;
            try {
                const createClient = clientFactory || (key => {
                    const Groq = require('groq-sdk');
                    return new Groq({ apiKey: key });
                });
                const client = createClient(apiKey);
                const timedOut = new Promise(resolve => {
                    timer = setTimeout(() => {
                        controller.abort();
                        resolve(null);
                    }, timeoutMs);
                });
                const completion = await Promise.race([
                    client.chat.completions.create({
                        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
                        messages: [
                            { role: 'system', content: SYSTEM_INSTRUCTION },
                            ...messages
                        ],
                        temperature: 0.6,
                        max_tokens: 220
                    }, { signal: controller.signal }),
                    timedOut
                ]);
                if (!completion) {
                    response.json({ answer: FALLBACK_ANSWER, fallback: true });
                    return;
                }

                const rawAnswer = completion?.choices?.[0]?.message?.content;
                const answer = typeof rawAnswer === 'string'
                    ? rawAnswer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 4).join('\n').slice(0, 600)
                    : '';
                if (!answer) {
                    const error = new Error('El asistente no generó una respuesta. Inténtalo nuevamente.');
                    error.status = 502;
                    error.code = 'AI_EMPTY_RESPONSE';
                    throw error;
                }
                response.json({ answer });
            } catch (cause) {
                console.error('No fue posible consultar Groq para MágicoBot:', cause?.name || 'Error');
                response.json({ answer: FALLBACK_ANSWER, fallback: true });
            } finally {
                clearTimeout(timer);
            }
        } catch (error) {
            next(error);
        }
    });
    return router;
}

module.exports = { SYSTEM_INSTRUCTION, createChatRouter };
