import type { PostPromise, SocialSellingState } from '../socialSelling/flow.js';
import {
  WEBSITE_GUIDE_PRODUCT,
  WEBSITE_GUIDE_VALUE_CENTS,
} from '../payments/woovi.js';

export type SalesOffer =
  | 'workshop_voice_ai'
  | 'website_guide'
  | 'website_automation'
  | 'diagnostic';
export type SalesStage =
  | 'novo'
  | 'diagnostico'
  | 'qualificado'
  | 'quente'
  | 'comprar_live'
  | 'pagamento_pendente_verificacao'
  | 'handoff_humano'
  | 'nutrir'
  | 'desqualificado';

export interface SalesSnapshot {
  offer: SalesOffer;
  offerLabel: string;
  checkoutUrl?: string;
  priceCents?: number;
  stage: SalesStage;
  score: number;
  temperature: 'frio' | 'morno' | 'quente';
  icpFit: 'baixo' | 'medio' | 'alto';
  useCase?: string;
  segment?: string;
  pain?: string;
  urgency?: string;
  authority?: string;
  nextAction: string;
  crmTitle: string;
  crmNote: string;
  humanApprovalRequired: boolean;
}

export const voiceAiWorkshopOffer = Object.freeze({
  offer: 'workshop_voice_ai' as const,
  offerLabel: 'Workshop Ligações com IA no WhatsApp',
  checkoutUrl: 'https://workshop.saraiva.ai/checkout',
  priceCents: 9_700,
});

const diagnosticOffer = Object.freeze({
  offer: 'diagnostic' as const,
  offerLabel: 'Diagnóstico da operação',
  checkoutUrl: undefined,
  priceCents: undefined,
});

const websiteAutomationOffer = Object.freeze({
  offer: 'website_automation' as const,
  offerLabel: WEBSITE_GUIDE_PRODUCT,
  checkoutUrl: 'https://loja.saraiva.ai',
  priceCents: WEBSITE_GUIDE_VALUE_CENTS,
});

const voiceWorkshopPromiseKinds = new Set<PostPromise['kind']>([
  'whatsapp_elevenlabs_workshop',
  'voice_ai_map_workshop',
  'voice_call_map',
  'sdr_voice',
]);

export function isVoiceAiWorkshopPromise(promise?: PostPromise): boolean {
  return Boolean(promise && voiceWorkshopPromiseKinds.has(promise.kind));
}

export function resolveSalesOffer(
  promise?: PostPromise,
  state?: SocialSellingState,
): Pick<SalesSnapshot, 'offer' | 'offerLabel' | 'checkoutUrl' | 'priceCents'> {
  if (promise?.kind === 'website_prompt') {
    return websiteAutomationOffer;
  }
  return isVoiceAiWorkshopPromise(promise) ? voiceAiWorkshopOffer : diagnosticOffer;
}

export function buildSalesSnapshot(
  state: SocialSellingState,
  promise: PostPromise,
  inbound: string,
): SalesSnapshot {
  const offer = resolveSalesOffer(promise, state);
  const stage = resolveSalesStage(state, inbound, offer.offer);
  const icpFit = resolveIcpFit(state);
  const paymentClaim = hasPaymentClaim(inbound);
  const temperature = state.score >= 70
    || stage === 'comprar_live'
    || stage === 'pagamento_pendente_verificacao'
    || stage === 'handoff_humano'
    ? 'quente'
    : state.score >= 40
      ? 'morno'
      : 'frio';
  const humanApprovalRequired = stage === 'handoff_humano';
  const nextAction = resolveNextAction(stage, state, offer.offer, paymentClaim);
  const crmTitle = [
    temperature.toUpperCase(),
    offer.offerLabel,
    state.segment || 'segmento a mapear',
  ].join(' | ');
  const crmNote = [
    `Oferta: ${offer.offerLabel}`,
    offer.checkoutUrl ? `Link: ${offer.checkoutUrl}` : undefined,
    `Etapa: ${stage}`,
    `Score: ${state.score}`,
    `Temperatura: ${temperature}`,
    `ICP: ${icpFit}`,
    state.useCase ? `Aplicacao: ${state.useCase}` : undefined,
    state.segment ? `Segmento: ${state.segment}` : undefined,
    state.pain ? `Dor: ${state.pain}` : undefined,
    state.urgency ? `Urgencia: ${state.urgency}` : undefined,
    state.authority ? `Autoridade: ${state.authority}` : undefined,
    `Ultima mensagem: ${inbound}`,
    `Proxima acao: ${nextAction}`,
    humanApprovalRequired ? 'Aprovacao humana exigida antes de convite PRO, desconto ou promessa sensivel.' : undefined,
  ].filter(Boolean).join('\n');

  return {
    ...offer,
    stage,
    score: state.score,
    temperature,
    icpFit,
    useCase: state.useCase,
    segment: state.segment,
    pain: state.pain,
    urgency: state.urgency,
    authority: state.authority,
    nextAction,
    crmTitle,
    crmNote,
    humanApprovalRequired,
  };
}

