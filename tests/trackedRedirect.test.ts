import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTrackedDestination } from '../src/lambda.js';
import { PROMPT_GRATUITO_URL } from '../src/socialSelling/flow.js';

/**
 * O fio entre o handler do clique rastreado e as funções de destino.
 *
 * Não é lugar exótico: os dois bugs de 06/08/2026 nasceram aqui. Primeiro o
 * handler montava a URL inline e ignorava as funções — o gratuito perdia a
 * atribuição inteira e ia para o domínio errado. Depois a resposta do Direct
 * apontava para a raiz, que é a landing paga.
 *
 * As funções de destino eram testadas. O fio entre elas, não.
 */

const entrada = {
  correlationId: 'corr-clique-rastreado',
  intent: 'ter' as const,
  issuedAt: 1_775_431_200,
  secret: 's'.repeat(32),
};

test('gratuito e pago vão para páginas diferentes', () => {
  const gratuito = new URL(resolveTrackedDestination('prompt', entrada));
  const pago = new URL(resolveTrackedDestination('product', entrada));

  assert.equal(gratuito.pathname, '/prompt-do-video');
  assert.equal(pago.pathname, '/quero-o-prompt');
  assert.notEqual(gratuito.pathname, pago.pathname);
});

test('nenhum dos dois destinos é a raiz nua, onde mora a landing paga', () => {
  for (const kind of ['prompt', 'product'] as const) {
    const url = new URL(resolveTrackedDestination(kind, entrada));
    assert.notEqual(url.pathname, '/', kind);
  }
});

test('a entrega gratuita carrega a atribuição da campanha, não só o pago', () => {
  // O bug era este: só o caminho pago assinava. Quem clicava no gratuito
  // chegava sem campaign, sem sourceIntent e sem assinatura — e a compra que
  // viesse depois não tinha como ser ligada ao Reel que a originou.
  const gratuito = new URL(resolveTrackedDestination('prompt', entrada));

  assert.equal(gratuito.searchParams.get('correlationId'), entrada.correlationId);
  assert.equal(gratuito.searchParams.get('campaign'), 'quero_o_prompt');
  assert.equal(gratuito.searchParams.get('intent'), 'ter');
  assert.equal(gratuito.searchParams.get('sourceIntent'), 'ter');
  assert.equal(gratuito.searchParams.get('sourceIssuedAt'), String(entrada.issuedAt));
  assert.match(gratuito.searchParams.get('sourceSignature') || '', /^[a-f0-9]{64}$/);
});

test('os dois caminhos assinam a mesma correlação de forma idêntica', () => {
  // Assinaturas diferentes para a mesma pessoa quebrariam a atribuição no
  // storefront dependendo de qual link ela abrisse primeiro.
  const gratuito = new URL(resolveTrackedDestination('prompt', entrada));
  const pago = new URL(resolveTrackedDestination('product', entrada));

  assert.equal(
    gratuito.searchParams.get('sourceSignature'),
    pago.searchParams.get('sourceSignature'),
  );
});

test('o destino do clique e o que o Direct escreve apontam para o mesmo lugar', () => {
  // Duas bocas dizem onde está o prompt gratuito: o clique rastreado e a
  // resposta escrita no Direct. Divergir entre elas é o erro original.
  const doClique = new URL(resolveTrackedDestination('prompt', entrada));
  const doDirect = new URL(PROMPT_GRATUITO_URL);

  assert.equal(doClique.hostname, doDirect.hostname);
  assert.equal(doClique.pathname, doDirect.pathname);
});

test('a intenção escolhida sobrevive ao redirect', () => {
  const aprender = new URL(resolveTrackedDestination('prompt', { ...entrada, intent: 'aprender' }));
  assert.equal(aprender.searchParams.get('intent'), 'aprender');
  assert.equal(aprender.searchParams.get('sourceIntent'), 'aprender');
});

test('segredo fraco derruba a geração em vez de emitir link sem assinatura', () => {
  for (const secret of ['', 'curto-demais']) {
    assert.throws(
      () => resolveTrackedDestination('prompt', { ...entrada, secret }),
      /instagram_attribution_secret_invalid/,
      `segredo "${secret}" deveria ser recusado`,
    );
  }
});
