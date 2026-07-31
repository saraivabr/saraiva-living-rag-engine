import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SemanticVectorStore,
  cosineSimilarity,
  generateEmbedding,
} from '../src/ai/semanticVectorStore.js';

test('Banco de Dados Semântico: vetoriza e recupera conteúdo por similaridade', async () => {
  const store = new SemanticVectorStore();

  await store.addChunk(
    'CHUNK-001',
    'sites',
    'Aprenda a criar sites profissionais utilizando ChatGPT e prompts-base.',
  );
  await store.addChunk(
    'CHUNK-002',
    'prospeccao',
    'Como buscar clientes qualificados no Google Maps e automatizar a prospecção.',
  );

  const results = await store.searchSimilar('Como fazer um site com inteligência artificial?', 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'CHUNK-001');
  assert.ok(results[0].similarity > 0);
});

test('Cálculo de Similaridade de Cosseno: calcula corretamente', () => {
  const vecA = [1, 0, 0];
  const vecB = [1, 0, 0];
  const vecC = [0, 1, 0];

  assert.equal(cosineSimilarity(vecA, vecB), 1.0);
  assert.equal(cosineSimilarity(vecA, vecC), 0.0);
});
