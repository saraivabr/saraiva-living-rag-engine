import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../campaignTrigger.js';

export const ZERNIO_FLOW_PAYLOAD = {
  open: 'FLOW:SARAIVA:OPEN',
  ready: 'FLOW:SARAIVA:READY',
  build: 'FLOW:SARAIVA:BUILD',
} as const;

const FLOW_MEDIA_IDS = new Set([
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
]);

export interface ZernioInbound {
  eventId: string;
  messageId: string;
  conversationId: string;
  accountId: string;
  senderId: string;
  senderName?: string;
  username?: string;
  payload: string;
  text: string;
}

export interface ZernioCommentInboundV1 {
  eventId: string;
  commentId: string;
  mediaId: string;
  accountId: string;
  senderId: string;
  senderName?: string;
  username?: string;
  text: string;
  occurredAt: string;
}

export type ZernioMessageInboundV1 = ZernioInbound & {
  occurredAt: string;
};

export interface ZernioLifecycleInboundV1 {
  eventId: string;
  event:
    | 'conversation.started'
    | 'message.sent'
    | 'message.delivered'
    | 'message.read'
    | 'message.edited'
    | 'message.deleted'
    | 'message.failed'
    | 'account.connected'
    | 'account.disconnected';
  messageId: string;
  conversationId: string;
  accountId: string;
  senderId: string;
  occurredAt: string;
}

export interface ZernioButton {
  type: 'postback' | 'url';
  title: string;
  payload?: string;
  url?: string;
}

export interface ZernioFlowReply {
  message: string;
  buttons?: ZernioButton[];
}

export function isZernioWebhookPath(path: string): boolean {
  return /^\/(?:api\/)?webhooks\/zernio\/?$/i.test(path.trim());
}

export function verifyZernioWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  const normalized = signature.startsWith('sha256=')
    ? signature.slice('sha256='.length)
    : signature;
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const receivedBuffer = Buffer.from(normalized, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function parseZernioInbound(
  payload: unknown,
  expectedAccountId: string,
): ZernioInbound | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const event = payload as Record<string, unknown>;
  if (event.event !== 'message.received') return undefined;

  const message = record(event.message);
  const conversation = record(event.conversation);
  const account = record(event.account);
  const metadata = record(event.metadata);
  const sender = record(message.sender);
  const accountId = stringValue(account.accountId) || stringValue(account.id);
  const conversationId = stringValue(conversation.platformConversationId);
  const senderId = stringValue(sender.id);
  const postbackPayload = stringValue(metadata.postbackPayload);
  const quickReplyPayload = stringValue(metadata.quickReplyPayload);
  const inboundPayload = postbackPayload || quickReplyPayload;

  if (
    !expectedAccountId
    || accountId !== expectedAccountId
    || account.platform !== 'instagram'
    || message.platform !== 'instagram'
    || message.direction !== 'incoming'
    || !conversationId
    || !senderId
    || (!inboundPayload && !stringValue(message.text))
  ) {
    return undefined;
  }

  return {
    eventId: stringValue(event.id),
    messageId: stringValue(message.platformMessageId) || stringValue(message.id),
    conversationId,
    accountId,
    senderId,
    senderName: optionalString(sender.name),
    username: optionalString(sender.username),
    payload: inboundPayload,
    text: stringValue(message.text)
      || stringValue(metadata.postbackTitle)
      || inboundPayload,
  };
}

export function parseZernioCommentInbound(
  payload: unknown,
  expectedAccountId: string,
): ZernioCommentInboundV1 | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const event = payload as Record<string, unknown>;
  if (event.event !== 'comment.received') return undefined;

  const comment = record(event.comment);
  const author = record(comment.author);
  const post = record(event.post);
  const account = record(event.account);
  const accountId = stringValue(account.accountId) || stringValue(account.id);
  const mediaId = stringValue(post.platformPostId)
    || stringValue(post.id)
    || stringValue(post.platformId);
  const username = stringValue(author.username);
  const text = stringValue(comment.text) || stringValue(comment.message);

  if (
    !expectedAccountId
    || accountId !== expectedAccountId
    || account.platform !== 'instagram'
    || !FLOW_MEDIA_IDS.has(mediaId)
    || !matchesSaraiva(text)
    || normalize(username) === 'saraiva.ai'
  ) {
    return undefined;
  }

  const eventId = stringValue(event.id);
  const commentId = stringValue(comment.id)
    || stringValue(comment.commentId)
    || stringValue(comment.platformCommentId);
  const senderId = stringValue(author.id) || stringValue(author.platformId);
  const occurredAt = stringValue(event.timestamp);
  if (!eventId || !commentId || !senderId || !occurredAt) return undefined;

  return {
    eventId,
    commentId,
    mediaId,
    accountId,
    senderId,
    senderName: optionalString(author.name),
    username: username || undefined,
    text,
    occurredAt,
  };
}

