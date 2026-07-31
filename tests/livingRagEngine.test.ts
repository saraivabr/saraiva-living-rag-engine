import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLivingRagContext } from '../src/ai/livingRagEngine.js';
import { defaultKnowledgeStore } from '../src/ai/semanticVectorStore.js';

test('RAG Vivo: consulta banco semântico e injeta contexto de conhecimento em tempo real', async () => {
  await defaultKnowledgeStore.addChunk(
    'RAG-001',
    'laboratorio',
    'No Laboratório de Agentes, o seguidor acessa templates prontos de automação no WhatsApp.',
  );

  const ragContext = await buildLivingRagContext('Como entro no laboratório de agentes?');

  assert.ok(ragContext.promptAugmentation.includes('BANCO DE DADOS SEMÂNTICO & RAG VIVO'));
  assert.ok(ragContext.promptAugmentation.includes('LABORATORIO'));
});
