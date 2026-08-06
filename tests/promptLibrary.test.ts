import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  PROMPT_LIBRARY_CORRELATION_PREFIX,
  PROMPT_LIBRARY_VALUE_CENTS,
  createPromptLibraryAccessToken,
  createPromptLibraryCharge,
  isPromptLibraryCorrelationId,
  parseCompletedPromptLibraryPayment,
  promptLibraryAccessUrl,
  promptLibraryCorrelationId,
  verifyPromptLibraryAccessToken,
  verifyPromptLibraryWebhook,
} from '../src/payments/promptLibrary.js';

const accessSecret = 'prompt-library-access-secret-with-32-chars';

test('pedido da Biblioteca usa namespace próprio e é determinístico por compra', () => {
  const date = new Date('2026-08-03T12:00:00.000Z');
  const first = promptLibraryCorrelationId('store:session-1234567890', 'purchase-1', date);
  const same = promptLibraryCorrelationId('store:session-1234567890', 'purchase-1', date);
  const other = promptLibraryCorrelationId('store:session-1234567890', 'purchase-2', date);
  assert.equal(first, same);
  assert.notEqual(first, other);
  assert.match(first, new RegExp(`^${PROMPT_LIBRARY_CORRELATION_PREFIX}202608-`));
  assert.equal(isPromptLibraryCorrelationId(first), true);
  assert.equal(isPromptLibraryCorrelationId('ig-sites-guide-202608-deadbeef'), false);
});

test('link permanente usa token HMAC versionado e rejeita adulteração', () => {
  const pedido = promptLibraryCorrelationId('store:session-1234567890', 'purchase-1');
  const token = createPromptLibraryAccessToken(pedido, accessSecret);
  assert.match(token, /^v1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(verifyPromptLibraryAccessToken({
    correlationId: pedido,
    token,
    currentSecret: accessSecret,
  }), true);
  assert.equal(verifyPromptLibraryAccessToken({
    correlationId: pedido,
    token: `${token.slice(0, -1)}x`,
    currentSecret: accessSecret,
  }), false);
  const url = new URL(promptLibraryAccessUrl({
    baseUrl: 'https://app.saraiva.ai',
    correlationId: pedido,
    token,
  }));
  assert.equal(url.pathname, '/biblioteca');
  assert.equal(url.searchParams.get('pedido'), pedido);
  assert.equal(url.searchParams.get('token'), token);
});

test('cobrança Woovi da Biblioteca é exatamente R$ 19,90 e idempotente', async () => {
  const pedido = promptLibraryCorrelationId('store:session-1234567890', 'purchase-1');
  const token = createPromptLibraryAccessToken(pedido, accessSecret);
  let capturedUrl = '';
  let capturedBody = '';
  const charge = await createPromptLibraryCharge({
    appId: 'app-id-test',
    correlationId: pedido,
    redirectUrl: promptLibraryAccessUrl({
      baseUrl: 'https://app.saraiva.ai',
      correlationId: pedido,
      token,
    }),
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify({
        charge: {
          correlationID: pedido,
          status: 'ACTIVE',
          value: PROMPT_LIBRARY_VALUE_CENTS,
          paymentLinkUrl: 'https://openpix.com.br/pay/test-library',
        },
      }), { status: 200 });
    },
  });
  assert.match(capturedUrl, /return_existing=true/);
  const body = JSON.parse(capturedBody) as Record<string, unknown>;
  assert.equal(body.correlationID, pedido);
  assert.equal(body.value, 1990);
  assert.equal(body.comment, 'Biblioteca Secreta de Prompts Prontos');
  assert.match(String(body.redirectUrl), /\/biblioteca\?/);
  assert.equal(charge.value, 1990);
});

test('o checkout aceita os dois domínios da casa e recusa qualquer outro', async () => {
  // A allowlist só tinha app.saraiva.ai. Como o destino vem de variável de
  // ambiente e a migração declarada é para prompt.saraiva.ai, apontar a
  // variável derrubaria a geração de Pix — falha silenciosa no único caminho
  // de receita. Os dois domínios servem o mesmo origin; ambos precisam passar.
  const pedido = promptLibraryCorrelationId('store:session-1234567890', 'purchase-dominio');
  const token = createPromptLibraryAccessToken(pedido, accessSecret);
  const charge = (correlationID: string) => new Response(JSON.stringify({
    charge: {
      correlationID,
      status: 'ACTIVE',
      value: PROMPT_LIBRARY_VALUE_CENTS,
      paymentLinkUrl: 'https://openpix.com.br/pay/test-library',
    },
  }), { status: 200 });

  for (const baseUrl of ['https://app.saraiva.ai', 'https://prompt.saraiva.ai']) {
    const resultado = await createPromptLibraryCharge({
      appId: 'app-id-test',
      correlationId: pedido,
      redirectUrl: promptLibraryAccessUrl({ baseUrl, correlationId: pedido, token }),
      fetchImpl: async () => charge(pedido),
    });
    assert.equal(resultado.value, PROMPT_LIBRARY_VALUE_CENTS, baseUrl);
  }

  // Fechada continua fechada: domínio de terceiro não vira destino de compra.
  for (const hostileiro of ['https://saraiva.ai.evil.com', 'https://outro.com']) {
    await assert.rejects(
      createPromptLibraryCharge({
        appId: 'app-id-test',
        correlationId: pedido,
        redirectUrl: `${hostileiro}/biblioteca?pedido=${pedido}&token=${token}`,
        fetchImpl: async () => charge(pedido),
      }),
      /prompt_library_redirect_invalid/,
      hostileiro,
    );
  }
});

test('webhook aceita HMAC-SHA1 Base64 oficial e rejeita SHA1 hexadecimal legado', () => {
  const rawBody = '{"event":"OPENPIX:CHARGE_COMPLETED"}';
  const secret = 'woovi-webhook-hmac-secret';
  const base64 = createHmac('sha1', secret).update(rawBody).digest('base64');
  const hex = createHmac('sha1', secret).update(rawBody).digest('hex');
  assert.equal(verifyPromptLibraryWebhook({
    rawBody,
    hmacSignature: base64,
    hmacSecret: secret,
  }), true);
  assert.equal(verifyPromptLibraryWebhook({
    rawBody,
    hmacSignature: hex,
    hmacSecret: secret,
  }), false);
});

test('evento pago aceita somente produto novo, valor exato e status COMPLETED', () => {
  const pedido = promptLibraryCorrelationId('store:session-1234567890', 'purchase-1');
  const valid = parseCompletedPromptLibraryPayment({
    event: 'OPENPIX:CHARGE_COMPLETED',
    charge: {
      correlationID: pedido,
      status: 'COMPLETED',
      value: 1990,
      transactionID: 'tx_library_1',
    },
  });
  assert.equal(valid?.correlationId, pedido);
  assert.equal(valid?.transactionId, 'tx_library_1');
  assert.equal(parseCompletedPromptLibraryPayment({
    event: 'OPENPIX:CHARGE_COMPLETED',
    charge: { correlationID: pedido, status: 'COMPLETED', value: 1900 },
  }), undefined);
  assert.equal(parseCompletedPromptLibraryPayment({
    event: 'OPENPIX:CHARGE_COMPLETED',
    charge: {
      correlationID: 'ig-sites-guide-202608-a894e50f0443e7fcde66',
      status: 'COMPLETED',
      value: 1990,
    },
  }), undefined);
});
