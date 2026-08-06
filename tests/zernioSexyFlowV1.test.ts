import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../src/campaignTrigger.js';
import {
  advanceInstagramFlow,
  createInstagramCommentFlow,
  SARAIVA_FLOW_ID,
} from '../src/instagram/automationFlow.js';
import {
  parseZernioCommentInbound,
  parseZernioLifecycleInbound,
  parseZernioMessageInbound,
} from '../src/zernio/webhook.js';
import {
  findZernioCommentReply,
  findRecentZernioAudioMessage,
  isTerminalZernioConversationError,
  replyZernioComment,
  sendZernioInteractive,
  sendZernioPrivateReply,
} from '../src/zernio/client.js';
import {
  applyZernioLifecycleToContext,
  isZernioLiveForSender,
  shouldDeferToZernio,
} from '../src/lambda.js';
import type { LeadContext } from '../src/store/leadContextStore.js';

const accountId = '6a1205a62b2567671a24e855';

test('modo live deixa as mídias do fluxo exclusivamente no Zernio', () => {
  assert.equal(shouldDeferToZernio(WEBSITE_PROMPT_MEDIA_ID, 'live'), true);
  assert.equal(shouldDeferToZernio(WEBSITE_PROMPT_MEDIA_ID, 'shadow'), false);
  assert.equal(shouldDeferToZernio('outra-midia', 'live'), false);
});

test('conversa arquivada é falha terminal e não deve entrar em retry', () => {
  assert.equal(isTerminalZernioConversationError(new Error(
    'zernio_request_failed:platform_api_error:This conversation thread has been archived or deleted.',
  )), true);
  assert.equal(isTerminalZernioConversationError(new Error('zernio_request_failed:timeout')), false);
});

test('canário libera somente participantes explicitamente permitidos', () => {
  const previous = process.env.ZERNIO_CANARY_SENDER_IDS;
  process.env.ZERNIO_CANARY_SENDER_IDS = 'sender-1,sender-2';
  try {
    assert.equal(isZernioLiveForSender('sender-1', 'canary'), true);
    assert.equal(isZernioLiveForSender('sender-3', 'canary'), false);
    assert.equal(isZernioLiveForSender('sender-3', 'shadow'), false);
    assert.equal(isZernioLiveForSender('sender-3', 'live'), true);
  } finally {
    if (previous === undefined) delete process.env.ZERNIO_CANARY_SENDER_IDS;
    else process.env.ZERNIO_CANARY_SENDER_IDS = previous;
  }
});

function commentEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-comment-1',
    event: 'comment.received',
    comment: {
      id: 'comment-1',
      text: 'SARAIVA',
      author: {
        id: 'instagram-user-1',
        name: 'Ana Silva',
        username: 'ana.silva',
      },
    },
    post: {
      id: PROSPECTING_FLOW_MEDIA_ID,
      platformPostId: PROSPECTING_FLOW_MEDIA_ID,
    },
    account: {
      id: accountId,
      accountId,
      platform: 'instagram',
      username: 'saraiva.ai',
    },
    timestamp: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

function messageEvent(input: { payload?: string; text?: string; isFollower?: boolean } = {}) {
  return {
    id: 'event-message-1',
    event: 'message.received',
    message: {
      id: 'message-1',
      platform: 'instagram',
      platformMessageId: 'mid-1',
      direction: 'incoming',
      text: input.text || '',
      sender: {
        id: 'instagram-user-1',
        name: 'Ana Silva',
        username: 'ana.silva',
        instagramProfile: {
          isFollower: input.isFollower,
        },
      },
    },
    conversation: {
      id: 'conversation-internal-1',
      platformConversationId: 'conversation-platform-1',
      participantId: 'instagram-user-1',
      status: 'active',
    },
    account: {
      id: accountId,
      accountId,
      platform: 'instagram',
      username: 'saraiva.ai',
    },
    metadata: input.payload ? {
      postbackPayload: input.payload,
      postbackTitle: input.text || input.payload,
    } : {},
    timestamp: '2026-07-31T12:01:00.000Z',
  };
}

