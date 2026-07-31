import { sendZernioMessage, type SendZernioMessageInput } from './client.js';
import {
  buildZernioFlowReply,
  parseZernioCommentInbound,
  parseZernioLifecycleInbound,
  parseZernioInbound,
  parseZernioMessageInbound,
  verifyZernioWebhookSignature,
  type ZernioCommentInboundV1,
  type ZernioLifecycleInboundV1,
  type ZernioMessageInboundV1,
} from './webhook.js';

export interface HandleZernioWebhookInput {
  rawBody: string;
  signature?: string;
  webhookSecret: string;
  apiKey: string;
  accountId: string;
  markOnce: (key: string) => Promise<boolean>;
  releaseOnce?: (key: string) => Promise<void>;
  sendMessage?: (
    input: SendZernioMessageInput,
  ) => Promise<{ messageId: string; conversationId: string }>;
  onComment?: (input: ZernioCommentInboundV1) => Promise<Record<string, unknown>>;
  onMessage?: (input: ZernioMessageInboundV1) => Promise<Record<string, unknown>>;
  onLifecycle?: (input: ZernioLifecycleInboundV1) => Promise<Record<string, unknown>>;
}

export interface ZernioWebhookResult {
  statusCode: number;
  body: Record<string, unknown>;
}

export async function handleZernioWebhook(
  input: HandleZernioWebhookInput,
): Promise<ZernioWebhookResult> {
  if (!verifyZernioWebhookSignature(
    input.rawBody,
    input.signature,
    input.webhookSecret,
  )) {
    return {
      statusCode: 403,
      body: { ok: false, error: 'invalid signature' },
    };
  }

  let payload: unknown;
  try {
    payload = input.rawBody ? JSON.parse(input.rawBody) : {};
  } catch {
    return {
      statusCode: 400,
      body: { ok: false, error: 'invalid json' },
    };
  }

  const comment = parseZernioCommentInbound(payload, input.accountId);
  const message = parseZernioMessageInbound(payload, input.accountId);
  const lifecycle = parseZernioLifecycleInbound(payload, input.accountId);
  const inbound = comment || message || lifecycle;
  if (!inbound) {
    return {
      statusCode: 200,
      body: { ok: true, handled: 0, ignored: true },
    };
  }

  const eventKey = `zernio#${inbound.eventId}`;
  if (!(await input.markOnce(eventKey))) {
    return {
      statusCode: 200,
      body: { ok: true, handled: 0, duplicate: true },
    };
  }

  try {
    if (comment && input.onComment) {
      const outcome = await input.onComment(comment);
      return {
        statusCode: 200,
        body: { ok: true, handled: 1, ...outcome },
      };
    }
    if (message && input.onMessage) {
      const outcome = await input.onMessage(message);
      return {
        statusCode: 200,
        body: { ok: true, handled: 1, ...outcome },
      };
    }
    if (lifecycle && input.onLifecycle) {
      const outcome = await input.onLifecycle(lifecycle);
      return {
        statusCode: 200,
        body: { ok: true, handled: 1, ...outcome },
      };
    }
    if (!message) {
      return {
        statusCode: 200,
        body: { ok: true, handled: 0, ignored: true },
      };
    }
    const reply = buildZernioFlowReply(message.payload, message.senderName);
    if (!reply) {
      return {
        statusCode: 200,
        body: { ok: true, handled: 0, ignored: true },
      };
    }
    const sent = await (input.sendMessage || sendZernioMessage)({
      apiKey: input.apiKey,
      accountId: message.accountId,
      conversationId: message.conversationId,
      reply,
    });
    return {
      statusCode: 200,
      body: {
        ok: true,
        handled: 1,
        messageId: sent.messageId,
      },
    };
  } catch (error) {
    await input.releaseOnce?.(eventKey);
    throw error;
  }
}
