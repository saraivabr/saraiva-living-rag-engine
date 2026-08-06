import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildZernioFlowReply,
  isZernioWebhookPath,
  parseZernioInbound,
  verifyZernioWebhookSignature,
} from '../src/zernio/webhook.js';
import { sendZernioMessage } from '../src/zernio/client.js';
import { handleZernioWebhook } from '../src/zernio/handler.js';

const accountId = '6a1205a62b2567671a24e855';

test('reconhece somente a rota dedicada do Zernio', () => {
  assert.equal(isZernioWebhookPath('/webhooks/zernio'), true);
  assert.equal(isZernioWebhookPath('/api/webhooks/zernio'), true);
  assert.equal(isZernioWebhookPath('/chatrace'), false);
});

function messageEvent(
  payload = 'FLOW:SARAIVA:OPEN',
  isFollower: boolean | 'unknown' = true,
) {
  return {
    id: 'event-123',
    event: 'message.received',
    message: {
      id: 'message-123',
      conversationId: 'internal-conversation',
      platform: 'instagram',
      platformMessageId: 'mid-123',
      direction: 'incoming',
      text: 'QUERO VER',
      attachments: [],
      sender: {
        id: 'instagram-user-123',
        name: 'Ana Silva',
        username: 'ana.silva',
        instagramProfile: isFollower === 'unknown' ? {} : { isFollower },
      },
      sentAt: '2026-07-31T12:00:00.000Z',
      isRead: false,
    },
    conversation: {
      id: 'internal-conversation',
      platformConversationId: 'ig-conversation-123',
      participantId: 'instagram-user-123',
      status: 'active',
    },
    account: {
      id: accountId,
      accountId,
      profileId: '69fe7bc6afc92a9186e5e7e1',
      platform: 'instagram',
      username: 'saraiva.ai',
    },
    metadata: {
      postbackPayload: payload,
      postbackTitle: 'QUERO VER',
    },
    timestamp: '2026-07-31T12:00:00.000Z',
  };
}

test('valida assinatura HMAC SHA-256 do Zernio sem aceitar assinatura adulterada', () => {
  const rawBody = JSON.stringify(messageEvent());
  const secret = 'webhook-secret';
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyZernioWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyZernioWebhookSignature(`${rawBody}x`, signature, secret), false);
  assert.equal(verifyZernioWebhookSignature(rawBody, '', secret), false);
});

test('aceita somente postback recebido no Instagram e na conta saraiva.ai', () => {
  const inbound = parseZernioInbound(messageEvent(), accountId);
  assert.deepEqual(inbound, {
    eventId: 'event-123',
    messageId: 'mid-123',
    conversationId: 'ig-conversation-123',
    accountId,
    senderId: 'instagram-user-123',
    senderName: 'Ana Silva',
    username: 'ana.silva',
    followStatus: 'following',
    payload: 'FLOW:SARAIVA:OPEN',
    text: 'QUERO VER',
  });

  assert.equal(parseZernioInbound({
    ...messageEvent(),
    account: { ...messageEvent().account, id: 'outra-conta', accountId: 'outra-conta' },
  }, accountId), undefined);
  assert.equal(parseZernioInbound({
    ...messageEvent(),
    message: { ...messageEvent().message, direction: 'outgoing' },
  }, accountId), undefined);
});

test('preserva o status de follow informado pelo Zernio sem inferir ausente', () => {
  assert.equal(parseZernioInbound(messageEvent('FLOW:SARAIVA:OPEN', true), accountId)?.followStatus, 'following');
  assert.equal(parseZernioInbound(messageEvent('FLOW:SARAIVA:OPEN', false), accountId)?.followStatus, 'not_following');
  assert.equal(parseZernioInbound(messageEvent('FLOW:SARAIVA:OPEN', 'unknown'), accountId)?.followStatus, 'unknown');
});

test('clique QUERO COPIAR gera os dois caminhos como postbacks clicáveis', () => {
  const reply = buildZernioFlowReply('FLOW:SARAIVA:OPEN', 'Ana');
  assert.equal(reply?.message, 'Ana, quer colocar pra rodar ou aprender a montar?');
  assert.deepEqual(reply?.buttons, [
    {
      type: 'postback',
      title: 'QUERO USAR',
      payload: 'FLOW:SARAIVA:READY',
    },
    {
      type: 'postback',
      title: 'QUERO APRENDER',
      payload: 'FLOW:SARAIVA:BUILD',
    },
  ]);
});

