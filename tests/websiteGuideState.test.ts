import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWebsiteGuideLead } from '../src/lambda.js';

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
