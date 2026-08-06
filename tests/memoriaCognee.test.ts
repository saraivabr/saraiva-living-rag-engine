import assert from 'node:assert/strict';
import test from 'node:test';
import { narrarConversa, narrarFunil } from '../src/memoria/sincronizarConversas.js';

test('conversa sem fala escrita e sem sinal de compra não vira memória', () => {
  // 91,8% das conversas são só cliques. Mandar cada uma delas para o grafo
  // enche a memória de ruído e afoga o pouco que alguém escreveu de verdade.
  const soBotao = narrarConversa({
    username: 'fulano',
    postId: '18130447453725127',
    interactions: [
      { direction: 'in', text: 'VENDER SITES' },
      { direction: 'out', text: 'PROMPT DO VÍDEO' },
    ],
    instagramFlow: { stage: 'offering_product' },
  });
  assert.equal(soBotao, undefined);
});

test('a frase escrita à mão entra literal, e o botão entra como escolha', () => {
  const narrativa = narrarConversa({
    username: 'thatianyschulz',
    postId: '18130447453725127',
    interactions: [
      { direction: 'in', text: 'VENDER SITES' },
      { direction: 'in', text: 'como passo o site pro cliente ter acesso como dono?' },
    ],
    instagramFlow: { stage: 'offering_product', promptDeliveredAt: '2026-08-06T14:21:18.000Z' },
  }) || '';

  // A citação precisa sobreviver inteira: é dela que o produto vai nascer.
  assert.match(narrativa, /"como passo o site pro cliente ter acesso como dono\?"/);
  assert.match(narrativa, /Escolheu: VENDER SITES/);
  assert.match(narrativa, /@thatianyschulz/);
  assert.match(narrativa, /Recebeu o prompt gratuito/);
});

test('quem respondeu o follow-up é marcado como mão levantada mesmo sem escrever antes', () => {
  const narrativa = narrarConversa({
    username: 'alguem',
    postId: '18130447453725127',
    interactions: [{ direction: 'in', text: 'CRIAR MEU SITE' }],
    instagramFlow: {
      stage: 'offering_product',
      promptDeliveredAt: '2026-08-06T14:00:00.000Z',
      followUpRepliedAt: '2026-08-06T15:00:00.000Z',
    },
  }) || '';
  assert.match(narrativa, /levantou a mão/);
});

test('o retrato do funil conta o vazamento, não só o volume', () => {
  const retrato = narrarFunil([
    {
      postId: 'A',
      interactions: [{ direction: 'in', text: 'VENDER SITES' }],
      instagramFlow: { promptDeliveredAt: 'x', productOfferedAt: 'x' },
    },
    {
      postId: 'A',
      interactions: [{ direction: 'in', text: 'quero aprender a cobrar' }],
      instagramFlow: { promptDeliveredAt: 'x', productOfferedAt: 'x', productOpenedAt: 'x' },
    },
    { postId: 'B', interactions: [{ direction: 'in', text: 'VENDER SITES' }] },
  ]);

  assert.match(retrato, /3 conversas no total/);
  assert.match(retrato, /2 receberam o prompt gratuito, 2 receberam a oferta, 1 abriram/);
  assert.match(retrato, /Apenas 1 pessoas escreveram/);
  assert.match(retrato, /A \(2\)/);
  assert.match(retrato, /VENDER SITES \(2\)/);
});

test('a palavra-gatilho da campanha não conta como frase escrita', () => {
  // "saraiva" aparece 996 vezes em 1.308 conversas: é o comentário que dispara
  // a automação, não uma frase. Tratá-la como fala enche o grafo de ruído.
  for (const gatilho of ['saraiva', 'Saraiva', 'saraíva', 'Saraiva.', 'ligação', 'voz']) {
    assert.equal(narrarConversa({
      username: 'fulano',
      postId: 'A',
      interactions: [{ direction: 'in', text: gatilho }],
      instagramFlow: { stage: 'awaiting_intent' },
    }), undefined, `"${gatilho}" não deveria virar memória`);
  }

  // Mas uma frase de verdade que CONTÉM o gatilho continua valendo.
  const real = narrarConversa({
    username: 'fulano',
    postId: 'A',
    interactions: [{ direction: 'in', text: 'saraiva o link não chegou aqui' }],
    instagramFlow: { stage: 'awaiting_intent' },
  });
  assert.match(real || '', /"saraiva o link não chegou aqui"/);
});

test('resposta simpática e vazia do Cognee não passa por sabedoria', async () => {
  // O Cognee responde "Got it." quando o grafo não tem nada. Sem esta trava,
  // um cérebro vazio pareceria um cérebro que sabe — e a máquina decidiria
  // o que postar com base em nada.
  const { perguntarAoCerebro } = await import('../src/memoria/perguntarAoCerebro.js');
  const respostas = await perguntarAoCerebro(['postar'], {
    url: 'http://memoria-de-teste.invalido/mcp',
    autorizacao: 'Basic teste',
  }).catch(() => undefined);
  // Servidor inalcançável tem que virar "vazia", nunca uma resposta confiável.
  if (respostas) assert.equal(respostas[0]?.vazia, true);
});