test('nome de perfil não confiável não duplica o pronome na copy', () => {
  const reply = buildZernioFlowReply('FLOW:SARAIVA:OPEN', 'empresa.ia.br');
  assert.equal(
    reply?.message,
    'Quer colocar pra rodar ou aprender a montar?',
  );
});

test('ramos seguintes nunca oferecem atendimento humano', () => {
  const ready = buildZernioFlowReply('FLOW:SARAIVA:READY', 'Ana');
  const build = buildZernioFlowReply('FLOW:SARAIVA:BUILD', 'Ana');
  const serialized = JSON.stringify([ready, build]);

  assert.match(serialized, /Qual é o seu negócio/);
  assert.match(serialized, /automatizar primeiro/);
  assert.doesNotMatch(serialized, /loja\.saraiva\.ai|checkout|comprar/i);
  assert.doesNotMatch(serialized, /falar com saraiva|payload\.human|handoff|atendimento humano/i);
});

test('cliente envia a resposta no conversationId da plataforma sem vazar a chave', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      success: true,
      data: {
        messageId: 'sent-123',
        conversationId: 'ig-conversation-123',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await sendZernioMessage({
    apiKey: 'secret-key',
    accountId,
    conversationId: 'ig-conversation-123',
    reply: buildZernioFlowReply('FLOW:SARAIVA:OPEN', 'Ana')!,
    fetchImpl,
  });

  assert.equal(result.messageId, 'sent-123');
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    'https://zernio.com/api/v1/inbox/conversations/ig-conversation-123/messages',
  );
  assert.equal(
    (calls[0]?.init?.headers as Record<string, string>).authorization,
    'Bearer secret-key',
  );
  assert.doesNotMatch(String(calls[0]?.url), /secret-key/);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    accountId,
    message: 'Ana, quer colocar pra rodar ou aprender a montar?',
    buttons: [
      {
        type: 'postback',
        title: 'QUERO USAR',
        payload: 'FLOW:SARAIVA:READY',
      },
      {
        type: 'postback',
        title: 'QUERO APRENDER',
        payload: 'FLOW:SARAIVA:BUILD',
      },
    ],
  });
});

test('handler verifica assinatura, deduplica e envia a próxima etapa', async () => {
  const rawBody = JSON.stringify(messageEvent());
  const webhookSecret = 'webhook-secret';
  const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const sent: string[] = [];
  let firstDelivery = true;

  const first = await handleZernioWebhook({
    rawBody,
    signature,
    webhookSecret,
    apiKey: 'secret-key',
    accountId,
    markOnce: async () => {
      const claimed = firstDelivery;
      firstDelivery = false;
      return claimed;
    },
    sendMessage: async (input) => {
      sent.push(input.reply.message);
      return { messageId: 'sent-123', conversationId: input.conversationId };
    },
  });
  const duplicate = await handleZernioWebhook({
    rawBody,
    signature,
    webhookSecret,
    apiKey: 'secret-key',
    accountId,
    markOnce: async () => false,
    sendMessage: async () => {
      throw new Error('duplicate_must_not_send');
    },
  });

  assert.deepEqual(first, {
    statusCode: 200,
    body: { ok: true, handled: 1, messageId: 'sent-123' },
  });
  assert.deepEqual(duplicate, {
    statusCode: 200,
    body: { ok: true, handled: 0, duplicate: true },
  });
  assert.equal(sent.length, 1);
});

test('handler rejeita assinatura inválida e ignora evento fora do fluxo', async () => {
  const rawBody = JSON.stringify(messageEvent('OUTRO:PAYLOAD'));
  const result = await handleZernioWebhook({
    rawBody,
    signature: '0'.repeat(64),
    webhookSecret: 'webhook-secret',
    apiKey: 'secret-key',
    accountId,
    markOnce: async () => true,
  });
  assert.deepEqual(result, {
    statusCode: 403,
    body: { ok: false, error: 'invalid signature' },
  });
});
