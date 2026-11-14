'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function createKnowledgeStore(values = new Map()) {
    const window = {
        localStorage: {
            getItem(key) {
                return values.get(key) ?? null;
            },
            setItem(key, value) {
                values.set(key, String(value));
            },
            removeItem(key) {
                values.delete(key);
            }
        }
    };
    const source = fs.readFileSync(__dirname + '/assistant-knowledge.js', 'utf8');
    vm.runInNewContext(source, { window });
    return window.AnthrosKnowledge;
}

test('assistant knowledge loads defaults and persists validated edits', () => {
    const knowledge = createKnowledgeStore();
    const initial = knowledge.load();
    assert.ok(initial.entries.length >= 10);
    assert.equal(initial.error, undefined);

    const edited = [{ question: '¿Qué es Anthros?', answer: 'Marca colombiana.', keywords: ['marca'] }];
    knowledge.save(edited);
    assert.equal(JSON.stringify(knowledge.load().entries), JSON.stringify(edited));
    assert.equal(JSON.stringify(knowledge.reset()), JSON.stringify(initial.entries));
});

test('assistant knowledge rejects invalid entries and reports invalid saved data', () => {
    const knowledge = createKnowledgeStore();
    assert.throws(() => knowledge.save([{ question: '', answer: 'Respuesta', keywords: [] }]), /entrada 1/i);

    const values = new Map([['anthros_assistant_knowledge_v1', '{invalid json']]);
    const broken = createKnowledgeStore(values).load();
    assert.ok(broken.error);
    assert.ok(broken.entries.length > 0);
});
