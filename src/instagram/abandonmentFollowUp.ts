import type { InstagramFlowSession, InstagramInteractiveMessage } from './automationFlow.js';
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
  'offering_product',
]);

export interface AbandonmentAudioCandidate {
  context: LeadContext;
  script: string;
}

export interface AbandonmentTextCandidate {
  context: LeadContext;
  message: string;
  /**
   * Espaço reservado para a oferta da SEGUNDA ETAPA — entregar o site e
   * receber por ele.
   *
   * Fica vazio de propósito enquanto essa oferta não tiver página e conteúdo.
   * Mandar card de Biblioteca aqui seria empurrar mais prompt para quem ainda
   * não fez a primeira venda: a auditoria mostrou que 65% querem cliente, não
   * ferramenta. Por ora o follow-up só pergunta, e quem responde entra na
   * lista de mão levantada.
   *
   * O envio já está ligado no lambda: no dia em que a página existir, basta
   * preencher este campo.
   */
  offerCard?: InstagramInteractiveMessage & { kind: 'link_card' };
}

export function buildAbandonmentAudioCandidate(
  context: LeadContext,
  options: { now?: Date; waitMs?: number } = {},
): AbandonmentAudioCandidate | undefined {
  const session = context.instagramFlow;
  if (!session || session.id !== 'saraiva-prospecting-v1') return undefined;
  if (session.campaign === 'sites_workshop') return undefined;
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

export function buildWebsitePromptFollowUpCandidate(
  context: LeadContext,
  options: { now?: Date; waitMs?: number } = {},
): AbandonmentTextCandidate | undefined {
  const session = context.instagramFlow;
  if (
    !session
    || session.id !== 'saraiva-prospecting-v1'
    || session.campaign !== 'sites_workshop'
    || session.stage !== 'offering_product'
    || !session.promptDeliveredAt
    || session.productOpenedAt
    || session.followUpSentAt
    || session.optedOutAt
    || session.transport !== 'zernio'
    || !session.conversationId
  ) return undefined;

  const lastInteraction = context.interactions?.at(-1);
  if (!lastInteraction || lastInteraction.direction !== 'out') return undefined;
  const now = options.now || new Date();
  const waitMs = options.waitMs ?? 60 * 60 * 1_000;
  const lastActivityAt = Date.parse(context.updatedAt || session.updatedAt);
  if (!Number.isFinite(lastActivityAt) || now.getTime() - lastActivityAt < waitMs) return undefined;

  return {
    context,
    // A pergunta mira a SEGUNDA ETAPA: entregar o site e receber por ele.
    //
    // A auditoria de 1.279 conversas foi clara: 65% escolheram VENDER SITES e
    // os sinais escritos à mão falam de cliente, não de ferramenta — "trazer
    // clientes", "mais clientes", "prospectar clientes". Um deles nomeou a
    // lacuna inteira: "como faço manutenção e como passo o site pro cliente
    // ter acesso como dono? É só isso que eu quero saber pra fazer clientes.
    // Os caras não ensinam."
    //
    // Perguntar "qual é o próximo projeto" empurraria mais prompt para quem
    // ainda não fez a primeira venda. Quem responde ESTA pergunta está
    // levantando a mão para a segunda etapa.
    message: session.path === 'build'
      ? 'Conseguiu gerar o site com o prompt? Me conta uma coisa: o que o cliente te perguntou que você não soube responder?'
      : 'Conseguiu gerar o site com o prompt? Me conta uma coisa: o que travou na hora de colocar ele no ar?',
  };
}

export function buildAbandonmentAudioScript(session: InstagramFlowSession): string {
  const name = session.firstName ? `${session.firstName}, ` : '';
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