export function parseZernioMessageInbound(
  payload: unknown,
  expectedAccountId: string,
): ZernioMessageInboundV1 | undefined {
  const inbound = parseZernioInbound(payload, expectedAccountId);
  if (!inbound || !payload || typeof payload !== 'object') return undefined;
  const occurredAt = stringValue((payload as Record<string, unknown>).timestamp);
  if (!occurredAt) return undefined;
  return { ...inbound, occurredAt };
}

export function parseZernioLifecycleInbound(
  payload: unknown,
  expectedAccountId: string,
): ZernioLifecycleInboundV1 | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = payload as Record<string, unknown>;
  const allowedEvents = [
    'conversation.started',
    'message.sent',
    'message.delivered',
    'message.read',
    'message.edited',
    'message.deleted',
    'message.failed',
    'account.connected',
    'account.disconnected',
  ];
  if (!allowedEvents.includes(stringValue(value.event))) {
    return undefined;
  }
  const message = record(value.message);
  const conversation = record(value.conversation);
  const account = record(value.account);
  const accountId = stringValue(account.accountId) || stringValue(account.id);
  const event = stringValue(value.event) as ZernioLifecycleInboundV1['event'];
  const normalized: ZernioLifecycleInboundV1 = {
    eventId: stringValue(value.id),
    event,
    messageId: stringValue(message.platformMessageId) || stringValue(message.id),
    conversationId: stringValue(conversation.platformConversationId),
    accountId,
    senderId: stringValue(conversation.participantId),
    occurredAt: stringValue(value.timestamp),
  };
  if (
    accountId !== expectedAccountId
    || account.platform !== 'instagram'
    || Object.values(normalized).some((item) => !item)
  ) {
    return undefined;
  }
  return normalized;
}

export function buildZernioFlowReply(
  payload: string,
  senderName?: string,
): ZernioFlowReply | undefined {
  const firstName = safeFirstName(senderName);

  if (payload === ZERNIO_FLOW_PAYLOAD.open) {
    return {
      message: firstName
        ? `${firstName}, quer colocar pra rodar ou aprender a montar?`
        : 'Quer colocar pra rodar ou aprender a montar?',
      buttons: [
        {
          type: 'postback',
          title: 'QUERO USAR',
          payload: ZERNIO_FLOW_PAYLOAD.ready,
        },
        {
          type: 'postback',
          title: 'QUERO APRENDER',
          payload: ZERNIO_FLOW_PAYLOAD.build,
        },
      ],
    };
  }

  if (payload === ZERNIO_FLOW_PAYLOAD.ready) {
    return {
      message: 'Qual é o seu negócio? Vou te mostrar onde essa estrutura encaixa.',
    };
  }

  if (payload === ZERNIO_FLOW_PAYLOAD.build) {
    return {
      message: 'O que você quer automatizar primeiro? Vou te indicar o caminho.',
    };
  }

  return undefined;
}

function matchesSaraiva(value: string): boolean {
  return /(?:^|[^a-z0-9])saraiva(?=$|[^a-z0-9])/i.test(normalize(value));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function safeFirstName(value?: string): string | undefined {
  const first = value?.trim().split(/\s+/)[0] || '';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'-]{2,30}$/.test(first)) return undefined;
  return first.charAt(0).toLocaleUpperCase('pt-BR') + first.slice(1).toLocaleLowerCase('pt-BR');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | undefined {
  return stringValue(value) || undefined;
}
