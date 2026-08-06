import assert from 'node:assert/strict';
import test from 'node:test';
import { sendZernioPrivateReply } from '../src/zernio/client.js';

test('lista de botões vazia não é enviada ao Zernio', async () => {
  // O Zernio responde "Too small: expected array to have >=1 items" quando
  // recebe `buttons: []`, e isso derruba a entrega inteira — inclusive a
  // resposta pública no comentário. 28 entregas morreram assim em 14 horas.
  let corpoEnviado: Record<string, unknown> = {};
  const falso = async (_url: string, init?: { body?: string }) => {
    corpoEnviado = JSON.parse(init?.body || '{}');
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', messageId: 'm1', commentId: 'c1' }),
      text: async () => JSON.stringify({ status: 'success', messageId: 'm1', commentId: 'c1' }),
    } as unknown as Response;
  };

  await sendZernioPrivateReply({
    apiKey: 'k', accountId: 'a', mediaId: 'm', commentId: 'c',
    message: 'PROMPT DO VÍDEO', buttons: [],
    fetchImpl: falso as unknown as typeof fetch,
  });
  assert.equal('buttons' in corpoEnviado, false, 'buttons vazio não pode ir no corpo');

  await sendZernioPrivateReply({
    apiKey: 'k', accountId: 'a', mediaId: 'm', commentId: 'c',
    message: 'com botão', buttons: [{ title: 'MINHA EMPRESA', payload: 'own' }],
    fetchImpl: falso as unknown as typeof fetch,
  });
  assert.equal(Array.isArray(corpoEnviado.buttons), true, 'botão de verdade tem que ir');
});
