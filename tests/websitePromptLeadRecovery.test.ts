import assert from 'node:assert/strict';
import test from 'node:test';
import type { LeadContext } from '../src/store/leadContextStore.js';
import {
  buildWebsitePromptRecoveryCandidate,
  completeWebsitePromptRecoveryContext,
  prepareWebsitePromptRecoveryContext,
  WEBSITE_PROMPT_RECOVERY_MESSAGE,
} from '../src/operations/websitePromptLeadRecovery.js';

const now = new Date('2026-08-01T20:00:00.000Z');

function context(overrides: Partial<LeadContext> = {}): LeadContext {
  return {
    senderId: 'sender-test',
    postId: '18130447453725127',
    promise: { kind: 'website_prompt', label: 'Prompt', privateReply: '', publicReply: '' },
    instagramFlow: {
      id: 'saraiva-prospecting-v1',
      campaign: 'sites_workshop',
      stage: 'offering_community',
      correlationId: 'corr-test',
      transport: 'zernio',
      conversationId: 'conversation-test',
      startedAt: '2026-07-31T18:00:00.000Z',
      updatedAt: '2026-08-01T19:00:00.000Z',
    },
    interactions: [
      { at: '2026-07-31T18:00:00.000Z', direction: 'in', text: 'SARAIVA' },
      { at: '2026-07-31T18:00:01.000Z', direction: 'out', text: 'resposta privada' },
      { at: '2026-08-01T19:00:00.000Z', direction: 'in', text: 'quero' },
      { at: '2026-08-01T19:00:01.000Z', direction: 'out', text: 'oferta antiga' },
    ],
    updatedAt: '2026-08-01T19:00:01.000Z',
    ...overrides,
  };
}

test('seleciona somente quem respondeu após a private reply e está dentro de 24h', () => {
  const candidate = buildWebsitePromptRecoveryCandidate(context(), { now });
  assert.ok(candidate);
  assert.equal(candidate.lastInboundAt, '2026-08-01T19:00:00.000Z');
  assert.equal(candidate.message, WEBSITE_PROMPT_RECOVERY_MESSAGE);

  assert.equal(buildWebsitePromptRecoveryCandidate(context({
    interactions: [
      { at: '2026-07-31T18:00:00.000Z', direction: 'in', text: 'SARAIVA' },
      { at: '2026-07-31T18:00:01.000Z', direction: 'out', text: 'resposta privada' },
    ],
  }), { now }), undefined);
  assert.equal(buildWebsitePromptRecoveryCandidate(context({
    interactions: [
      { at: '2026-07-30T18:00:00.000Z', direction: 'out', text: 'resposta privada' },
      { at: '2026-07-31T19:59:59.999Z', direction: 'in', text: 'quero' },
    ],
  }), { now }), undefined);
});

test('bloqueia opt-out, prompt já entregue, conversa ausente e campanha errada', () => {
  const optedOut = context();
  optedOut.instagramFlow = { ...optedOut.instagramFlow!, optedOutAt: '2026-08-01T19:30:00.000Z' };
  assert.equal(buildWebsitePromptRecoveryCandidate(optedOut, { now }), undefined);

  const delivered = context();
  delivered.instagramFlow = { ...delivered.instagramFlow!, promptDeliveredAt: '2026-08-01T19:30:00.000Z' };
  assert.equal(buildWebsitePromptRecoveryCandidate(delivered, { now }), undefined);

  const noConversation = context();
  noConversation.instagramFlow = { ...noConversation.instagramFlow!, conversationId: undefined };
  assert.equal(buildWebsitePromptRecoveryCandidate(noConversation, { now }), undefined);

  assert.equal(buildWebsitePromptRecoveryCandidate(context({ postId: 'outro' }), { now }), undefined);
});

test('prepara o estado correto e registra envio sem oferecer produto', () => {
  const candidate = buildWebsitePromptRecoveryCandidate(context(), { now });
  assert.ok(candidate);
  const prepared = prepareWebsitePromptRecoveryContext(candidate, now.toISOString());
  assert.equal(prepared.instagramFlow?.stage, 'awaiting_intent');
  assert.equal(prepared.instagramFlow?.path, undefined);
  assert.match(WEBSITE_PROMPT_RECOVERY_MESSAGE.kind === 'quick_replies'
    ? WEBSITE_PROMPT_RECOVERY_MESSAGE.text
    : '', /liberado gratuitamente/i);
  assert.doesNotMatch(JSON.stringify(WEBSITE_PROMPT_RECOVERY_MESSAGE), /9,97|Laboratório|WhatsApp/i);

  const completed = completeWebsitePromptRecoveryContext(prepared, {
    sentAt: '2026-08-01T20:00:01.000Z',
    messageId: 'message-test',
  });
  assert.equal(completed.instagramFlow?.recoveryMessageId, 'message-test');
  assert.equal(completed.instagramFlow?.recoverySentAt, '2026-08-01T20:00:01.000Z');
  assert.equal(completed.interactions?.at(-1)?.direction, 'out');
  assert.equal(buildWebsitePromptRecoveryCandidate({
    ...completed,
    updatedAt: '2026-08-01T20:00:01.000Z',
  }, { now: new Date('2026-08-01T20:00:02.000Z') }), undefined);
});
