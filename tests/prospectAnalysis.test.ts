import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGoogleProspectDossier,
  buildInstagramProspectDossier,
  instagramUsername,
  isInstagramProfileUrl,
  lookupInstagramProfileWithApify,
} from '../src/automation/prospectAnalysis.js';

test('aceita somente URL de perfil do Instagram', () => {
  assert.equal(isInstagramProfileUrl('https://www.instagram.com/saraiva.ai/'), true);
  assert.equal(isInstagramProfileUrl('https://instagram.com/empresa_teste'), true);
  assert.equal(isInstagramProfileUrl('https://instagram.com/reel/ABC'), false);
  assert.equal(isInstagramProfileUrl('https://evil.example/saraiva.ai'), false);
  assert.equal(instagramUsername('https://instagram.com/saraiva.ai/'), 'saraiva.ai');
});

test('consulta um unico perfil no ator oficial sem expor o token na URL', async () => {
  let requestedUrl = '';
  let requestedBody: unknown;
  let authorization = '';
  const profile = await lookupInstagramProfileWithApify({
    token: 'secret-token',
    profileUrl: 'https://instagram.com/saraiva.ai/',
    baseUrl: 'https://apify.test',
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body));
      authorization = String((init?.headers as Record<string, string>).authorization);
      return new Response(JSON.stringify([{
        username: 'saraiva.ai',
        fullName: 'Saraiva AI',
        followersCount: 1234,
      }]), { status: 200 });
    },
  });

  assert.equal(profile.username, 'saraiva.ai');
  assert.match(requestedUrl, /apify~instagram-profile-scraper/);
  assert.doesNotMatch(requestedUrl, /secret-token/);
  assert.deepEqual(requestedBody, {
    usernames: ['saraiva.ai'],
    includeAboutSection: false,
  });
  assert.equal(authorization, 'Bearer secret-token');
});

test('monta dossie do Instagram com metricas coletadas', () => {
  const dossier = buildInstagramProspectDossier({
    username: 'studio.aurora',
    fullName: 'Studio Aurora',
    biography: 'Beleza e estética em Salvador',
    followersCount: 12_500,
    followsCount: 320,
    postsCount: 184,
    isBusinessAccount: true,
    businessCategoryName: 'Beauty Salon',
    externalUrl: 'https://studio.example',
    latestPosts: [{ likesCount: 100, commentsCount: 8 }],
  }, new Date('2026-07-29T12:00:00.000Z'));

  assert.equal(dossier.source, 'instagram');
  assert.equal(dossier.name, 'Studio Aurora');
  assert.equal(dossier.signals[0].label, 'SEGUIDORES');
  assert.match(dossier.signals[0].value, /12,5/);
  assert.equal(dossier.price, '1.997');
  assert.match(dossier.approachMessage, /12,5\s*mil seguidores públicos/);
  assert.equal(dossier.fetchedAt, '2026-07-29T12:00:00.000Z');
});

test('monta dossie do Google Maps com reputacao e contato reais', () => {
  const dossier = buildGoogleProspectDossier({
    title: 'Café Horizonte',
    categoryName: 'Cafeteria',
    city: 'Salvador',
    state: 'Bahia',
    phone: '+55 71 99999-0000',
    totalScore: 4.8,
    reviewsCount: 220,
  }, new Date('2026-07-29T12:00:00.000Z'));

  assert.equal(dossier.source, 'google_maps');
  assert.equal(dossier.name, 'Café Horizonte');
  assert.equal(dossier.signals[0].value, '4.8');
  assert.equal(dossier.signals[1].value, '220');
  assert.match(dossier.approachMessage, /Café Horizonte/);
  assert.equal(dossier.price, '1.497');
});
