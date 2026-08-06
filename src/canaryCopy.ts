import { WEBSITE_PROMPT_MEDIA_ID } from './campaignTrigger.js';
import {
  advanceInstagramFlow,
  createInstagramCommentFlow,
  SARAIVA_FLOW_PAYLOAD,
  type InstagramFlowPath,
} from './instagram/automationFlow.js';
import {
  generateMotorSalesReply,
  type MotorSalesReplyResult,
} from './ai/motorSalesResponder.js';

interface CopyCanaryEvent {
  path?: InstagramFlowPath;
  validateMotor?: boolean;
}

interface CopyCanaryDependencies {
  generateMotor?: typeof generateMotorSalesReply;
}

const CANARY_NOW = new Date('2026-08-03T12:00:00.000Z');

export async function handler(event: CopyCanaryEvent = {}, dependencies: CopyCanaryDependencies = {}) {
  const paths: InstagramFlowPath[] = event.path ? [event.path] : ['ready', 'build'];
  if (paths.some((path) => path !== 'ready' && path !== 'build')) {
    return { ok: false, error: 'invalid_path' };
  }

  const assistantCheck = event.validateMotor
    ? summarizeAssistantCheck(await (dependencies.generateMotor || generateMotorSalesReply)({
        message: 'Quero adaptar o prompt para uma clínica odontológica.',
        promise: {
          label: 'Assistente de adaptação do prompt',
          trustedContext: 'Ajude a pessoa a adaptar o prompt ao seu segmento sem oferecer preço, produto ou link.',
        },
        state: { stage: 'offering_product' },
        fallbackReply: 'Qual serviço da clínica você quer destacar primeiro?',
      }, {
        enabled: true,
        maxChars: 260,
        temperature: 0.25,
      }))
    : undefined;

  return {
    ok: true,
    canary: 'zernio_library_copy_v1',
    ...(assistantCheck ? { assistantCheck } : {}),
    journeys: paths.map((path) => {
      const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
        now: CANARY_NOW,
        correlationId: `copy-canary-${path}`,
        transport: 'zernio',
        trackingBaseUrl: 'https://app.saraiva.ai',
      });
      if (!entry) throw new Error('sites_flow_unavailable');

      const delivery = advanceInstagramFlow(entry.session, {
        payload: path === 'ready'
          ? SARAIVA_FLOW_PAYLOAD.sitesOwnBusiness
          : SARAIVA_FLOW_PAYLOAD.sitesSell,
      }, {
        now: CANARY_NOW,
        trackingBaseUrl: 'https://app.saraiva.ai',
        followStatus: 'following',
      });
      if (!delivery) throw new Error('sites_delivery_unavailable');

      return {
        path,
        publicReply: entry.publicReply,
        entryMessage: entry.message,
        deliveryMessages: delivery.messages || [delivery.message],
        stage: delivery.session.stage,
      };
    }),
  };
}

function summarizeAssistantCheck(result: MotorSalesReplyResult) {
  return {
    ok: result.source === 'motor',
    source: result.source,
    chars: result.reply.length,
    questionCount: (result.reply.match(/\?/g) || []).length,
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
  };
}
