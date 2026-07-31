import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClientReadyKit,
  buildReadySitePrompt,
  businessPromptData,
  isGoogleMapsUrl,
  lookupBusinessWithApify,
} from '../src/automation/sitePromptAutomation.js';

test('reconhece somente links seguros do Google Maps', () => {
  assert.equal(isGoogleMapsUrl('https://www.google.com/maps/place/Scarlett+Makeup'), true);
  assert.equal(isGoogleMapsUrl('https://maps.app.goo.gl/abc123'), true);
  assert.equal(isGoogleMapsUrl('https://example.com/maps/place/loja'), false);
});

test('consulta um unico negocio no Apify com custo limitado', async () => {
  let requestedUrl = '';
  let requestedBody = '';
  const result = await lookupBusinessWithApify({
    token: 'apify-token-test',
    business: 'Scarlett Makeup',
    location: 'Parelheiros, São Paulo',
    fetchImpl: async (url, init) => {
      requestedUrl = String(url);
      requestedBody = String(init?.body || '');
      return new Response(JSON.stringify([{
        title: 'Scarlett Makeup',
        categoryName: 'Cosmetics store',
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(result.place.title, 'Scarlett Makeup');
  assert.match(requestedUrl, /maxItems=1/);
  assert.match(requestedUrl, /maxTotalChargeUsd=0.50/);
  assert.match(requestedBody, /"maxCrawledPlacesPerSearch":1/);
  assert.match(requestedBody, /"locationQuery":"Parelheiros, São Paulo"/);
});

test('gera o prompt completo preenchido sem manter os dados da Scarlett', () => {
  const data = businessPromptData({
    title: 'Bom Baiano Doces',
    categoryName: 'Atacadista de doces',
    address: 'R. Brg. Tobias, 206 - Santa Ifigênia, São Paulo - SP',
    city: 'São Paulo',
    state: 'SP',
    postalCode: '01032-000',
    phone: '(11) 3611-0302',
    totalScore: 4.5,
    reviewsCount: 1922,
    openingHours: [{ day: 'terça-feira', hours: '07:00–18:00' }],
    url: 'https://www.google.com/maps/place/Bom+Baiano+Doces',
  });
  const prompt = buildReadySitePrompt(data);

  assert.match(prompt, /Bom Baiano Doces/);
  assert.match(prompt, /4\.5 de 5, com 1922 avaliações/);
  assert.match(prompt, /modo Work/);
  assert.match(prompt, /@Sites/);
  assert.match(prompt, /# ORDEM DE EXECUÇÃO/);
  assert.doesNotMatch(prompt, /Scarlett Makeup/);
});

test('gera o Dossie Cliente Pronto com venda, producao e entrega', () => {
  const data = businessPromptData({
    title: 'Bom Baiano Doces',
    categoryName: 'Atacadista de doces',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 3611-0302',
    totalScore: 4.5,
    reviewsCount: 1922,
  });
  const kit = buildClientReadyKit(data);

  assert.match(kit.diagnosis.headline, /Bom Baiano Doces/);
  assert.equal(kit.whatsappApproaches.length, 3);
  assert.match(kit.offer.priceReference, /R\$497 a R\$1\.497/);
  assert.match(kit.proposalTemplate, /\[PREENCHER VALOR\]/);
  assert.match(kit.contractTemplate, /CONTRATO-BASE/);
  assert.match(kit.contractTemplate, /revisão jurídica/);
  assert.equal(kit.deliveryChecklist.length, 7);
  assert.match(kit.deliveryChecklist.join(' '), /modo Work do ChatGPT com @Sites/);
});