export function diagnosticQuestion(): string {
  return 'qual tarefa da sua empresa mais depende de voce ou da sua equipe fazendo manualmente: atendimento, follow-up, vendas, conteudo, financeiro ou organizacao interna?';
}

export function workshopCheckoutReply(): string {
  return [
    'perfeito. o Workshop Ligações com IA no WhatsApp mostra como conectar WhatsApp, Wavoip, ElevenLabs e o registro do atendimento no mesmo fluxo.',
    '',
    'o pagamento e unico: R$97.',
    '',
    `checkout: ${voiceAiWorkshopOffer.checkoutUrl}`,
    '',
    'se quiser validar o encaixe antes de pagar, me diz onde pretende aplicar: atendimento, vendas, suporte ou agenda.',
  ].join('\n');
}

export function paymentVerificationReply(): string {
  return [
    'recebi sua mensagem.',
    '',
    'o pedido permanece pendente ate eu validar o pagamento no provedor.',
    '',
    'assim que a confirmacao aparecer, o acesso e liberado pelo fluxo oficial.',
  ].join('\n');
}

function resolveSalesStage(state: SocialSellingState, inbound: string, offer: SalesOffer): SalesStage {
  const lower = inbound.toLowerCase();
  if (state.stage === 'disqualified') return 'desqualificado';
  if (hasPaymentClaim(lower)) return 'pagamento_pendente_verificacao';
  if (
    offer === 'website_automation'
    && has(lower, ['pronto', 'pronta', 'quero a automacao', 'quero a automação', 'automacao pronta', 'automação pronta'])
  ) {
    return 'comprar_live';
  }
  if (has(lower, ['link', 'comprar', 'inscricao', 'inscrição', 'pix', 'entrar', 'participar'])) {
    return offer === 'workshop_voice_ai' ? 'comprar_live' : 'quente';
  }
  if (state.stage === 'handoff') return 'handoff_humano';
  if (state.stage === 'hot') return 'quente';
  if (state.stage === 'qualified') return 'qualificado';
  if (state.stage === 'nurture') return 'nutrir';
  if (state.stage === 'diagnosing') return 'diagnostico';
  return 'novo';
}

function resolveIcpFit(state: SocialSellingState): SalesSnapshot['icpFit'] {
  let fit = 0;
  if (state.authority) fit += 2;
  if (state.useCase && ['atendimento', 'vendas', 'follow-up', 'automacao interna'].includes(state.useCase)) fit += 2;
  if (state.pain) fit += 2;
  if (state.segment) fit += 1;
  if (state.urgency === 'alta') fit += 1;
  if (fit >= 5) return 'alto';
  if (fit >= 3) return 'medio';
  return 'baixo';
}

function resolveNextAction(
  stage: SalesStage,
  state: SocialSellingState,
  offer: SalesOffer,
  paymentClaim: boolean,
): string {
  if (stage === 'desqualificado') return 'nutrir sem insistir';
  if (stage === 'pagamento_pendente_verificacao' || paymentClaim) {
    return 'verificar o pagamento no provedor antes de confirmar venda ou acesso';
  }
  if (stage === 'comprar_live' && offer === 'workshop_voice_ai') {
    return `enviar checkout oficial do workshop: ${voiceAiWorkshopOffer.checkoutUrl}`;
  }
  if (stage === 'comprar_live' && offer === 'website_automation') {
    return 'enviar a cobranca Pix oficial de R$19,90 da automacao';
  }
  if (stage === 'handoff_humano') return 'assumir conversa manualmente antes de convite PRO ou promessa sensivel';
  if (stage === 'quente' && offer === 'workshop_voice_ai') return 'confirmar o caso de uso e enviar o checkout oficial do workshop';
  if (stage === 'quente') return 'assumir conversa manualmente e definir uma oferta real antes de enviar link ou preco';
  if (stage === 'qualificado') return 'aprofundar dor, urgencia e processo repetitivo antes do link';
  if (!state.useCase) return diagnosticQuestion();
  if (!state.pain) return 'perguntar qual sintoma operacional aparece hoje nesse processo';
  return offer === 'workshop_voice_ai'
    ? 'explicar o encaixe do workshop e perguntar se quer o checkout oficial'
    : 'continuar o diagnostico sem inventar oferta, preco ou link';
}

function hasPaymentClaim(value: string): boolean {
  const lower = value.toLowerCase();
  return has(lower, ['entrei', 'comprei', 'paguei', 'pix pago', 'ja paguei', 'já paguei']);
}

function has(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}
