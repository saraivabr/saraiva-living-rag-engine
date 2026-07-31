import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommentRecoveryValidationError,
  recoverComments,
  validateCommentRecoveryManifest,
  type CommentRecoveryDependencies,
  type CommentRecoveryManifest,
  type PersistLeadInput,
} from '../src/operations/commentRecovery.js';
import type { IgComment } from '../src/instagram/types.js';

const manifest: CommentRecoveryManifest = {
  accountUsername: 'saraiva.ai',
  mediaId: '17876885349503055',
  postPermalink: 'https://www.instagram.com/p/DafhHdJEhwU/',
  promiseKind: 'voice_ai_map_workshop',
  promiseLabel: 'mapa da IA de ligacao no WhatsApp',
  privateReply: 'boa. aqui esta o mapa prometido. onde voce quer aplicar primeiro?',
  publicReply: 'Te mandei na DM o mapa e uma pergunta para adaptar ao teu caso.',
  comments: [{ commentId: '18000000000000001' }],
};

test('aceita a campanha do prompt de sites como promessa de recuperacao', () => {
  const websiteManifest = validateCommentRecoveryManifest({
    ...manifest,
    promiseKind: 'website_prompt',
  });

  assert.equal(websiteManifest.promiseKind, 'website_prompt');
});

test('dry-run planeja sem exigir dependencias nem causar efeitos', async () => {
  const summary = await recoverComments({ manifest, execute: false });

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, 'dry-run');
  assert.equal(summary.totals.requested, 1);
  assert.deepEqual(summary.results[0], {
    commentId: '18000000000000001',
    status: 'planned',
    privateReply: 'planned',
    persistence: 'planned',
    publicReply: 'planned',
  });
});

