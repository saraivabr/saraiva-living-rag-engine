import type { ZernioFlowReply } from './webhook.js';
import type { InstagramInteractiveMessage } from '../instagram/automationFlow.js';
import {
  convertMp3ToInstagramAudio,
  type InstagramAudio,
} from '../voice/instagramAudio.js';

const ZERNIO_API_BASE = 'https://zernio.com/api/v1';

export function isTerminalZernioConversationError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : '').toLowerCase();
  return message.includes('platform_api_error')
    && message.includes('conversation thread')
    && (message.includes('archived') || message.includes('deleted'));
}

export interface SendZernioMessageInput {
  apiKey: string;
  accountId: string;
  conversationId: string;
  reply: ZernioFlowReply;
  fetchImpl?: typeof fetch;
}

export interface SendZernioPrivateReplyInput {
  apiKey: string;
  accountId: string;
  mediaId: string;
  commentId: string;
  message: string;
  buttons: NonNullable<ZernioFlowReply['buttons']>;
  fetchImpl?: typeof fetch;
}

export interface ReplyZernioCommentInput {
  apiKey: string;
  accountId: string;
  mediaId: string;
  commentId: string;
  message: string;
  fetchImpl?: typeof fetch;
}

export async function sendZernioMessage(
  input: SendZernioMessageInput,
): Promise<{ messageId: string; conversationId: string }> {
  if (!input.apiKey || !input.accountId || !input.conversationId) {
    throw new Error('zernio_message_configuration_missing');
  }

  const fetchImpl = input.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(
      `${ZERNIO_API_BASE}/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          accountId: input.accountId,
          message: input.reply.message,
          ...(input.reply.buttons?.length ? { buttons: input.reply.buttons } : {}),
        }),
        signal: controller.signal,
      },
    );
    const body = await response.json() as {
      success?: boolean;
      data?: { messageId?: string; conversationId?: string };
      error?: string;
      code?: string;
    };
    if (!response.ok || !body.success || !body.data?.messageId) {
      throw new Error(`zernio_message_failed:${body.code || response.status}`);
    }
    return {
      messageId: body.data.messageId,
      conversationId: body.data.conversationId || input.conversationId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendZernioInteractive(input: {
  apiKey: string;
  accountId: string;
  conversationId: string;
  message: InstagramInteractiveMessage;
  fetchImpl?: typeof fetch;
  audioConverter?: (bytes: Uint8Array) => Promise<InstagramAudio>;
  reconcileSince?: string;
}): Promise<string> {
  if (input.reconcileSince) {
    const existing = await findRecentZernioInteractiveMessage({
      apiKey: input.apiKey,
      accountId: input.accountId,
      conversationId: input.conversationId,
      since: input.reconcileSince,
      message: input.message,
      fetchImpl: input.fetchImpl,
    });
    if (existing) return existing;
  }

  if (input.message.kind === 'audio') {
    const uploadedUrl = await uploadZernioAudio({
      apiKey: input.apiKey,
      sourceUrl: input.message.url,
      fetchImpl: input.fetchImpl,
      audioConverter: input.audioConverter,
    });
    const body = await requestZernioApi<{
      success?: boolean;
      data?: { messageId?: string };
      code?: string;
    }>({
      apiKey: input.apiKey,
      url: `${ZERNIO_API_BASE}/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
      body: {
        accountId: input.accountId,
        attachmentUrl: uploadedUrl,
        attachmentType: 'audio',
      },
      fetchImpl: input.fetchImpl,
      timeoutMs: 30_000,
    });
    if (!body.success || !body.data?.messageId) {
      throw new Error(`zernio_audio_failed:${body.code || 'invalid_response'}`);
    }
    return body.data.messageId;
  }

  const reply: ZernioFlowReply = input.message.kind === 'text'
    ? { message: input.message.text }
    : input.message.kind === 'quick_replies'
      ? {
          message: input.message.text,
          buttons: input.message.quickReplies.map((button) => ({
            type: 'postback',
            title: button.title,
            payload: button.payload,
          })),
        }
      : {
          message: `${input.message.title}\n${input.message.subtitle}`,
          buttons: input.message.buttons.map((button) => button.type === 'web_url'
            ? { type: 'url', title: button.title, url: button.url }
            : {
                type: 'postback',
                title: button.title,
                payload: button.payload,
              }),
        };
  const sent = await sendZernioMessage({
    apiKey: input.apiKey,
    accountId: input.accountId,
    conversationId: input.conversationId,
    reply,
    fetchImpl: input.fetchImpl,
  });
  return sent.messageId;
}

