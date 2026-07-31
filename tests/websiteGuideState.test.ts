import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWebsiteGuideAutomationLeaseExpired,
  normalizeWebsiteGuideLead,
  shouldReuseWebsiteGuideCheckoutIntent,
  websiteGuideAutomationConditionNames,
  websiteGuideUsage,
} from '../src/lambda.js';

test('reutiliza somente uma cobranca ainda pagavel', () => {
  assert.equal(shouldReuseWebsiteGuideCheckoutIntent('ACTIVE'), true);
  assert.equal(shouldReuseWebsiteGuideCheckoutIntent('COMPLETED'), false);
  assert.equal(shouldReuseWebsiteGuideCheckoutIntent('EXPIRED'), false);
});

test('usa somente nomes presentes na condicao do DynamoDB', () => {
  assert.deepEqual(websiteGuideAutomationConditionNames(true), {
    '#automationStatus': 'automationStatus',
    '#automationLockExpiresAt': 'automationLockExpiresAt',
    '#automationInputHash': 'automationInputHash',
  });
  assert.deepEqual(websiteGuideAutomationConditionNames(false), {
    '#automationStatus': 'automationStatus',
    '#automationInputHash': 'automationInputHash',
  });
});

test('libera dez prospeccoes por pedido e preserva pedidos antigos', () => {
  assert.deepEqual(websiteGuideUsage({}), { used: 0, limit: 10, remaining: 10 });
  assert.deepEqual(
    websiteGuideUsage({ automation: { status: 'COMPLETED' } }),
    { used: 1, limit: 10, remaining: 9 },
  );
  assert.deepEqual(
    websiteGuideUsage({
      generationCount: 7,
      automation: { status: 'RUNNING' },
      automationHistory: [{ status: 'COMPLETED' }],
    }),
    { used: 7, limit: 10, remaining: 3 },
  );
  assert.deepEqual(
    websiteGuideUsage({ generationCount: 99 }),
    { used: 10, limit: 10, remaining: 0 },
  );
  assert.deepEqual(
    websiteGuideUsage({ generationLimit: 1, generationCount: 0 }),
    { used: 0, limit: 1, remaining: 1 },
  );
  assert.deepEqual(
    websiteGuideUsage({
      generationLimit: 1,
      automation: { status: 'COMPLETED' },
    }),
    { used: 1, limit: 1, remaining: 0 },
  );
});

test('normaliza o cadastro antes de liberar o acesso gratuito', () => {
  assert.deepEqual(
    normalizeWebsiteGuideLead({
      name: '  Fellipe   Saraiva ',
      email: ' FELLIPE@EXAMPLE.COM ',
      whatsapp: '(11) 99999-8888',
      city: ' São Paulo ',
      acceptedTerms: true,
      marketingConsent: true,
      source: ' checkout-gratis ',
      utmSource: ' instagram ',
    }, new Date('2026-07-29T20:00:00.000Z')),
    {
      name: 'Fellipe Saraiva',
      email: 'fellipe@example.com',
      whatsapp: '11999998888',
      city: 'São Paulo',
      marketingConsent: true,
      termsAcceptedAt: '2026-07-29T20:00:00.000Z',
      source: 'checkout-gratis',
      utmSource: 'instagram',
    },
  );
  assert.throws(
    () => normalizeWebsiteGuideLead({
      name: 'Fellipe',
      email: 'email-invalido',
      whatsapp: '11999998888',
      acceptedTerms: true,
    }),
    /email valido/,
  );
  assert.throws(
    () => normalizeWebsiteGuideLead({
      name: 'Fellipe',
      email: 'fellipe@example.com',
      whatsapp: '11999998888',
      acceptedTerms: false,
    }),
    /aceite os termos/,
  );
});

test('permite retomar automacao sem lease ou com lease vencido', () => {
  const now = new Date('2026-07-29T12:10:00.000Z');
  assert.equal(
    isWebsiteGuideAutomationLeaseExpired({ status: 'RUNNING' }, now),
    true,
  );
  assert.equal(
    isWebsiteGuideAutomationLeaseExpired({
      status: 'RUNNING',
      lockExpiresAt: '2026-07-29T12:09:59.000Z',
    }, now),
    true,
  );
  assert.equal(
    isWebsiteGuideAutomationLeaseExpired({
      status: 'RUNNING',
      lockExpiresAt: '2026-07-29T12:10:01.000Z',
    }, now),
    false,
  );
  assert.equal(
    isWebsiteGuideAutomationLeaseExpired({
      status: 'COMPLETED',
      lockExpiresAt: '2026-07-29T12:00:00.000Z',
    }, now),
    false,
  );
});