test('normaliza apenas comentário SARAIVA da conta e mídia exatas', () => {
  assert.deepEqual(parseZernioCommentInbound(commentEvent(), accountId), {
    eventId: 'event-comment-1',
    commentId: 'comment-1',
    mediaId: PROSPECTING_FLOW_MEDIA_ID,
    accountId,
    senderId: 'instagram-user-1',
    senderName: 'Ana Silva',
    username: 'ana.silva',
    text: 'SARAIVA',
    occurredAt: '2026-07-31T12:00:00.000Z',
  });
  assert.equal(parseZernioCommentInbound(commentEvent({
    post: { id: 'post-errado', platformPostId: 'post-errado' },
  }), accountId), undefined);
  assert.equal(parseZernioCommentInbound(commentEvent({
    comment: {
      id: 'comment-2',
      text: 'Quero saber mais',
      author: { id: 'instagram-user-2', username: 'outra.pessoa' },
    },
  }), accountId), undefined);
  assert.equal(parseZernioCommentInbound(commentEvent({
    comment: {
      id: 'comment-3',
      text: 'SARAIVA',
      author: { id: 'owner', username: 'saraiva.ai' },
    },
  }), accountId), undefined);
});

test('normaliza também a mídia exata do reel de sites sem abrir outros posts', () => {
  const sites = parseZernioCommentInbound(commentEvent({
    post: {
      id: WEBSITE_PROMPT_MEDIA_ID,
      platformPostId: WEBSITE_PROMPT_MEDIA_ID,
    },
  }), accountId);
  assert.equal(sites?.mediaId, WEBSITE_PROMPT_MEDIA_ID);
  assert.equal(sites?.text, 'SARAIVA');
  assert.equal(parseZernioCommentInbound(commentEvent({
    post: { id: '18100000000000000', platformPostId: '18100000000000000' },
  }), accountId), undefined);
});

test('normaliza texto livre e postback sem aceitar evento de saída', () => {
  assert.equal(
    parseZernioMessageInbound(messageEvent({
      payload: 'FLOW:SARAIVA:OPEN',
      text: 'QUERO ACESSAR',
    }), accountId)?.payload,
    'FLOW:SARAIVA:OPEN',
  );
  assert.equal(
    parseZernioMessageInbound(messageEvent({ text: 'Bruna' }), accountId)?.text,
    'Bruna',
  );
  const outgoing = messageEvent({ text: 'Bruna' });
  outgoing.message.direction = 'outgoing';
  assert.equal(parseZernioMessageInbound(outgoing, accountId), undefined);
});

test('normaliza eventos de envio e leitura para métricas da sessão', () => {
  const event = messageEvent();
  event.event = 'message.read';
  event.message.direction = 'outgoing';
  assert.deepEqual(parseZernioLifecycleInbound(event, accountId), {
    eventId: 'event-message-1',
    event: 'message.read',
    messageId: 'mid-1',
    conversationId: 'conversation-platform-1',
    accountId,
    senderId: 'instagram-user-1',
    occurredAt: '2026-07-31T12:01:00.000Z',
  });
});