export async function findRecentZernioAudioMessage(input: {
  apiKey: string;
  accountId: string;
  conversationId: string;
  since: string;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  return findRecentZernioInteractiveMessage({
    ...input,
    message: { kind: 'audio', url: 'reconcile-by-type' },
  });
}

export async function findRecentZernioInteractiveMessage(input: {
  apiKey: string;
  accountId: string;
  conversationId: string;
  since: string;
  message: InstagramInteractiveMessage;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(
    `${ZERNIO_API_BASE}/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`
      + `?accountId=${encodeURIComponent(input.accountId)}&limit=30&sortOrder=desc`,
    {
      headers: { authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`zernio_messages_lookup_failed:${response.status}`);
  const body = await response.json() as {
    data?: { messages?: ZernioInboxMessage[] } | ZernioInboxMessage[];
    messages?: ZernioInboxMessage[];
  };
  const messages = Array.isArray(body.data)
    ? body.data
    : body.data?.messages || body.messages || [];
  const since = Date.parse(input.since);
  const expectedText = input.message.kind === 'text'
    ? input.message.text
    : input.message.kind === 'quick_replies'
      ? input.message.text
      : input.message.kind === 'link_card'
        ? `${input.message.title}\n${input.message.subtitle}`
        : undefined;
  return messages
    .filter((message) =>
      message.direction === 'outgoing'
      && Date.parse(message.createdAt || message.timestamp || '') >= since
      && message.deliveryStatus !== 'failed'
      && (input.message.kind === 'audio'
        ? message.attachments?.some((attachment) => attachment.type === 'audio')
        : normalizeMessageText(message.message) === normalizeMessageText(expectedText)))
    .sort((a, b) =>
      Date.parse(b.createdAt || b.timestamp || '') - Date.parse(a.createdAt || a.timestamp || ''))[0]?.id;
}

interface ZernioInboxMessage {
  id?: string;
  direction?: string;
  createdAt?: string;
  timestamp?: string;
  message?: string;
  deliveryStatus?: string;
  attachments?: Array<{ type?: string }>;
}

function normalizeMessageText(value?: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function uploadZernioAudio(input: {
  apiKey: string;
  sourceUrl: string;
  fetchImpl?: typeof fetch;
  audioConverter?: (bytes: Uint8Array) => Promise<InstagramAudio>;
}): Promise<string> {
  const fetchImpl = input.fetchImpl || fetch;
  const source = await fetchImpl(input.sourceUrl, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
  });
  if (!source.ok) throw new Error(`zernio_audio_source_failed:${source.status}`);
  const bytes = await source.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error('zernio_audio_source_size_invalid');
  }
  const converted = await (input.audioConverter || convertMp3ToInstagramAudio)(new Uint8Array(bytes));
  const form = new FormData();
  const uploadBytes = Uint8Array.from(converted.bytes);
  form.append('file', new Blob([uploadBytes.buffer], { type: converted.contentType }), converted.filename);
  form.append('contentType', converted.contentType);
  const uploaded = await fetchImpl(`${ZERNIO_API_BASE}/media/upload-direct`, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await uploaded.json() as { url?: string; error?: string };
  if (!uploaded.ok || !body.url) {
    throw new Error(`zernio_audio_upload_failed:${uploaded.status}`);
  }
  return body.url;
}

export async function sendZernioPrivateReply(
  input: SendZernioPrivateReplyInput,
): Promise<{ messageId: string; commentId: string }> {
  const body = await requestZernioApi<{
    status?: string;
    messageId?: string;
    commentId?: string;
    error?: string;
    code?: string;
  }>({
    apiKey: input.apiKey,
    url: `${ZERNIO_API_BASE}/inbox/comments/${encodeURIComponent(input.mediaId)}/${encodeURIComponent(input.commentId)}/private-reply`,
    body: {
      accountId: input.accountId,
      message: input.message,
      // O Zernio recusa `buttons: []` com "Too small: expected array to have
      // >=1 items" e derruba a entrega inteira — inclusive a resposta pública
      // no comentário. Mensagem sem botão é legítima (a entrega imediata do
      // prompt não tem botão nenhum), então o campo simplesmente não vai.
      ...(input.buttons?.length ? { buttons: input.buttons } : {}),
    },
    fetchImpl: input.fetchImpl,
  });
  if (body.status !== 'success' || !body.messageId) {
    throw new Error(`zernio_private_reply_failed:${body.code || 'invalid_response'}`);
  }
  return {
    messageId: body.messageId,
    commentId: body.commentId || input.commentId,
  };
}

export async function replyZernioComment(
  input: ReplyZernioCommentInput,
): Promise<{ replyId: string }> {
  const body = await requestZernioApi<{
    success?: boolean;
    data?: { commentId?: string; id?: string };
    id?: string;
    error?: string;
    code?: string;
  }>({
    apiKey: input.apiKey,
    url: `${ZERNIO_API_BASE}/inbox/comments/${encodeURIComponent(input.mediaId)}`,
    body: {
      accountId: input.accountId,
      message: input.message,
      commentId: input.commentId,
    },
    fetchImpl: input.fetchImpl,
  });
  const replyId = body.data?.commentId || body.data?.id || body.id;
  if (body.success === false || body.error || !replyId) {
    throw new Error(`zernio_comment_reply_failed:${body.code || 'invalid_response'}`);
  }
  return { replyId };
}

export async function findZernioCommentReply(input: {
  apiKey: string;
  accountId: string;
  mediaId: string;
  commentId: string;
  message: string;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  const query = new URLSearchParams({ accountId: input.accountId, limit: '100' });
  const body = await requestZernioApi<{
    comments?: Array<{
      id?: string;
      replies?: Array<{
        id?: string;
        message?: string;
        from?: { isOwner?: boolean };
      }>;
    }>;
  }>({
    apiKey: input.apiKey,
    url: `${ZERNIO_API_BASE}/inbox/comments/${encodeURIComponent(input.mediaId)}?${query}`,
    method: 'GET',
    fetchImpl: input.fetchImpl,
  });
  const comment = body.comments?.find((item) => item.id === input.commentId);
  const expected = normalizeMessage(input.message);
  return comment?.replies?.find((reply) => (
    reply.from?.isOwner === true
    && normalizeMessage(reply.message || '') === expected
  ))?.id;
}

export async function requestZernioApi<T>(input: {
  apiKey: string;
  url: string;
  method?: string;
  body?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<T> {
  if (!input.apiKey) throw new Error('zernio_api_key_missing');
  const fetchImpl = input.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 10_000);
  try {
    const response = await fetchImpl(input.url, {
      method: input.method || 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: controller.signal,
    });
    const body = await response.json() as T & {
      code?: string;
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      const reason = body.code || response.status;
      const detail = safeZernioErrorDetail(body.error || body.message);
      throw new Error(`zernio_request_failed:${reason}${detail ? `:${detail}` : ''}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMessage(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function safeZernioErrorDetail(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/(?:sk_|Bearer\s+)[a-zA-Z0-9._-]+/gi, '[credential]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}
