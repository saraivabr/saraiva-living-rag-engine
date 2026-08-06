import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFirstName,
  buildPersonalizedAudioScript,
  filterSiteLeadsForAudio,
} from '../scripts/reengageSiteLeadsWithAudio.js';
import type { LeadContext } from '../src/store/leadContextStore.js';

test('extractFirstName extrai corretamente o primeiro nome limpo ou fallback', () => {
  assert.equal(extractFirstName('Lucas Silva', 'lucassilva'), 'Lucas');
  assert.equal(extractFirstName('   ana  clara ', 'anaclara'), 'Ana');
  assert.equal(extractFirstName(undefined, 'marcos.dev'), 'Marcos');
  assert.equal(extractFirstName(undefined, undefined), 'amigo');
});

test('buildPersonalizedAudioScript gera roteiro persuasivo com o nome e faturamento de 10k por R$ 19,90', () => {
  const scriptLucas = buildPersonalizedAudioScript('Lucas');
  assert.match(scriptLucas, /Fala Lucas,/);
  assert.match(scriptLucas, /10k por mês/);
  assert.match(scriptLucas, /biblioteca pessoal/);
  assert.match(scriptLucas, /R\$ 19,90/);

  const scriptAmigo = buildPersonalizedAudioScript('amigo');
  assert.match(scriptAmigo, /Fala beleza\?/);
});

test('filterSiteLeadsForAudio identifica apenas leads do funil de sites sem duplicação', () => {
  const contexts: LeadContext[] = [
    {
      senderId: 'user-1',
      username: 'lucas.site',
      promise: { kind: 'website_prompt', label: 'Prompt Site' },
      instagramFlow: {
        id: 'saraiva-prospecting-v1',
        campaign: 'sites_workshop',
        stage: 'offering_product',
        correlationId: 'corr-1',
        conversationId: 'conv-1',
        firstName: 'Lucas',
        startedAt: '2026-08-03T10:00:00Z',
        updatedAt: '2026-08-03T10:00:00Z',
      },
      updatedAt: '2026-08-03T10:00:00Z',
    },
    {
      senderId: 'user-2',
      username: 'maria.geral',
      promise: { kind: 'instagram_prospecting_conversation', label: 'Prospecção' },
      instagramFlow: {
        id: 'saraiva-prospecting-v1',
        campaign: 'prospecting',
        stage: 'offering_community',
        correlationId: 'corr-2',
        conversationId: 'conv-2',
        startedAt: '2026-08-03T10:00:00Z',
        updatedAt: '2026-08-03T10:00:00Z',
      },
      updatedAt: '2026-08-03T10:00:00Z',
    },
    {
      senderId: 'user-3',
      username: 'roberto.duplicado',
      promise: { kind: 'website_prompt', label: 'Prompt Site' },
      instagramFlow: {
        id: 'saraiva-prospecting-v1',
        campaign: 'sites_workshop',
        stage: 'offering_product',
        correlationId: 'corr-3',
        conversationId: 'conv-3',
        firstName: 'Roberto',
        startedAt: '2026-08-03T10:00:00Z',
        updatedAt: '2026-08-03T10:00:00Z',
      },
      automationJournal: [
        {
          at: '2026-08-03T10:10:00Z',
          action: 'site_lead_audio_reengagement_sent',
          verifiedFacts: ['firstName:Roberto'],
          rule: 'test',
          result: 'done',
          reasonCode: 'site_lead_audio_reengagement_sent',
        },
      ],
      updatedAt: '2026-08-03T10:00:00Z',
    },
  ];

  const eligible = filterSiteLeadsForAudio(contexts);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].senderId, 'user-1');
  assert.equal(eligible[0].firstName, 'Lucas');
});
