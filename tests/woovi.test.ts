import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  AGENCY_SUBSCRIPTION_VALUE_CENTS,
  agencySubscriptionCorrelationId,
  buildWebsiteGuideCheckoutReply,
  createAgencySubscription,
  createWebsiteGuideCharge,
  getAgencySubscription,
  getWebsiteGuideCharge,
  isAgencySubscriptionActive,
  isWebsiteGuideCheckoutIntent,
  parseCompletedGuidePayment,
  verifyWooviWebhook,
  WEBSITE_GUIDE_LEGACY_VALUE_CENTS,
  WEBSITE_GUIDE_PREVIOUS_VALUE_CENTS,
  WEBSITE_GUIDE_VALUE_CENTS,
  websiteGuideCorrelationId,
} from '../src/payments/woovi.js';

test('Sistema Cliente Pronto cria uma cobranca Woovi idempotente de R$ 19,90', async () => {
  const senderId = '17840000000000001';
  const correlationId = websiteGuideCorrelationId(senderId);
  let capturedBody = '';
  const charge = await createWebsiteGuideCharge({
    appId: 'app-id-test',
    senderId,
    redirectUrl: 'https://loja.saraiva.ai/obrigado?pedido=teste',
    fetchImpl: async (_url, init) => {
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify({
        charge: {
          correlationID: correlationId,
          status: 'ACTIVE',
          value: WEBSITE_GUIDE_VALUE_CENTS,
          paymentLinkUrl: 'https://pay.woovi.com/abc',
          brCode: '000201',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(charge.value, 1_990);
  assert.equal(charge.paymentLinkUrl, 'https://pay.woovi.com/abc');
  assert.match(capturedBody, /"value":1990/);
  assert.match(capturedBody, /"comment":"Cliente Pronto Starter - extensao e 10 prospeccoes"/);
  assert.doesNotMatch(capturedBody, /—/);
  assert.match(capturedBody, /"redirectUrl":"https:\/\/loja\.saraiva\.ai\/obrigado\?pedido=teste"/);
  assert.match(buildWebsiteGuideCheckoutReply(charge), /R\$\s19,90/);
  assert.match(buildWebsiteGuideCheckoutReply(charge), /Cliente Pronto Starter/);
  assert.match(buildWebsiteGuideCheckoutReply(charge), /10 prospecções/);
});

test('cada nova intencao de compra recebe um pedido diferente', () => {
  const senderId = 'store:cliente-recorrente';
  const now = new Date('2026-07-29T12:00:00.000Z');
  const first = websiteGuideCorrelationId(senderId, now, 'compra-1');
  const retry = websiteGuideCorrelationId(senderId, now, 'compra-1');
  const second = websiteGuideCorrelationId(senderId, now, 'compra-2');

  assert.equal(first, retry);
  assert.notEqual(first, second);
});

test('assinatura mensal cria Pix Automatico de R$ 49,90', async () => {
  const sessionId = 'session-1234567890';
  const correlationId = agencySubscriptionCorrelationId(sessionId);
  let capturedBody = '';
  const subscription = await createAgencySubscription({
    appId: 'app-id-test',
    sessionId,
    now: new Date('2026-07-28T15:00:00.000Z'),
    customer: {
      name: 'Cliente Exemplo',
      taxID: '123.456.789-09',
      email: 'cliente@example.com',
      phone: '(11) 99999-9999',
      address: {
        zipcode: '04892-000',
        street: 'Estrada da Colonia',
        number: '137',
        neighborhood: 'Parelheiros',
        city: 'São Paulo',
        state: 'SP',
      },
    },
    fetchImpl: async (_url, init) => {
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify({
        subscription: {
          correlationID: correlationId,
          globalID: 'subscription-global-id',
          status: 'ACTIVE',
          type: 'PIX_RECURRING',
          value: AGENCY_SUBSCRIPTION_VALUE_CENTS,
          paymentLinkUrl: 'https://pay.woovi.com/subscription',
          pixRecurring: { status: 'CREATED' },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(subscription.value, 4_990);
  assert.equal(subscription.pixRecurringStatus, 'CREATED');
  assert.match(capturedBody, /"frequency":"MONTHLY"/);
  assert.match(capturedBody, /"journey":"PAYMENT_ON_APPROVAL"/);
  assert.match(capturedBody, /"value":4990/);
  assert.doesNotMatch(capturedBody, /123\.456\.789-09/);
  assert.doesNotMatch(capturedBody, /\(11\) 99999-9999/);
  assert.doesNotMatch(capturedBody, /04892-000/);
});

test('consulta assinatura e libera somente apos aprovacao do Pix Automatico', async () => {
  const correlationId = 'ig-sites-sub-abcdef0123456789abcdef01';
  const subscription = await getAgencySubscription({
    appId: 'app-id-test',
    correlationId,
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        `https://api.woovi.com/api/v1/subscriptions/${correlationId}`,
      );
      return new Response(JSON.stringify({
        subscription: {
          correlationID: correlationId,
          globalID: 'subscription-global-id',
          status: 'ACTIVE',
          type: 'PIX_RECURRING',
          value: AGENCY_SUBSCRIPTION_VALUE_CENTS,
          paymentLinkUrl: 'https://pay.woovi.com/subscription',
          pixRecurring: { status: 'APPROVED' },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(isAgencySubscriptionActive(subscription), true);
});

test('checkout aceita intencao da automacao e evita pergunta generica', () => {
  assert.equal(isWebsiteGuideCheckoutIntent('APOSTILA'), true);
  assert.equal(isWebsiteGuideCheckoutIntent('quero pagar no pix'), true);
  assert.equal(isWebsiteGuideCheckoutIntent('PRONTO'), true);
  assert.equal(isWebsiteGuideCheckoutIntent('quero a automacao pronta'), true);
  assert.equal(isWebsiteGuideCheckoutIntent('como funciona a automacao?'), false);
});

test('consulta a Woovi por correlationId e valida valor antes de liberar', async () => {
  const correlationId = 'ig-sites-guide-202607-abcdef0123456789abcd';
  let requestedUrl = '';
  const charge = await getWebsiteGuideCharge({
    appId: 'app-id-test',
    correlationId,
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({
        charge: {
          correlationID: correlationId,
          status: 'COMPLETED',
          value: WEBSITE_GUIDE_VALUE_CENTS,
          transactionID: 'tx-website-guide',
          paidAt: '2026-07-28T14:00:00.000Z',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(requestedUrl, `https://api.woovi.com/api/v1/charge/${correlationId}`);
  assert.equal(charge.status, 'COMPLETED');
  assert.equal(charge.value, WEBSITE_GUIDE_VALUE_CENTS);
  assert.equal(charge.transactionId, 'tx-website-guide');
});

test('webhook aceita HMAC SHA1 ou autorizacao dedicada', () => {
  const rawBody = '{"event":"OPENPIX:CHARGE_COMPLETED"}';
  const signature = createHmac('sha1', 'segredo').update(rawBody).digest('hex');

  assert.equal(verifyWooviWebhook({ rawBody, signature, hmacSecret: 'segredo' }), true);
  assert.equal(verifyWooviWebhook({
    rawBody,
    authorization: 'auth-separada',
    expectedAuthorization: 'auth-separada',
  }), true);
  assert.equal(verifyWooviWebhook({ rawBody, signature: 'errada', hmacSecret: 'segredo' }), false);
});

test('pagamento so conclui com produto, valor e status esperados', () => {
  const paid = parseCompletedGuidePayment({
    event: 'OPENPIX:CHARGE_COMPLETED',
    charge: {
      correlationID: 'ig-sites-guide-202607-abc',
      status: 'COMPLETED',
      value: WEBSITE_GUIDE_VALUE_CENTS,
      transactionID: 'tx-1',
    },
  });
  assert.equal(paid?.value, WEBSITE_GUIDE_VALUE_CENTS);
  assert.equal(paid?.transactionId, 'tx-1');

  assert.equal(parseCompletedGuidePayment({
    event: 'OPENPIX:CHARGE_COMPLETED',
    charge: {
      correlationID: 'outro-produto',
      status: 'COMPLETED',
      value: WEBSITE_GUIDE_VALUE_CENTS,
    },
  }), undefined);
});

test('honra cobranca antiga de R$19 ja emitida sem criar nova promessa', async () => {
  const senderId = '17840000000000002';
  const correlationId = websiteGuideCorrelationId(senderId);
  const charge = await createWebsiteGuideCharge({
    appId: 'app-id-test',
    senderId,
    fetchImpl: async () => new Response(JSON.stringify({
      charge: {
        correlationID: correlationId,
        status: 'ACTIVE',
        value: WEBSITE_GUIDE_LEGACY_VALUE_CENTS,
        paymentLinkUrl: 'https://pay.woovi.com/legado',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  assert.equal(charge.value, WEBSITE_GUIDE_LEGACY_VALUE_CENTS);
  assert.match(buildWebsiteGuideCheckoutReply(charge), /R\$\s19,00/);
  assert.equal(parseCompletedGuidePayment({
    event: 'OPENPIX:CHARGE_COMPLETED',
    charge: {
      correlationID: correlationId,
      status: 'COMPLETED',
      value: WEBSITE_GUIDE_LEGACY_VALUE_CENTS,
    },
  })?.value, WEBSITE_GUIDE_LEGACY_VALUE_CENTS);
});

test('honra cobranca anterior de R$99', () => {
  assert.equal(parseCompletedGuidePayment({
    event: 'OPENPIX:CHARGE_COMPLETED',
    charge: {
      correlationID: 'ig-sites-guide-202607-anterior',
      status: 'COMPLETED',
      value: WEBSITE_GUIDE_PREVIOUS_VALUE_CENTS,
    },
  })?.value, 9_900);
});