test('message.failed do card pausa a sessão e invalida o checkpoint de entrega', () => {
  const context: LeadContext = {
    senderId: 'instagram-user-1',
    postId: WEBSITE_PROMPT_MEDIA_ID,
    promise: {
      kind: 'sites_whatsapp_workshop',
      label: 'Sites',
      publicReply: '',
      privateReply: '',
    },
    instagramFlow: {
      id: 'saraiva-prospecting-v1',
      campaign: 'sites_workshop',
      stage: 'offering_community',
      path: 'build',
      correlationId: 'corr-failed-card',
      startedAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:01:00.000Z',
    },
    personalizedOffer: {
      reasonCode: 'audio_sent',
      script: 'Áudio. Faz sentido pra você?',
      audioMessageId: 'audio-mid',
      cardMessageId: 'card-mid',
    },
    updatedAt: '2026-07-31T12:01:00.000Z',
  };
  const updated = applyZernioLifecycleToContext(context, {
    eventId: 'event-failed-card',
    event: 'message.failed',
    messageId: 'card-mid',
    conversationId: 'conversation-platform-1',
    accountId,
    senderId: context.senderId,
    occurredAt: '2026-07-31T12:02:00.000Z',
  });
  assert.equal(updated.instagramFlow?.stage, 'technical_paused');
  assert.equal(updated.personalizedOffer?.cardMessageId, undefined);
  assert.equal(updated.automationJournal?.at(-1)?.reasonCode, 'technical_alert');
  assert.equal(updated.automationJournal?.at(-1)?.result, 'technical_paused');
});

test('message.failed do texto do prompt invalida a entrega e pausa a sessão', () => {
  const context: LeadContext = {
    senderId: 'instagram-user-1',
    postId: WEBSITE_PROMPT_MEDIA_ID,
    promise: {
      kind: 'sites_whatsapp_workshop',
      label: 'Sites',
      publicReply: '',
      privateReply: '',
    },
    instagramFlow: {
      id: 'saraiva-prospecting-v1',
      campaign: 'sites_workshop',
      stage: 'offering_product',
      path: 'build',
      correlationId: 'corr-failed-prompt',
      promptDeliveredAt: '2026-07-31T12:01:00.000Z',
      promptMessageId: 'prompt-text-mid',
      productCtaMessageId: 'library-card-mid',
      startedAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:01:00.000Z',
    },
    updatedAt: '2026-07-31T12:01:00.000Z',
  };
  const updated = applyZernioLifecycleToContext(context, {
    eventId: 'event-failed-prompt',
    event: 'message.failed',
    messageId: 'prompt-text-mid',
    conversationId: 'conversation-platform-1',
    accountId,
    senderId: context.senderId,
    occurredAt: '2026-07-31T12:02:00.000Z',
  });

  assert.equal(updated.instagramFlow?.stage, 'technical_paused');
  assert.equal(updated.instagramFlow?.promptDeliveredAt, undefined);
  assert.equal(updated.instagramFlow?.promptMessageId, undefined);
  assert.equal(updated.instagramFlow?.productCtaMessageId, undefined);
  assert.equal(updated.automationJournal?.at(-1)?.reasonCode, 'technical_alert');
});

test('message.failed do áudio de abandono libera somente uma nova tentativa', () => {
  const context: LeadContext = {
    senderId: 'instagram-user-1',
    postId: WEBSITE_PROMPT_MEDIA_ID,
    promise: {
      kind: 'sites_whatsapp_workshop',
      label: 'Sites',
      publicReply: '',
      privateReply: '',
    },
    instagramFlow: {
      id: 'saraiva-prospecting-v1',
      campaign: 'sites_workshop',
      stage: 'awaiting_request',
      path: 'build',
      correlationId: 'corr-failed-followup',
      abandonmentAudioMessageId: 'followup-mid',
      abandonmentAudioSentAt: '2026-07-31T12:06:00.000Z',
      abandonmentAudioStage: 'awaiting_request',
      startedAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:06:00.000Z',
    },
    updatedAt: '2026-07-31T12:06:00.000Z',
  };
  const updated = applyZernioLifecycleToContext(context, {
    eventId: 'event-failed-followup',
    event: 'message.failed',
    messageId: 'followup-mid',
    conversationId: 'conversation-platform-1',
    accountId,
    senderId: context.senderId,
    occurredAt: '2026-07-31T12:07:00.000Z',
  });
  assert.equal(updated.instagramFlow?.stage, 'awaiting_request');
  assert.equal(updated.instagramFlow?.abandonmentAudioMessageId, undefined);
  assert.equal(updated.instagramFlow?.abandonmentAudioStage, undefined);
});

