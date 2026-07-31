import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesCampaignTrigger,
  matchesMediaCampaignTrigger,
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../src/campaignTrigger.js';

const triggerWords = ['aula', 'ligar', 'ligação', 'workshop'];

test('gatilho comercial respeita limites de palavra', () => {
  assert.equal(matchesCampaignTrigger('Paula', triggerWords), false);
  assert.equal(matchesCampaignTrigger('desligar isso', triggerWords), false);
});

test('gatilho comercial reconhece palavras-chave explicitas', () => {
  assert.equal(matchesCampaignTrigger('AULA', triggerWords), true);
  assert.equal(matchesCampaignTrigger('Quero LIGAÇÃO', triggerWords), true);
  assert.equal(matchesCampaignTrigger('WORKSHOP', triggerWords), true);
});

test('SARAIVA abre somente a campanha especifica do reel de sites', () => {
  assert.equal(
    matchesMediaCampaignTrigger(WEBSITE_PROMPT_MEDIA_ID, 'Saraiva', triggerWords),
    true,
  );
  assert.equal(
    matchesMediaCampaignTrigger('18000000000000000', 'Saraiva', triggerWords),
    false,
  );
  assert.equal(
    matchesMediaCampaignTrigger(WEBSITE_PROMPT_MEDIA_ID, 'quero aula', triggerWords),
    false,
  );
});

test('SARAIVA abre a campanha da automacao de prospeccao no post correto', () => {
  assert.equal(
    matchesMediaCampaignTrigger(PROSPECTING_FLOW_MEDIA_ID, 'Saraiva', triggerWords),
    true,
  );
  assert.equal(
    matchesMediaCampaignTrigger(PROSPECTING_FLOW_MEDIA_ID, 'quero aula', triggerWords),
    false,
  );
});

test('MUSICA abre somente a campanha configurada do reel de jingles', () => {
  const previous = process.env.MUSIC_CAMPAIGN_MEDIA_IDS;
  process.env.MUSIC_CAMPAIGN_MEDIA_IDS = '18000000000000001';
  try {
    assert.equal(
      matchesMediaCampaignTrigger('18000000000000001', 'MÚSICA', triggerWords),
      true,
    );
    assert.equal(
      matchesMediaCampaignTrigger('18000000000000001', 'quero mapa', triggerWords),
      false,
    );
    assert.equal(
      matchesMediaCampaignTrigger('18000000000000002', 'MÚSICA', triggerWords),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.MUSIC_CAMPAIGN_MEDIA_IDS;
    else process.env.MUSIC_CAMPAIGN_MEDIA_IDS = previous;
  }
});
