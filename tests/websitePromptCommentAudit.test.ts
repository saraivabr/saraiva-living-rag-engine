import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditWebsitePromptComments,
  selectContactedCommentsWithoutContext,
  selectWebsitePromptFirstReplyCandidates,
} from '../src/operations/websitePromptCommentAudit.js';
import type { LeadContext } from '../src/store/leadContextStore.js';

const context: LeadContext = {
  senderId: 'sender-1',
  commentId: 'comment-1',
  postId: '18130447453725127',
  promise: { kind: 'website_prompt', label: 'Prompt', privateReply: '', publicReply: '' },
  instagramFlow: {
    id: 'saraiva-prospecting-v1',
    campaign: 'sites_workshop',
    stage: 'offering_product',
    correlationId: 'corr-1',
    transport: 'zernio',
    conversationId: 'conversation-1',
    promptDeliveredAt: '2026-08-01T11:10:00.000Z',
    recoverySentAt: '2026-08-01T11:05:00.000Z',
    startedAt: '2026-08-01T11:00:00.000Z',
    updatedAt: '2026-08-01T11:10:00.000Z',
  },
  interactions: [
    { at: '2026-08-01T11:00:00.000Z', direction: 'in', text: 'SARAIVA' },
    { at: '2026-08-01T11:00:01.000Z', direction: 'out', text: 'Direct' },
    { at: '2026-08-01T11:09:00.000Z', direction: 'in', text: 'MINHA EMPRESA' },
  ],
  updatedAt: '2026-08-01T11:10:00.000Z',
};

test('cruza todos os comentários sem expor identificadores de usuários', () => {
  const result = auditWebsitePromptComments({
    comments: [
      {
        id: 'comment-1',
        text: 'SARAIVA',
        username: 'pessoa-1',
        from: { id: 'sender-1', username: 'pessoa-1' },
        timestamp: '2026-08-01T11:00:00.000Z',
        replies: { data: [{ username: 'saraiva.ai', text: 'Te chamei no Direct' }] },
      },
      {
        id: 'comment-2',
        text: 'SARAÍVA',
        username: 'pessoa-2',
        from: { id: 'sender-2', username: 'pessoa-2' },
        timestamp: '2026-08-01T11:30:00.000Z',
      },
      {
        id: 'comment-3',
        text: 'Onde eu recebo?',
        username: 'pessoa-2',
        from: { id: 'sender-2', username: 'pessoa-2' },
        timestamp: '2026-08-01T11:40:00.000Z',
      },
    ],
    contexts: [context],
    privateMarkers: ['comment-1'],
    publicMarkers: ['comment-1'],
    ownUsername: 'saraiva.ai',
    now: new Date('2026-08-01T12:00:00.000Z'),
  });

  assert.equal(result.coverage.comments, 3);
  assert.equal(result.coverage.uniqueCommenters, 2);
  assert.equal(result.comments.exactKeyword, 2);
  assert.equal(result.comments.nonKeyword, 1);
  assert.equal(result.publicReplies.replied, 1);
  assert.equal(result.state.commentsWithContext, 1);
  assert.equal(result.state.genuineDirectReplies, 1);
  assert.equal(result.state.promptDelivered, 1);
  assert.equal(result.actionable.firstReplyCandidates, 1);
  assert.equal(result.themes[0].theme, 'delivery_request');
  assert.doesNotMatch(JSON.stringify(result), /pessoa-1|pessoa-2|sender-1/);
});

test('seleciona primeira resposta só com autor, janela, palavra-chave e ausência de evidência', () => {
  const comments = [{
    id: 'comment-new',
    text: 'SARAÍVA',
    timestamp: '2026-08-01T11:00:00.000Z',
    from: { id: 'sender-new', username: 'pessoa' },
  }];
  assert.equal(selectWebsitePromptFirstReplyCandidates({
    comments,
    contexts: [],
    ownUsername: 'saraiva.ai',
    now: new Date('2026-08-01T12:00:00.000Z'),
  }).length, 1);
  assert.equal(selectWebsitePromptFirstReplyCandidates({
    comments,
    contexts: [],
    privateMarkers: ['comment-new'],
    ownUsername: 'saraiva.ai',
    now: new Date('2026-08-01T12:00:00.000Z'),
  }).length, 0);
  assert.equal(selectWebsitePromptFirstReplyCandidates({
    comments,
    contexts: [],
    ownUsername: 'saraiva.ai',
    now: new Date('2026-08-09T12:00:00.000Z'),
  }).length, 0);
});

test('backfill escolhe só o comentário mais recente por autor sem contexto', () => {
  const comments = [
    {
      id: 'old',
      text: 'SARAIVA',
      timestamp: '2026-08-01T10:00:00.000Z',
      from: { id: 'sender-new', username: 'pessoa' },
      replies: { data: [{ username: 'saraiva.ai', text: 'Te chamei' }] },
    },
    {
      id: 'new',
      text: 'SARAIVA',
      timestamp: '2026-08-01T11:00:00.000Z',
      from: { id: 'sender-new', username: 'pessoa' },
      replies: { data: [{ username: 'saraiva.ai', text: 'Te chamei' }] },
    },
  ];
  const selected = selectContactedCommentsWithoutContext({ comments, contexts: [], ownUsername: 'saraiva.ai' });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'new');
});

test('não considera comentário público inicial como resposta genuína no Direct', () => {
  const initialOnly: LeadContext = {
    ...context,
    instagramFlow: { ...context.instagramFlow!, promptDeliveredAt: undefined, recoverySentAt: undefined },
    interactions: [
      { at: '2026-08-01T11:00:00.000Z', direction: 'in', text: 'SARAIVA' },
      { at: '2026-08-01T11:00:01.000Z', direction: 'out', text: 'Direct' },
    ],
  };
  const result = auditWebsitePromptComments({
    comments: [{ id: 'comment-1', text: 'SARAIVA', timestamp: '2026-08-01T11:00:00.000Z' }],
    contexts: [initialOnly],
    ownUsername: 'saraiva.ai',
    now: new Date('2026-08-01T12:00:00.000Z'),
  });
  assert.equal(result.state.genuineDirectReplies, 0);
  assert.equal(result.actionable.waitForNewInbound, 1);
});