test('sessão nova usa o contrato e os dois caminhos prometidos no Reel', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    correlationId: 'corr-1',
    transport: 'zernio',
    conversationId: 'conversation-platform-1',
  });
  assert.equal(SARAIVA_FLOW_ID, 'saraiva-prospecting-v1');
  assert.equal(entry?.session.transport, 'zernio');
  assert.equal(entry?.session.conversationId, 'conversation-platform-1');
  assert.equal(entry?.message.kind, 'quick_replies');
  if (entry?.message.kind !== 'quick_replies') return;
  assert.deepEqual(entry.message.quickReplies.map((item) => item.title), [
    'VER ESTRUTURA',
  ]);
});

test('sessão do reel de sites exige follow, envia o prompt em texto e só o link da Biblioteca', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    correlationId: 'corr-sites-zernio',
    transport: 'zernio',
  })!;
  assert.equal(entry.session.campaign, 'sites_workshop');
  assert.equal(entry.session.stage, 'awaiting_intent');
  assert.equal(entry.message.kind, 'quick_replies');
  if (entry.message.kind !== 'quick_replies') return;
  assert.deepEqual(entry.message.quickReplies.map((item) => item.title), ['MINHA EMPRESA', 'VENDER SITES']);

  const gated = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { firstName: 'Ana', followStatus: 'not_following' })!;
  assert.equal(gated.session.stage, 'awaiting_follow');
  const delivery = advanceInstagramFlow(gated.session, {
    payload: 'FLOW:SARAIVA:FOLLOW_CONFIRMED',
  }, { firstName: 'Ana', followStatus: 'following' })!;
  assert.equal(delivery.session.stage, 'offering_product');
  assert.equal(delivery.message.kind, 'text');
  assert.equal(delivery.messages?.length, 2);
  const serialized = JSON.stringify([entry, gated, delivery]);
  assert.match(serialized, /JÁ SEGUI/);
  assert.match(serialized, /PROMPT DO VÍDEO — COPIE E COLE/);
  assert.match(serialized, /VER A BIBLIOTECA|\/instagram\/product\?/);
  assert.doesNotMatch(serialized, /COPIAR PROMPT|\/instagram\/prompt\?/);
  assert.equal((serialized.match(/https?:/g) || []).length, 1);
  assert.doesNotMatch(
    serialized,
    /Gerador|Cliente Pronto|Laboratório|qual é o seu negócio|questionário|últimas vagas|80% off|R\$ 97/i,
  );
});

test('caminho ferramenta pronta qualifica e envia direto para o WhatsApp', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    correlationId: 'corr-ready',
  })!;
  const business = advanceInstagramFlow(
    entry.session,
    { payload: 'FLOW:SARAIVA:OPEN' },
    { firstName: 'Ana' },
  )!;
  assert.equal(business.session.stage, 'offering_community');
  assert.equal(business.offer?.path, 'ready');
  assert.equal(business.offer?.kind, 'community');
  assert.equal(business.offer?.card.title, 'Laboratório de Agentes & IA Saraiva');
  assert.deepEqual(business.offer?.card.buttons.map((button) => button.title), [
    'ACESSAR LABORATÓRIO',
  ]);
  const button = business.offer?.card.buttons[0];
  assert.equal(button?.type, 'web_url');
  if (button?.type !== 'web_url') return;
  assert.match(
    button.url,
    /\/instagram\/community\?/,
  );
  assert.match(button.url, /intent=ter/);
  assert.match(button.url, /correlation=corr-ready/);
});

test('caminho aprender qualifica o objetivo antes do mesmo WhatsApp', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    correlationId: 'corr-build',
  })!;
  const goal = advanceInstagramFlow(
    entry.session,
    { payload: 'FLOW:SARAIVA:OPEN' },
    { firstName: 'Leo' },
  )!;
  assert.equal(goal.session.stage, 'offering_community');
  assert.equal(goal.offer?.kind, 'community');
});