test('execucao respeita private -> persistencia -> marcacao -> publico', async () => {
  const events: string[] = [];
  const dependencies = fakeDependencies({ events });

  const summary = await recoverComments({
    manifest,
    execute: true,
    delayMs: 0,
    dependencies,
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.results[0]?.status, 'completed');
  assert.deepEqual(events, [
    'get-comments',
    'private',
    'wait',
    'persist',
    'mark-private',
    'public',
    'mark-public',
    'wait',
  ]);
});

test('falha da private reply bloqueia persistencia e resposta publica', async () => {
  const events: string[] = [];
  const dependencies = fakeDependencies({
    events,
    privateError: new Error('Graph API indisponivel'),
  });

  const summary = await recoverComments({
    manifest,
    execute: true,
    delayMs: 0,
    dependencies,
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.results[0]?.status, 'failed');
  assert.equal(summary.results[0]?.errorCode, 'private_reply_failed');
  assert.deepEqual(events, ['get-comments', 'private']);
});

test('falha ao marcar o store depois de persistir nunca libera o publico', async () => {
  const events: string[] = [];
  const dependencies = fakeDependencies({
    events,
    markPrivateError: new Error('DynamoDB indisponivel'),
  });

  const summary = await recoverComments({
    manifest,
    execute: true,
    delayMs: 0,
    dependencies,
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.results[0]?.persistence, 'saved');
  assert.equal(summary.results[0]?.publicReply, 'blocked');
  assert.equal(summary.results[0]?.errorCode, 'private_store_mark_failed');
  assert.deepEqual(events, ['get-comments', 'private', 'wait', 'persist', 'mark-private']);
});

test('rerun nao duplica mensagens quando private e publico ja tem evidencia', async () => {
  const events: string[] = [];
  const dependencies = fakeDependencies({
    events,
    privateMarked: true,
    persisted: { senderId: '17840000000000001', complete: true },
    existingPublicText: manifest.publicReply,
  });

  const summary = await recoverComments({
    manifest,
    execute: true,
    delayMs: 0,
    dependencies,
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.results[0]?.status, 'skipped');
  assert.equal(summary.results[0]?.privateReply, 'already_done');
  assert.equal(summary.results[0]?.persistence, 'already_done');
  assert.equal(summary.results[0]?.publicReply, 'already_done');
  assert.deepEqual(events, ['get-comments', 'mark-public']);
});

test('marcacao privada sem contexto bloqueia o publico', async () => {
  const events: string[] = [];
  const dependencies = fakeDependencies({ events, privateMarked: true });

  const summary = await recoverComments({
    manifest,
    execute: true,
    delayMs: 0,
    dependencies,
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.results[0]?.status, 'blocked');
  assert.equal(summary.results[0]?.errorCode, 'private_reply_context_missing');
  assert.deepEqual(events, ['get-comments']);
});

test('bloqueia copy com placeholder ou vazamento de instrucao', () => {
  assert.throws(
    () => validateCommentRecoveryManifest({
      ...manifest,
      publicReply: 'Para responder a esse comentário, preciso do nome de usuário.',
    }),
    (error: unknown) => error instanceof CommentRecoveryValidationError
      && error.code === 'public_reply_unsafe',
  );
});

test('bloqueia conta logada diferente da declarada no manifesto', async () => {
  const dependencies = fakeDependencies({ events: [] });
  dependencies.ownUsername = 'outra.conta';

  await assert.rejects(
    recoverComments({ manifest, execute: true, dependencies }),
    (error: unknown) => error instanceof CommentRecoveryValidationError
      && error.code === 'account_username_mismatch',
  );
});

test('nao envia duas private replies para o mesmo seguidor no mesmo lote', async () => {
  const events: string[] = [];
  const dependencies = fakeDependencies({ events });
  const originalGetComments = dependencies.getComments;
  dependencies.getComments = async (mediaId) => {
    const [first] = await originalGetComments(mediaId);
    return [
      first!,
      { ...first!, id: '18000000000000002' },
    ];
  };

  const summary = await recoverComments({
    manifest: {
      ...manifest,
      comments: [
        { commentId: '18000000000000001' },
        { commentId: '18000000000000002' },
      ],
    },
    execute: true,
    delayMs: 0,
    dependencies,
  });

  assert.equal(summary.totals.completed, 1);
  assert.equal(summary.totals.blocked, 1);
  assert.equal(summary.results[1]?.errorCode, 'duplicate_follower_in_batch');
  assert.equal(events.filter((event) => event === 'private').length, 1);
});

test('recupera publicamente quando a Meta confirma private reply ja consumida', async () => {
  const events: string[] = [];
  const dependencies = fakeDependencies({ events });

  const summary = await recoverComments({
    manifest: {
      ...manifest,
      publicReply: 'Me chama no Direct com VOZ e me diz onde quer aplicar primeiro?',
      comments: [{
        commentId: '18000000000000001',
        senderId: '17840000000000001',
        privateReplyAlreadyUsed: true,
      }],
    },
    execute: true,
    delayMs: 0,
    dependencies,
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.results[0]?.status, 'completed');
  assert.equal(summary.results[0]?.privateReply, 'already_done');
  assert.deepEqual(events, [
    'get-comments',
    'persist-without-private-copy',
    'mark-private',
    'public',
    'mark-public',
    'wait',
  ]);
});

test('private reply ja consumida exige senderId confirmado no Graph', () => {
  assert.throws(
    () => validateCommentRecoveryManifest({
      ...manifest,
      comments: [{
        commentId: '18000000000000001',
        privateReplyAlreadyUsed: true,
      }],
    }),
    (error: unknown) => error instanceof CommentRecoveryValidationError
      && error.code === 'private_reply_already_used_sender_missing',
  );
});

test('private reply ja consumida bloqueia alegacao publica falsa de DM enviada', () => {
  assert.throws(
    () => validateCommentRecoveryManifest({
      ...manifest,
      publicReply: 'Te mandei agora na DM o material prometido.',
      comments: [{
        commentId: '18000000000000001',
        senderId: '17840000000000001',
        privateReplyAlreadyUsed: true,
      }],
    }),
    (error: unknown) => error instanceof CommentRecoveryValidationError
      && error.code === 'public_reply_false_private_claim',
  );
});

function fakeDependencies(options: {
  events: string[];
  privateError?: Error;
  markPrivateError?: Error;
  privateMarked?: boolean;
  persisted?: { senderId: string; complete: boolean };
  existingPublicText?: string;
}): CommentRecoveryDependencies {
  const privateReplies = new Set<string>(
    options.privateMarked ? [manifest.comments[0]!.commentId] : [],
  );
  let persisted = options.persisted;
  const liveComment: IgComment = {
    id: manifest.comments[0]!.commentId,
    username: 'seguidor_teste',
    text: 'VOZ',
    replies: {
      data: options.existingPublicText
        ? [{ id: '18100000000000001', username: 'saraiva.ai', text: options.existingPublicText }]
        : [],
    },
  };

  return {
    ownUsername: 'saraiva.ai',
    getComments: async () => {
      options.events.push('get-comments');
      return [liveComment];
    },
    hasPrivateReply: (commentId) => privateReplies.has(commentId),
    markPrivateReply: async (commentId) => {
      options.events.push('mark-private');
      if (options.markPrivateError) throw options.markPrivateError;
      privateReplies.add(commentId);
    },
    markPublicReply: async () => {
      options.events.push('mark-public');
    },
    findPersistedLead: () => persisted,
    persistLead: async (input: PersistLeadInput) => {
      options.events.push(input.privateReplyKnownSent === false ? 'persist-without-private-copy' : 'persist');
      persisted = { senderId: input.senderId, complete: true };
    },
    sendPrivateReply: async () => {
      options.events.push('private');
      if (options.privateError) throw options.privateError;
      return '17840000000000001';
    },
    replyToComment: async () => {
      options.events.push('public');
      return '18100000000000002';
    },
    wait: async () => {
      options.events.push('wait');
    },
  };
}
