import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAbandonmentAudioCandidate,
  buildAbandonmentAudioScript,
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

test('recuperação do reel de sites permanece curta e não faz novas perguntas', () => {
  const sites = context({ postId: '18130447453725127' });
  sites.instagramFlow = {
    ...sites.instagramFlow!,
    campaign: 'sites_workshop',
    stage: 'awaiting_request',
    path: 'build',
  };
  const candidate = buildAbandonmentAudioCandidate(sites, { now });
  assert.ok(candidate);
  assert.match(candidate.script, /CRIAR MEU SITE/);
  assert.match(candidate.script, /@Sites/);
  assert.match(candidate.script, /WhatsApp/);
  assert.match(candidate.script, /Faz sentido pra você\?$/);
  assert.doesNotMatch(candidate.script, /qual é o seu negócio|cidade|nicho|nível/i);
});
