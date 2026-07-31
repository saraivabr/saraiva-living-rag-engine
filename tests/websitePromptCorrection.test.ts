import assert from 'node:assert/strict';
import test from 'node:test';
import { needsWebsitePromptCorrection } from '../src/lambda.js';
import type { LeadContext } from '../src/store/leadContextStore.js';

function contextWithOutbound(text: string): LeadContext {
  return {
    senderId: '17840000000000001',
    postId: '18130447453725127',
    promise: {
      kind: 'website_prompt',
      label: 'prompt para criar sites que geram negocio',
      publicReply: 'Enviei o prompt no inbox.',
      privateReply: 'Aqui esta o prompt que usei.',
    },
    interactions: [
      { at: '2026-07-28T14:00:00.000Z', direction: 'out', text },
    ],
    updatedAt: '2026-07-28T14:00:00.000Z',
  };
}

test('corrige no primeiro retorno quem recebeu a abordagem antiga sem o prompt', () => {
  assert.equal(
    needsWebsitePromptCorrection(
      contextWithOutbound('O prompt do video agora esta organizado numa apostila pratica.'),
    ),
    true,
  );
});

test('nao duplica o prompt quando ele ja foi entregue no inbox', () => {
  assert.equal(
    needsWebsitePromptCorrection(contextWithOutbound('Aqui esta o prompt que usei 👇')),
    false,
  );
});