test('private reply e resposta pública usam endpoints Zernio sem vazar a chave', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(
      calls.length === 1
        ? { status: 'success', messageId: 'private-mid', commentId: 'comment-1', platform: 'instagram' }
        : { success: true, data: { commentId: 'public-reply-1', isReply: true } },
    ), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const privateReply = await sendZernioPrivateReply({
    apiKey: 'secret-key',
    accountId,
    mediaId: PROSPECTING_FLOW_MEDIA_ID,
    commentId: 'comment-1',
    message: 'Mensagem',
    buttons: [{
      type: 'postback',
      title: 'QUERO ACESSAR',
      payload: 'FLOW:SARAIVA:OPEN',
    }],
    fetchImpl,
  });
  assert.equal(privateReply.messageId, 'private-mid');
  assert.match(calls[0]!.url, /\/comments\/18299164084305199\/comment-1\/private-reply$/);

  await replyZernioComment({
    apiKey: 'secret-key',
    accountId,
    mediaId: PROSPECTING_FLOW_MEDIA_ID,
    commentId: 'comment-1',
    message: 'Te enviei na DM. Toque no botão para acessar.',
    fetchImpl,
  });
  assert.match(calls[1]!.url, /\/comments\/18299164084305199$/);
  assert.deepEqual(JSON.parse(String(calls[1]!.init?.body)), {
    accountId,
    message: 'Te enviei na DM. Toque no botão para acessar.',
    commentId: 'comment-1',
  });
  assert.doesNotMatch(JSON.stringify(calls), /secret-key[^"]*https|sk_/);
});

test('retry reconcilia resposta pública existente antes de publicar outra', async () => {
  const calls: string[] = [];
  const replyId = await findZernioCommentReply({
    apiKey: 'secret-key',
    accountId,
    mediaId: WEBSITE_PROMPT_MEDIA_ID,
    commentId: 'comment-sites-1',
    message: 'Te enviei o passo a passo no Direct 👀',
    fetchImpl: async (url, init) => {
      calls.push(`${init?.method || 'GET'} ${String(url)}`);
      return new Response(JSON.stringify({
        status: 'success',
        comments: [{
          id: 'comment-sites-1',
          replies: [
            { id: 'other', message: 'Outra resposta', from: { isOwner: true } },
            {
              id: 'public-existing',
              message: '  Te enviei o passo a passo no Direct 👀 ',
              from: { isOwner: true },
            },
          ],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(replyId, 'public-existing');
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^GET .*\/inbox\/comments\/18130447453725127\?/);
});

test('áudio passa pelo upload temporário do Zernio antes do envio ao Instagram', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }
    if (calls.length === 2) {
      return new Response(JSON.stringify({
        url: 'https://cdn.zernio.com/temp/saraiva.mp3',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      success: true,
      data: { messageId: 'audio-mid' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const messageId = await sendZernioInteractive({
    apiKey: 'secret-key',
    accountId,
    conversationId: 'conversation-platform-1',
    message: { kind: 'audio', url: 'https://signed.example/saraiva.mp3?sig=private' },
    audioConverter: async (bytes) => ({
      bytes,
      contentType: 'audio/mp4',
      filename: 'saraiva.m4a',
    }),
    fetchImpl,
  });

  assert.equal(messageId, 'audio-mid');
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, 'https://signed.example/saraiva.mp3?sig=private');
  assert.match(calls[1]!.url, /\/v1\/media\/upload-direct$/);
  assert.ok(calls[1]?.init?.body instanceof FormData);
  const sentBody = JSON.parse(String(calls[2]?.init?.body));
  assert.equal(sentBody.attachmentType, 'audio');
  assert.equal(sentBody.attachmentUrl, 'https://cdn.zernio.com/temp/saraiva.mp3');
  assert.doesNotMatch(JSON.stringify(calls.slice(1)), /sig=private|secret-key[^"]*https/);
});

test('reconcilia áudio aceito pelo Instagram após resposta lenta do Zernio', async () => {
  const messageId = await findRecentZernioAudioMessage({
    apiKey: 'secret-key',
    accountId,
    conversationId: 'conversation-platform-1',
    since: '2026-07-31T12:00:00.000Z',
    fetchImpl: async () => new Response(JSON.stringify({
      data: {
        messages: [
          {
            id: 'text-mid',
            direction: 'outgoing',
            createdAt: '2026-07-31T12:01:00.000Z',
            attachments: [],
          },
          {
            id: 'audio-mid',
            direction: 'outgoing',
            createdAt: '2026-07-31T12:02:00.000Z',
            attachments: [{ type: 'audio' }],
          },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(messageId, 'audio-mid');
});

test('retry reconcilia card já aceito antes de enviar novamente', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const messageId = await sendZernioInteractive({
    apiKey: 'secret-key',
    accountId,
    conversationId: 'conversation-platform-1',
    reconcileSince: '2026-07-31T12:00:00.000Z',
    message: {
      kind: 'link_card',
      title: 'Crie seu site com o ChatGPT',
      subtitle: 'Passo a passo no WhatsApp.',
      buttons: [{
        type: 'web_url',
        title: 'CRIAR MEU SITE NO WHATSAPP',
        url: 'https://example.com/tracked',
      }],
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        messages: [{
          id: 'existing-card-mid',
          direction: 'outgoing',
          createdAt: '2026-07-31T12:01:00.000Z',
          deliveryStatus: 'sent',
          message: 'Crie seu site com o ChatGPT\nPasso a passo no WhatsApp.',
          attachments: [],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(messageId, 'existing-card-mid');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.method, undefined);
  assert.match(calls[0]!.url, /sortOrder=desc/);
});

test('reconciliação ignora mensagem falha e permite um novo envio', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const messageId = await sendZernioInteractive({
    apiKey: 'secret-key',
    accountId,
    conversationId: 'conversation-platform-1',
    reconcileSince: '2026-07-31T12:00:00.000Z',
    message: { kind: 'text', text: 'Mensagem segura' },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          messages: [{
            id: 'failed-mid',
            direction: 'outgoing',
            createdAt: '2026-07-31T12:01:00.000Z',
            deliveryStatus: 'failed',
            message: 'Mensagem segura',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        success: true,
        data: { messageId: 'replacement-mid' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(messageId, 'replacement-mid');
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.init?.method, 'POST');
});

test('erro Zernio preserva diagnóstico útil sem vazar URL ou credencial', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    error: 'Media rejected at https://private.example/audio.mp3?sig=abc using sk_secret123',
  }), { status: 400, headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    sendZernioPrivateReply({
      apiKey: 'secret-key',
      accountId,
      mediaId: PROSPECTING_FLOW_MEDIA_ID,
      commentId: 'comment-1',
      message: 'Mensagem',
      buttons: [{ type: 'postback', title: 'CONTINUAR', payload: 'FLOW:TEST' }],
      fetchImpl,
    }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /zernio_request_failed:400:Media rejected/);
      assert.doesNotMatch(message, /private\.example|sk_secret123/);
      return true;
    },
  );
});

test('fluxo completo não contém checkout, loja ou rota humana', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID)!;
  const offered = advanceInstagramFlow(
    entry.session,
    { payload: 'FLOW:SARAIVA:OPEN' },
    { firstName: 'Ana' },
  )!;
  const serialized = JSON.stringify([entry, offered]);
  assert.doesNotMatch(
    serialized,
    /hello-world-project|lovable|ver exemplo|loja\.saraiva\.ai|comprar|checkout|falar com saraiva|payload\.human|handoff|atendimento humano/i,
  );
  assert.match(serialized, /ACESSAR LABORATÓRIO/);
});
