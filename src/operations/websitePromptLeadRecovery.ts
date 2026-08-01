import { WEBSITE_PROMPT_MEDIA_ID } from '../campaignTrigger.js';
import {
  SARAIVA_FLOW_PAYLOAD,
  type InstagramInteractiveMessage,
} from '../instagram/automationFlow.js';
import type { LeadContext } from '../store/leadContextStore.js';

export const WEBSITE_PROMPT_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1_000;

export const WEBSITE_PROMPT_RECOVERY_MESSAGE: InstagramInteractiveMessage = {
  kind: 'quick_replies',
  text: 'Você comentou SARAIVA para receber o prompt do vídeo. Ele está liberado gratuitamente. Só me diga onde vai usar para eu te entregar a versão certa:',
  quickReplies: [
    { title: 'MINHA EMPRESA', payload: SARAIVA_FLOW_PAYLOAD.sitesOwnBusiness },
    { title: 'VENDER SITES', payload: SARAIVA_FLOW_PAYLOAD.sitesSell },
  ],
};

export interface WebsitePromptRecoveryCandidate {
  context: LeadContext;
  lastInboundAt: string;
  message: InstagramInteractiveMessage;
}

export function buildWebsitePromptRecoveryCandidate(
  context: LeadContext,
  options: { now?: Date; windowMs?: number } = {},
): WebsitePromptRecoveryCandidate | undefined {
  const session = context.instagramFlow;
  if (
    context.postId !== WEBSITE_PROMPT_MEDIA_ID
    || !session
    || session.id !== 'saraiva-prospecting-v1'
    || session.campaign !== 'sites_workshop'
    || !['awaiting_request', 'awaiting_intent', 'offering_community'].includes(session.stage)
    || session.transport !== 'zernio'
    || !session.conversationId
    || session.optedOutAt
    || session.promptDeliveredAt
    || session.productOpenedAt
    || session.recoverySentAt
  ) return undefined;

  const interactions = context.interactions || [];
  const firstOutbound = interactions.findIndex((interaction) => interaction.direction === 'out');
  if (firstOutbound < 0) return undefined;
  const lastInbound = interactions
    .slice(firstOutbound + 1)
    .filter((interaction) => interaction.direction === 'in')
    .at(-1);
  if (!lastInbound) return undefined;

  const inboundAt = Date.parse(lastInbound.at);
  const age = (options.now || new Date()).getTime() - inboundAt;
  const windowMs = options.windowMs ?? WEBSITE_PROMPT_RECOVERY_WINDOW_MS;
  if (!Number.isFinite(inboundAt) || age < 0 || age > windowMs) return undefined;

  return {
    context,
    lastInboundAt: lastInbound.at,
    message: WEBSITE_PROMPT_RECOVERY_MESSAGE,
  };
}

export function prepareWebsitePromptRecoveryContext(
  candidate: WebsitePromptRecoveryCandidate,
  preparedAt: string,
): Omit<LeadContext, 'updatedAt'> {
  const session = candidate.context.instagramFlow!;
  return {
    ...candidate.context,
    instagramFlow: {
      ...session,
      campaign: 'sites_workshop',
      stage: 'awaiting_intent',
      path: undefined,
      destinationUrl: undefined,
      communityCtaMessageId: undefined,
      communityOpenedAt: undefined,
      productOfferedAt: undefined,
      productCtaMessageId: undefined,
      promptCardMessageId: undefined,
      recoveryPreparedAt: preparedAt,
      updatedAt: preparedAt,
    },
    automationJournal: [
      ...(candidate.context.automationJournal || []),
      {
        at: preparedAt,
        action: 'prepare_website_prompt_recovery',
        verifiedFacts: ['user_replied_after_private_reply', 'inside_24h_window', 'free_prompt_not_delivered'],
        rule: 'promise_first_recovery_once',
        result: 'recovery_prepared',
        reasonCode: 'website_prompt_recovery_prepared',
      },
    ].slice(-100),
  };
}

export function completeWebsitePromptRecoveryContext(
  context: Omit<LeadContext, 'updatedAt'>,
  input: { sentAt: string; messageId: string },
): Omit<LeadContext, 'updatedAt'> {
  return {
    ...context,
    instagramFlow: {
      ...context.instagramFlow!,
      recoverySentAt: input.sentAt,
      recoveryMessageId: input.messageId,
      updatedAt: input.sentAt,
    },
    automationJournal: [
      ...(context.automationJournal || []),
      {
        at: input.sentAt,
        action: 'send_website_prompt_recovery',
        verifiedFacts: ['zernio_message_id', 'free_prompt_before_offer'],
        rule: 'promise_first_recovery_once',
        result: 'recovery_sent',
        reasonCode: 'website_prompt_recovery_sent',
      },
    ].slice(-100),
    interactions: [
      ...(context.interactions || []),
      {
        at: input.sentAt,
        direction: 'out',
        text: WEBSITE_PROMPT_RECOVERY_MESSAGE.kind === 'quick_replies'
          ? WEBSITE_PROMPT_RECOVERY_MESSAGE.text
          : '',
      },
    ],
  };
}
