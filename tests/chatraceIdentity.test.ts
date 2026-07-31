import assert from 'node:assert/strict';
import test from 'node:test';
import { chatraceContextCandidates, chatraceFallbackSenderId } from '../src/chatraceIdentity.js';

test('prioriza o Instagram-scoped ID para continuar o lead criado pelo comentario', () => {
  assert.deepEqual(
    chatraceContextCandidates('17841401830912551'),
    ['17841401830912551', 'chatrace:17841401830912551'],
  );
});

test('mantem namespace quando o identificador pertence ao proprio Chatrace', () => {
  assert.deepEqual(chatraceContextCandidates('contact-42'), ['chatrace:contact-42']);
  assert.equal(chatraceFallbackSenderId('contact-42'), 'chatrace:contact-42');
});

test('nao duplica namespace existente e remove espacos externos', () => {
  assert.deepEqual(chatraceContextCandidates('  chatrace:contact-42  '), ['chatrace:contact-42']);
});

test('usa o namespace como fallback quando ainda nao existe contexto da Meta', () => {
  assert.equal(chatraceFallbackSenderId('17841401830912551'), 'chatrace:17841401830912551');
});
