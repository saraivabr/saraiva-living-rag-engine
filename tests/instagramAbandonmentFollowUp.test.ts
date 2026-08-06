import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAbandonmentAudioCandidate,
  buildAbandonmentAudioScript,
  buildWebsitePromptFollowUpCandidate,
} from '../src/instagram/abandonmentFollowUp.js';
import type { LeadContext } from '../src/store/leadContextStore.js';

const now = new Date('2026-07-31T12:10:00.000Z');

function context(overrides: Partial<LeadContext> = {}): LeadContext {
  return {
    senderId: 'sender-test',
    postId: '18299164084305199',
    promise: {
      kind: 'instagram_prospecting_conversation',
      label: 'Estrutura',
      publicReply: '',
      privateReply: '',
    },
    instagramFlow: {
      id: 'saraiva-prospecting-v1',
      stage: 'awaiting_path',
      correlationId: 'corr-test',
      firstName: 'Ana',
      transport: 'zernio',
      conversationId: 'conversation-test',
      startedAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:00:00.000Z',
    },
    interactions: [{
      at: '2026-07-31T12:00:00.000Z',
      direction: 'out',
      text: 'Quer colocar pra rodar ou aprender a montar?',
    }],
    updatedAt: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

test('fica elegível após cinco minutos sem resposta e termina com a pergunta obrigatória', () => {
  const candidate = buildAbandonmentAudioCandidate(context(), { now });
  assert.ok(candidate);
  assert.match(candidate.script, /^Ana,/);
  assert.match(candidate.script, /usar a estrutura pronta ou aprender a montar/i);
  assert.match(candidate.script, /Faz sentido pra você\?$/);
});

test('não envia antes de cinco minutos, após resposta ou duas vezes na mesma etapa', () => {
  assert.equal(buildAbandonmentAudioCandidate(context(), {
    now: new Date('2026-07-31T12:04:59.000Z'),
  }), undefined);
  assert.equal(buildAbandonmentAudioCandidate(context({
    interactions: [{
      at: '2026-07-31T12:08:00.000Z',
      direction: 'in',
      text: 'quero usar',
    }],
  }), { now }), undefined);
  const sent = context();
  sent.instagramFlow = {
    ...sent.instagramFlow!,
    abandonmentAudioStage: 'awaiting_path',
    abandonmentAudioSentAt: '2026-07-31T12:06:00.000Z',
  };
  assert.equal(buildAbandonmentAudioCandidate(sent, { now }), undefined);
});

test('não recupera fluxo concluído, sem conversa Zernio ou fora das etapas de espera', () => {
  const completed = context();
  completed.instagramFlow = { ...completed.instagramFlow!, stage: 'completed' };
  assert.equal(buildAbandonmentAudioCandidate(completed, { now }), undefined);

  const noConversation = context();
  noConversation.instagramFlow = { ...noConversation.instagramFlow!, conversationId: undefined };
  assert.equal(buildAbandonmentAudioCandidate(noConversation, { now }), undefined);
  assert.match(buildAbandonmentAudioScript(context().instagramFlow!), /Faz sentido pra você\?$/);
});

test('opt-out persistente nunca recebe áudio de abandono', () => {
  const optedOut = context({
    instagramFlow: {
      ...context().instagramFlow!,
      stage: 'awaiting_request',
      optedOutAt: '2026-07-31T12:05:00.000Z',
    },
  });
  assert.equal(buildAbandonmentAudioCandidate(optedOut, { now }), undefined);
});

test('após cinco minutos reforça o WhatsApp, mas não cobra quem já abriu', () => {
  const waiting = context();
  waiting.instagramFlow = { ...waiting.instagramFlow!, stage: 'offering_community' };
  const candidate = buildAbandonmentAudioCandidate(waiting, { now });
  assert.ok(candidate);
  assert.match(candidate.script, /comunidade gratuita do WhatsApp/i);

  const opened = context();
  opened.instagramFlow = {
    ...opened.instagramFlow!,
    stage: 'offering_community',
    communityOpenedAt: '2026-07-31T12:04:00.000Z',
  };
  assert.equal(buildAbandonmentAudioCandidate(opened, { now }), undefined);
});

test('reel de sites nunca recebe áudio e faz um follow-up textual após entregar o prompt', () => {
  const sites = context({ postId: '18130447453725127' });
  sites.instagramFlow = {
    ...sites.instagramFlow!,
    campaign: 'sites_workshop',
    stage: 'offering_product',
    path: 'ready',
    promptDeliveredAt: '2026-07-31T11:00:00.000Z',
  };
  assert.equal(buildAbandonmentAudioCandidate(sites, { now }), undefined);
  const candidate = buildWebsitePromptFollowUpCandidate(sites, { now, waitMs: 5 * 60 * 1_000 });
  assert.ok(candidate);
  assert.match(candidate.message, /conseguiu abrir o prompt do vídeo/i);
  assert.match(candidate.message, /teste primeiro na sua empresa/i);
  assert.match(candidate.message, /Biblioteca Secreta.*24 prompts completos/i);
  assert.match(candidate.message, /acesso permanente por R\$ 19,90/i);
  assert.doesNotMatch(candidate.message, /Gerador|WhatsApp|culpa|perdendo clientes|urgente|qual é o seu negócio|últimas vagas|80% off|R\$ 97/i);
});

test('follow-up de Vender Sites é adaptado, único e não sai após clique na oferta', () => {
  const sites = context({ postId: '18130447453725127' });
  sites.instagramFlow = {
    ...sites.instagramFlow!,
    campaign: 'sites_workshop',
    stage: 'offering_product',
    path: 'build',
    promptDeliveredAt: '2026-07-31T11:00:00.000Z',
  };
  const candidate = buildWebsitePromptFollowUpCandidate(sites, { now, waitMs: 5 * 60 * 1_000 });
  assert.match(candidate?.message || '', /recomeçar a cada cliente/i);
  assert.match(candidate?.message || '', /Biblioteca Secreta/i);
  sites.instagramFlow = { ...sites.instagramFlow, productOpenedAt: '2026-07-31T12:05:00.000Z' };
  assert.equal(buildWebsitePromptFollowUpCandidate(sites, { now, waitMs: 5 * 60 * 1_000 }), undefined);
  sites.instagramFlow = {
    ...sites.instagramFlow,
    productOpenedAt: undefined,
    followUpSentAt: '2026-07-31T12:05:00.000Z',
  };
  assert.equal(buildWebsitePromptFollowUpCandidate(sites, { now, waitMs: 5 * 60 * 1_000 }), undefined);
});
