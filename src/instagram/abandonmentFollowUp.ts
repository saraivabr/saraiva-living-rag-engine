import type { InstagramFlowSession } from './automationFlow.js';
import type { LeadContext } from '../store/leadContextStore.js';

const WAITING_STAGES = new Set<InstagramFlowSession['stage']>([
  'awaiting_request',
  'awaiting_intent',
  'awaiting_name',
  'awaiting_path',
  'awaiting_goal',
  'awaiting_ready_goal',
  'awaiting_business',
  'awaiting_build_level',
  'awaiting_build_goal',
  'offering_example',
  'offering_community',
]);

export interface AbandonmentAudioCandidate {
  context: LeadContext;
  script: string;
}

export function buildAbandonmentAudioCandidate(
  context: LeadContext,
  options: { now?: Date; waitMs?: number } = {},
): AbandonmentAudioCandidate | undefined {
  const session = context.instagramFlow;
  if (!session || session.id !== 'saraiva-prospecting-v1') return undefined;
  if (session.optedOutAt) return undefined;
  if (session.transport !== 'zernio' || !session.conversationId) return undefined;
  if (!WAITING_STAGES.has(session.stage)) return undefined;
  if (session.stage === 'offering_community' && session.communityOpenedAt) return undefined;
  if (session.abandonmentAudioStage === session.stage) return undefined;

  const lastInteraction = context.interactions?.at(-1);
  if (!lastInteraction || lastInteraction.direction !== 'out') return undefined;

  const now = options.now || new Date();
  const waitMs = options.waitMs ?? 5 * 60 * 1_000;
  const lastActivityAt = Date.parse(context.updatedAt || session.updatedAt);
  if (!Number.isFinite(lastActivityAt) || now.getTime() - lastActivityAt < waitMs) return undefined;

  return {
    context,
    script: buildAbandonmentAudioScript(session),
  };
}

export function buildAbandonmentAudioScript(session: InstagramFlowSession): string {
  const name = session.firstName ? `${session.firstName}, ` : '';
  if (session.campaign === 'sites_workshop') {
    return `${name}passei aqui porque você pediu a estrutura e travou. Deixar isso pra depois é continuar perdendo cliente todo dia por falta de um site conversional. Clica no botão e pega o mapa no WhatsApp. Faz sentido pra você?`;
  }
  return `${name}passei aqui porque você pediu essa estrutura e a conversa travou. Ficar parado na dúvida só atrasa suas vendas. ${stagePrompt(session.stage)} Faz sentido pra você?`;
}

function stagePrompt(stage: InstagramFlowSession['stage']): string {
  if (stage === 'awaiting_request' || stage === 'awaiting_intent') {
    return 'Me diz se você quer ter uma ferramenta dessas ou aprender a criar.';
  }
  if (stage === 'awaiting_name') return 'Me diz como posso te chamar que eu continuo daqui.';
  if (stage === 'awaiting_path') return 'Me diz se você quer usar a estrutura pronta ou aprender a montar.';
  if (stage === 'awaiting_goal') return 'Me conta o resultado que você quer colocar em movimento.';
  if (stage === 'awaiting_ready_goal') return 'Me diz o que mais trava suas vendas hoje.';
  if (stage === 'awaiting_business') return 'Me conta qual é o seu negócio que eu encaixo a estrutura no seu cenário.';
  if (stage === 'awaiting_build_level') return 'Me diz onde você está hoje com IA e automações.';
  if (stage === 'offering_example') return 'Abre o exemplo real que deixei aí e eu continuo com você.';
  if (stage === 'offering_community') return 'Entra na comunidade gratuita do WhatsApp pelo botão que deixei aí.';
  return 'Me conta o que você quer automatizar primeiro que eu te mostro o caminho.';
}
