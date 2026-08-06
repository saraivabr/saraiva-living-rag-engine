import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../campaignTrigger.js';
import {
  buildFollowGateMessage,
  FOLLOW_CONFIRMED_PAYLOAD,
  type FollowStatus,
} from './followGate.js';
import type { ProfileFact } from './profilePersonalization.js';

export const SARAIVA_FLOW_ID = 'saraiva-prospecting-v1';

export type InstagramFlowCampaign = 'prospecting' | 'sites_workshop';

export type InstagramFlowStage =
  | 'awaiting_request'
  | 'awaiting_intent'
  | 'awaiting_name'
  | 'awaiting_path'
  | 'awaiting_follow'
  | 'awaiting_goal'
  | 'awaiting_ready_goal'
  | 'awaiting_business'
  | 'awaiting_build_level'
  | 'awaiting_build_goal'
  | 'enriching_profile'
  | 'generating_audio'
  | 'offering_example'
  | 'example_opened'
  | 'offering_community'
  | 'offering_product'
  | 'completed'
  | 'technical_paused';

export type InstagramFlowPath = 'ready' | 'build';

export interface InstagramFlowQualification {
  desiredOutcome?: string;
  goal?: 'prospect_clients' | 'organize_process' | 'sell_more';
  business?: string;
  level?: 'starting' | 'uses_ai' | 'builds_automations';
  buildGoal?: string;
}

export interface InstagramFlowSession {
  id: typeof SARAIVA_FLOW_ID;
  campaign?: InstagramFlowCampaign;
  stage: InstagramFlowStage;
  correlationId: string;
  path?: InstagramFlowPath;
  firstName?: string;
  username?: string;
  profileFacts?: ProfileFact[];
  transport?: 'meta' | 'zernio';
  conversationId?: string;
  qualification?: InstagramFlowQualification;
  initialMessageId?: string;
  publicReplyId?: string;
  destinationUrl?: string;
  exampleOpenedAt?: string;
  communityCtaMessageId?: string;
  communityOpenedAt?: string;
  promptDeliveredAt?: string;
  promptOpenedAt?: string;
  promptMessageId?: string;
  promptCardMessageId?: string;
  productOfferedAt?: string;
  productOpenedAt?: string;
  productCtaMessageId?: string;
  followUpSentAt?: string;
  followUpMessageId?: string;
  followStatus?: FollowStatus;
  followRecheckAttempts?: number;
  recoveryPreparedAt?: string;
  recoverySentAt?: string;
  recoveryMessageId?: string;
  abandonmentAudioSentAt?: string;
  abandonmentAudioStage?: InstagramFlowStage;
  abandonmentAudioMessageId?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  optedOutAt?: string;
}

export interface InstagramQuickReply {
  title: string;
  payload: string;
}

export interface InstagramPostbackButton {
  type: 'postback';
  title: string;
  payload: string;
}

export interface InstagramWebUrlButton {
  type: 'web_url';
  title: string;
  url: string;
}

export type InstagramButton = InstagramPostbackButton | InstagramWebUrlButton;

export type InstagramInteractiveMessage =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; url: string }
  | {
      kind: 'quick_replies';
      text: string;
      quickReplies: InstagramQuickReply[];
    }
  | {
      kind: 'link_card';
      title: string;
      subtitle: string;
      buttons: InstagramButton[];
    };

export interface InstagramFlowStep {
  session: InstagramFlowSession;
  message: InstagramInteractiveMessage;
  messages?: InstagramInteractiveMessage[];
  event: string;
  reasonCode: string;
  offer?: {
    kind: 'example' | 'community';
    path: InstagramFlowPath;
    textFallback: string;
    card: InstagramInteractiveMessage & { kind: 'link_card' };
  };
}

export interface InstagramFlowEntry extends InstagramFlowStep {
  publicReply: string;
}

export interface InstagramFlowOptions {
  now?: Date;
  correlationId?: string;
  firstName?: string;
  username?: string;
  profileFacts?: ProfileFact[];
  communityBaseUrl?: string;
  transport?: 'meta' | 'zernio';
  conversationId?: string;
  trackingBaseUrl?: string;
  followStatus?: FollowStatus;
}

export const SARAIVA_FLOW_PAYLOAD = {
  open: 'FLOW:SARAIVA:OPEN',
  ready: 'FLOW:SARAIVA:READY',
  build: 'FLOW:SARAIVA:BUILD',
  goalProspect: 'FLOW:SARAIVA:GOAL:PROSPECT',
  goalOrganize: 'FLOW:SARAIVA:GOAL:ORGANIZE',
  goalSell: 'FLOW:SARAIVA:GOAL:SELL',
  levelStarting: 'FLOW:SARAIVA:LEVEL:STARTING',
  levelUsesAi: 'FLOW:SARAIVA:LEVEL:USES_AI',
  levelBuilds: 'FLOW:SARAIVA:LEVEL:BUILDS',
  retry: 'FLOW:SARAIVA:RETRY',
  restart: 'FLOW:SARAIVA:RESTART',
  sitesOpen: 'FLOW:SITES:OPEN',
  sitesOwnBusiness: 'FLOW:SITES:INTENT:OWN',
  sitesSell: 'FLOW:SITES:INTENT:SELL',
  followConfirmed: FOLLOW_CONFIRMED_PAYLOAD,
} as const;

const WEBSITE_INTENT_OPTIONS: InstagramQuickReply[] = [
  { title: 'MINHA EMPRESA', payload: SARAIVA_FLOW_PAYLOAD.sitesOwnBusiness },
  { title: 'VENDER SITES', payload: SARAIVA_FLOW_PAYLOAD.sitesSell },
];

const WEBSITE_PROMPT_TEXT_BY_PATH: Record<InstagramFlowPath, string> = {
  ready: `PROMPT DO VÍDEO — COPIE E COLE

Crie um site profissional, mobile-first e pronto para publicar para [EMPRESA], do segmento [SEGMENTO], em [CIDADE]. Objetivo: [ORÇAMENTOS/VENDAS/AGENDAMENTOS]. Público: [PÚBLICO]. Diferencial: [DIFERENCIAL]. WhatsApp: [CONTATO].

Entregue estrutura, copy e código funcional. Inclua: menu mobile; hero com promessa e CTA; provas sem inventar dados; problemas resolvidos; serviços e benefícios; como funciona; diferenciais; portfólio; avaliações reais ou placeholders; áreas atendidas; FAQ; CTA final; contato e páginas de serviço.

Aplique SEO local, Schema.org, acessibilidade, velocidade, formulário e rastreamento de WhatsApp. Use Next.js, TypeScript e Tailwind quando possível. Não use lorem ipsum, frases genéricas, links falsos ou fatos inventados. Marque o que faltar como [PREENCHER]. Não pare no planejamento: entregue o site navegável e funcional.`,
  build: `PROMPT DO VÍDEO — COPIE E COLE

Crie um site mobile-first pronto para apresentar ao potencial cliente [EMPRESA], do segmento [SEGMENTO], em [CIDADE]. Objetivo: mostrar como o site pode gerar [ORÇAMENTOS/VENDAS/AGENDAMENTOS]. Público: [PÚBLICO]. Diferencial: [DIFERENCIAL]. WhatsApp: [CONTATO].

Entregue estrutura, copy e código funcional. Inclua: menu mobile; hero com promessa e CTA; problemas resolvidos; serviços e benefícios; como funciona; diferenciais; portfólio; avaliações reais ou placeholders; áreas atendidas; FAQ; CTA final; contato e páginas de serviço.

Aplique SEO local, Schema.org, acessibilidade, velocidade, formulário e rastreamento de WhatsApp. Use Next.js, TypeScript e Tailwind. Não invente resultados, avaliações, preços ou fatos. Marque o que depender do cliente como [VALIDAR COM CLIENTE]. Não pare no planejamento: entregue o site navegável e funcional.`,
};

export const WEBSITE_PROMPT_MESSAGE_MAX_CHARS = 900;

export const WEBSITE_PRODUCT_BUTTON_OPTIONS = [
  'VER A BIBLIOTECA',
  'ABRIR BIBLIOTECA',
  'QUERO A BIBLIOTECA',
] as const;

export const WEBSITE_PRODUCT_BUTTON_RECOMMENDED = WEBSITE_PRODUCT_BUTTON_OPTIONS[0];

const PATH_OPTIONS: InstagramQuickReply[] = [
  { title: 'QUERO TER UMA', payload: SARAIVA_FLOW_PAYLOAD.ready },
  { title: 'QUERO APRENDER', payload: SARAIVA_FLOW_PAYLOAD.build },
];

const READY_GOALS: InstagramQuickReply[] = [
  { title: 'FALTAM CLIENTES', payload: SARAIVA_FLOW_PAYLOAD.goalProspect },
  { title: 'FALTA PROCESSO', payload: SARAIVA_FLOW_PAYLOAD.goalOrganize },
  { title: 'FALTA CONVERSÃO', payload: SARAIVA_FLOW_PAYLOAD.goalSell },
];

const BUILD_LEVELS: InstagramQuickReply[] = [
  { title: 'COMEÇANDO AGORA', payload: SARAIVA_FLOW_PAYLOAD.levelStarting },
  { title: 'JÁ USO IA', payload: SARAIVA_FLOW_PAYLOAD.levelUsesAi },
  { title: 'JÁ CRIO AUTOMAÇÕES', payload: SARAIVA_FLOW_PAYLOAD.levelBuilds },
];

export function createInstagramCommentFlow(
  mediaId: string,
  options: InstagramFlowOptions = {},
): InstagramFlowEntry | undefined {
  if (!isButtonFlowMedia(mediaId)) return undefined;

  const now = (options.now || new Date()).toISOString();
  const correlationId = options.correlationId || anonymousCorrelation(mediaId, now);
  if (mediaId === WEBSITE_PROMPT_MEDIA_ID) {
    return {
      session: {
        id: SARAIVA_FLOW_ID,
        campaign: 'sites_workshop',
        stage: 'awaiting_intent',
        correlationId,
        transport: options.transport,
        conversationId: options.conversationId,
        startedAt: now,
        updatedAt: now,
      },
      message: websiteRequestMessage(),
      publicReply: 'O prompt completo do vídeo está no seu Direct 👀',
      event: 'sites_flow_started',
      reasonCode: 'campaign_match',
    };
  }
  return {
    session: {
      id: SARAIVA_FLOW_ID,
      campaign: 'prospecting',
      stage: 'awaiting_request',
      correlationId,
      path: 'ready',
      transport: options.transport,
      conversationId: options.conversationId,
      startedAt: now,
      updatedAt: now,
    },
    message: prospectingRequestMessage(),
    publicReply: 'Te enviei o acesso no Direct 👀',
    event: 'flow_started',
    reasonCode: 'campaign_match',
  };
}

export function recoverInstagramFlowSessionForInbound(
  mediaId: string | undefined,
  current: InstagramFlowSession | undefined,
  options: InstagramFlowOptions = {},
): InstagramFlowSession | undefined {
  if (current) return current;
  if (mediaId !== WEBSITE_PROMPT_MEDIA_ID) return undefined;
  return createInstagramCommentFlow(mediaId, options)?.session;
}

export function advanceInstagramFlow(
  current: InstagramFlowSession,
  input: { payload?: string; text?: string },
  options: InstagramFlowOptions = {},
): InstagramFlowStep | undefined {
  if (current.id !== SARAIVA_FLOW_ID) return undefined;

  if (current.campaign === 'sites_workshop') {
    return advanceWebsiteSitesFlow(current, input, options);
  }

  const action = resolveAction(input.payload, input.text);
  const now = (options.now || new Date()).toISOString();

  if (current.stage === 'technical_paused') {
    if (action !== 'retry') return repeat(current, retryMessage(), now);
    return {
      session: { ...current, stage: 'awaiting_intent', updatedAt: now },
      message: pathMessage(current.firstName),
      event: 'technical_retry_requested',
      reasonCode: 'technical_retry',
    };
  }

  if (current.stage === 'awaiting_request') {
    if (action !== 'open') return repeat(current, prospectingRequestMessage(), now);

    const firstName = sanitizeFirstName(options.firstName);
    const enriched = {
      ...current,
      firstName,
      username: options.username?.trim() || current.username,
      profileFacts: options.profileFacts || current.profileFacts,
      updatedAt: now,
    };
    return communityOffer(enriched, options, now);
  }

  if (current.stage === 'awaiting_intent') {
    if (action !== 'ready' && action !== 'build') {
      return repeat(current, pathMessage(current.firstName), now, 'intent_selection_required');
    }
    const firstName = current.firstName || sanitizeFirstName(options.firstName);
    if (!firstName) {
      return {
        session: { ...current, path: action, stage: 'awaiting_name', updatedAt: now },
        message: { kind: 'text', text: 'Antes de continuar: como posso te chamar?' },
        event: 'name_requested',
        reasonCode: 'name_confirmation_required',
      };
    }
    return {
      session: { ...current, firstName, path: action, stage: 'awaiting_goal', updatedAt: now },
      message: goalMessage(action),
      event: 'intent_selected',
      reasonCode: 'intent_selected',
    };
  }

  if (current.stage === 'awaiting_name') {
    const firstName = sanitizeFirstName(input.text);
    if (!firstName || input.payload) {
      return repeat(current, {
        kind: 'text',
        text: 'Só seu primeiro nome 🙂',
      }, now, 'name_confirmation_required');
    }
    const nextStage = current.path ? 'awaiting_goal' : 'awaiting_intent';
    return {
      session: { ...current, firstName, stage: nextStage, updatedAt: now },
      message: current.path ? goalMessage(current.path) : pathMessage(firstName),
      event: 'name_confirmed',
      reasonCode: 'name_confirmed',
    };
  }

  if (current.stage === 'awaiting_path') {
    if (action !== 'ready' && action !== 'build') {
      return repeat(current, pathMessage(current.firstName), now, 'path_selection_required');
    }
    return {
      session: {
        ...current,
        path: action,
        stage: 'awaiting_goal',
        updatedAt: now,
      },
      message: goalMessage(action),
      event: 'intent_selected',
      reasonCode: 'intent_selected',
    };
  }

  if (current.stage === 'awaiting_goal') {
    const desiredOutcome = sanitizeFreeText(input.text);
    if (!desiredOutcome || input.payload) {
      return repeat(current, goalMessage(current.path), now, 'goal_required');
    }
    return communityOffer({
      ...current,
      qualification: { ...current.qualification, desiredOutcome },
    }, options, now);
  }

  if (current.stage === 'awaiting_ready_goal') {
    const goal = resolveReadyGoal(input.payload);
    if (!goal) return repeat(current, readyGoalMessage(), now, 'ready_goal_required');
    return {
      session: {
        ...current,
        qualification: { ...current.qualification, goal },
        stage: 'awaiting_business',
        updatedAt: now,
      },
      message: {
        kind: 'text',
        text: 'Perfeito. Em qual negócio você quer colocar novos clientes entrando? Ex.: clínica, advocacia ou agência.',
      },
      event: 'ready_goal_selected',
      reasonCode: 'qualification_progressed',
    };
  }

  if (current.stage === 'awaiting_business') {
    const business = sanitizeFreeText(input.text);
    if (!business || input.payload) {
      return repeat(current, {
        kind: 'text',
        text: 'Qual é o seu negócio? Ex.: clínica ou agência.',
      }, now, 'business_required');
    }
    return communityOffer({
      ...current,
      qualification: { ...current.qualification, business },
    }, options, now);
  }

  if (current.stage === 'awaiting_build_level') {
    const level = resolveBuildLevel(input.payload);
    if (!level) return repeat(current, buildLevelMessage(), now, 'build_level_required');
    return {
      session: {
        ...current,
        qualification: { ...current.qualification, level },
        stage: 'awaiting_build_goal',
        updatedAt: now,
      },
      message: {
        kind: 'text',
        text: 'Se você pudesse sair com uma automação funcionando, o que ela faria primeiro no seu negócio?',
      },
      event: 'build_level_selected',
      reasonCode: 'qualification_progressed',
    };
  }

  if (current.stage === 'awaiting_build_goal') {
    const buildGoal = sanitizeFreeText(input.text);
    if (!buildGoal || input.payload) {
      return repeat(current, {
        kind: 'text',
        text: 'O que você quer automatizar primeiro?',
      }, now, 'build_goal_required');
    }
    return communityOffer({
      ...current,
      qualification: { ...current.qualification, buildGoal },
    }, options, now);
  }

  if (
    current.stage === 'enriching_profile'
    || current.stage === 'generating_audio'
    || current.stage === 'offering_example'
    || current.stage === 'example_opened'
    || current.stage === 'offering_community'
  ) {
    return {
      session: { ...current, stage: 'completed', updatedAt: now, completedAt: now },
      message: { kind: 'text', text: 'Qual parte você vai colocar pra rodar primeiro?' },
      event: 'offer_completed',
      reasonCode: 'offer_delivered',
    };
  }

  if (action === 'restart') {
    return {
      session: {
        ...current,
        stage: 'awaiting_intent',
        path: undefined,
        completedAt: undefined,
        updatedAt: now,
      },
      message: pathMessage(current.firstName),
      event: 'flow_restarted',
      reasonCode: 'flow_restarted',
    };
  }

  return repeat(current, {
    kind: 'quick_replies',
    text: 'Quer rever os caminhos?',
    quickReplies: [{ title: 'REVER OPÇÕES', payload: SARAIVA_FLOW_PAYLOAD.restart }],
  }, now, 'completed_session');
}

export function shouldAdvanceInstagramFlow(
  current: InstagramFlowSession,
  input: { payload?: string; text?: string },
): boolean {
  const action = resolveAction(input.payload, input.text);
  const text = input.text?.trim() || '';
  if (current.campaign === 'sites_workshop') {
    if (
      !current.promptDeliveredAt
      && ['technical_paused', 'offering_community', 'offering_product', 'completed'].includes(current.stage)
    ) {
      return true;
    }
    if (current.stage === 'technical_paused') return action === 'retry';
    if (current.stage === 'awaiting_follow') {
      return input.payload === SARAIVA_FLOW_PAYLOAD.followConfirmed;
    }
    if (current.stage === 'awaiting_request') {
      return input.payload === SARAIVA_FLOW_PAYLOAD.sitesOpen
        || ['criar meu site', 'quero criar meu site'].includes(normalize(text));
    }
    return current.stage === 'awaiting_intent' && Boolean(resolveWebsiteIntent(input.payload, text));
  }
  if (action === 'restart') return true;
  if (current.stage === 'technical_paused') return action === 'retry';
  if (current.stage === 'awaiting_request') return action === 'open';
  if (current.stage === 'awaiting_intent') return action === 'ready' || action === 'build';
  if (current.stage === 'awaiting_path') return action === 'ready' || action === 'build';
  if (current.stage === 'awaiting_name') {
    return !input.payload && Boolean(sanitizeFirstName(text)) && !looksLikeQuestion(text);
  }
  if (current.stage === 'awaiting_ready_goal') return Boolean(resolveReadyGoal(input.payload));
  if (current.stage === 'awaiting_build_level') return Boolean(resolveBuildLevel(input.payload));
  if (current.stage === 'awaiting_goal' || current.stage === 'awaiting_business' || current.stage === 'awaiting_build_goal') {
    return !input.payload && Boolean(sanitizeFreeText(text)) && !looksLikeQuestion(text);
  }
  return false;
}

export function isInstagramFlowOptOut(text?: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  return /^(?:stop|pare|parar|cancele|cancelar|nao tenho interesse|sem interesse|nao quero mais|nao me chame|nao mande mais|pare de mandar|para de mandar|remova meu contato|quero sair|sair da lista)(?:\s*[,!.]?\s*por favor)?[.!\s]*$/u.test(value);
}

export function isInstagramFlowResume(text?: string): boolean {
  return /^(?:quero retomar|retomar fluxo|voltar ao fluxo)[.!\s]*$/u.test(normalize(text));
}

export function resumeInstagramFlowMessage(
  current: InstagramFlowSession,
): InstagramInteractiveMessage {
  if (current.campaign === 'sites_workshop') {
    if (current.stage === 'awaiting_request') return websiteRequestMessage();
    if (current.stage === 'awaiting_intent') return websiteRequestMessage();
    if (current.stage === 'offering_product' || current.stage === 'offering_community') {
      if (!current.promptDeliveredAt) return websiteRequestMessage();
      return websitePromptReminder();
    }
    if (current.stage === 'completed' && current.promptDeliveredAt) return websitePromptReminder();
    if (current.stage === 'completed' && !current.promptDeliveredAt) return websiteRequestMessage();
  }
  if (current.stage === 'awaiting_request') return requestMessage();
  if (current.stage === 'awaiting_intent') return pathMessage(current.firstName);
  if (current.stage === 'awaiting_follow') {
    return websiteFollowGateMessage(current.followStatus || 'unknown', current.firstName);
  }
  if (current.stage === 'awaiting_name') return { kind: 'text', text: 'Como posso te chamar?' };
  if (current.stage === 'awaiting_path') return pathMessage(current.firstName);
  if (current.stage === 'awaiting_goal') return goalMessage(current.path);
  if (current.stage === 'awaiting_ready_goal') return readyGoalMessage();
  if (current.stage === 'awaiting_business') return { kind: 'text', text: 'Qual é o seu negócio?' };
  if (current.stage === 'awaiting_build_level') return buildLevelMessage();
  if (current.stage === 'awaiting_build_goal') {
    return { kind: 'text', text: 'O que você quer automatizar primeiro?' };
  }
  if (current.stage === 'offering_community') {
    return { kind: 'text', text: 'O acesso gratuito está no botão ENTRAR NA COMUNIDADE logo acima.' };
  }
  if (current.stage === 'offering_example' || current.stage === 'example_opened') {
    return { kind: 'text', text: 'O próximo passo está no botão logo acima.' };
  }
  if (current.stage === 'technical_paused') return retryMessage();
  return {
    kind: 'quick_replies',
    text: 'Quer rever os caminhos?',
    quickReplies: [{ title: 'REVER OPÇÕES', payload: SARAIVA_FLOW_PAYLOAD.restart }],
  };
}

export function pauseInstagramFlow(
  current: InstagramFlowSession,
  now = new Date(),
): InstagramFlowStep {
  return {
    session: { ...current, stage: 'technical_paused', updatedAt: now.toISOString() },
    message: retryMessage(),
    event: 'technical_paused',
    reasonCode: 'technical_alert',
  };
}

export function summarizeInteractiveMessage(message: InstagramInteractiveMessage): string {
  if (message.kind === 'link_card') return `${message.title}\n${message.subtitle}`;
  if (message.kind === 'audio') return '[áudio personalizado]';
  return message.text;
}

function requestMessage(): InstagramInteractiveMessage {
  return {
    kind: 'quick_replies',
    text: 'Você quer ter uma ferramenta dessas ou aprender a criar estruturas assim?',
    quickReplies: PATH_OPTIONS,
  };
}

function websiteRequestMessage(): InstagramInteractiveMessage {
  return {
    kind: 'quick_replies',
    text: 'Tenho o prompt completo do vídeo aqui. Você quer usar no site da sua empresa ou criar sites para clientes?',
    quickReplies: WEBSITE_INTENT_OPTIONS,
  };
}

function prospectingRequestMessage(): InstagramInteractiveMessage {
  return {
    kind: 'quick_replies',
    text: 'Você comentou porque quer colocar essa estrutura automatizada pra rodar no seu negócio. Clica abaixo pra pegar o acesso.',
    quickReplies: [{
      title: 'VER ESTRUTURA',
      payload: SARAIVA_FLOW_PAYLOAD.open,
    }],
  };
}

function pathMessage(firstName?: string): InstagramInteractiveMessage {
  const greeting = firstName ? `${firstName}, ` : '';
  return {
    kind: 'quick_replies',
    text: `${greeting}você quer ter uma ferramenta dessas ou aprender a criar estruturas assim?`,
    quickReplies: PATH_OPTIONS,
  };
}

function goalMessage(path?: InstagramFlowPath): InstagramInteractiveMessage {
  return {
    kind: 'text',
    text: path === 'ready'
      ? 'Qual resultado você gostaria que uma estrutura dessas colocasse em movimento no seu negócio?'
      : 'O que você gostaria de conseguir construir usando IA e automação?',
  };
}

function readyGoalMessage(): InstagramInteractiveMessage {
  return {
    kind: 'quick_replies',
    text: 'Para eu te mostrar o melhor ponto de partida: o que mais está travando suas vendas hoje?',
    quickReplies: READY_GOALS,
  };
}

function buildLevelMessage(): InstagramInteractiveMessage {
  return {
    kind: 'quick_replies',
    text: 'Para eu te mostrar pelo ponto certo: onde você está hoje com IA e automações?',
    quickReplies: BUILD_LEVELS,
  };
}

function retryMessage(): InstagramInteractiveMessage {
  return {
    kind: 'quick_replies',
    text: 'Quer retomar de onde parou?',
    quickReplies: [{ title: 'TENTAR NOVAMENTE', payload: SARAIVA_FLOW_PAYLOAD.retry }],
  };
}

function buildOfferFallback(session: InstagramFlowSession): string {
  const name = session.firstName || 'Olha';
  const objective = asSentenceContinuation(session.qualification?.desiredOutcome
    || session.qualification?.business
    || session.qualification?.buildGoal
    || 'colocar uma estrutura em movimento');
  return session.path === 'ready'
    ? `${name}, você quer ${objective} sem começar do zero. Na comunidade do WhatsApp, eu compartilho estruturas reais para você copiar e adaptar ao seu negócio. Entra pelo botão que deixei aqui. Faz sentido pra você?`
    : `${name}, você quer ${objective}. Para transformar isso em uma estrutura funcionando, precisa ver como a ideia é construída. Na comunidade do WhatsApp, eu mostro as estruturas e os bastidores da construção. Entra pelo botão que deixei aqui. Faz sentido pra você?`;
}

function asSentenceContinuation(value: string): string {
  const trimmed = value.trim();
  return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/u.test(trimmed)
    ? `${trimmed[0].toLocaleLowerCase('pt-BR')}${trimmed.slice(1)}`
    : trimmed;
}

export type TrackedFlowKind = 'example' | 'community' | 'prompt' | 'product';

export function trackedRedirectUrl(
  kind: TrackedFlowKind,
  session: InstagramFlowSession,
  options: InstagramFlowOptions = {},
): string {
  const base = (options.trackingBaseUrl
    || process.env.INSTAGRAM_TRACKING_BASE_URL
    || 'https://52cv7zdc64autz4ltjj6h7uce40ktyfd.lambda-url.us-east-1.on.aws').replace(/\/+$/, '');
  const url = new URL(`/instagram/${kind}`, `${base}/`);
  const intent = session.path === 'ready' ? 'ter' : 'aprender';
  url.searchParams.set('intent', intent);
  url.searchParams.set('correlation', session.correlationId);
  const linkSecret = process.env.INSTAGRAM_COMMUNITY_LINK_SECRET?.trim();
  if (linkSecret) {
    url.searchParams.set(
      'sig',
      createHmac('sha256', linkSecret)
        .update(`${kind}:${intent}:${session.correlationId}`)
        .digest('hex'),
    );
  }
  return url.toString();
}

export function createCommunityCtaCard(
  session: InstagramFlowSession,
  options: InstagramFlowOptions = {},
): InstagramInteractiveMessage & { kind: 'link_card' } {
  return {
    kind: 'link_card',
    title: 'Laboratório de Agentes & IA Saraiva',
    subtitle: 'Acesse as estruturas reais, agentes e bastidores de IA para copiar e adaptar.',
    buttons: [{
      type: 'web_url',
      title: 'ACESSAR LABORATÓRIO',
      url: trackedRedirectUrl('community', session, options),
    }],
  };
}

export function createCommunityDestinationUrl(session: InstagramFlowSession): string {
  const raw = process.env.INSTAGRAM_COMMUNITY_DESTINATION_URL
    || 'https://saraiva.ai';
  const url = new URL(raw);
  return url.toString();
}

export function verifyTrackedFlowSignature(
  kind: TrackedFlowKind,
  intent: 'ter' | 'aprender',
  correlationId: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret)
    .update(`${kind}:${intent}:${correlationId}`)
    .digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

interface StorefrontAttributionInput {
  correlationId: string;
  intent: 'ter' | 'aprender';
  issuedAt: number;
  secret: string;
}

// Mantidos como contrato de compatibilidade com o handler Lambda publicado.
export function createStorefrontProductDestinationUrl(
  input: StorefrontAttributionInput,
): string {
  if (!input.secret || input.secret.length < 32) {
    throw new Error('instagram_attribution_secret_invalid');
  }
  const destination = new URL('https://prompt.saraiva.ai/quero-o-prompt');
  destination.searchParams.set('correlationId', input.correlationId);
  destination.searchParams.set('intent', input.intent);
  destination.searchParams.set('campaign', 'quero_o_prompt');
  destination.searchParams.set('sourceIntent', input.intent);
  destination.searchParams.set('sourceIssuedAt', String(input.issuedAt));
  destination.searchParams.set('sourceSignature', createHmac('sha256', input.secret)
    .update(`quero_o_prompt:${input.intent}:${input.correlationId}:${input.issuedAt}`)
    .digest('hex'));
  return destination.toString();
}

export function createFreePromptDestinationUrl(
  input: StorefrontAttributionInput,
): string {
  const destination = new URL(createStorefrontProductDestinationUrl(input));
  destination.pathname = '/prompt-do-video';
  return destination.toString();
}

function resolveAction(payload?: string, text?: string): 'open' | 'ready' | 'build' | 'retry' | 'restart' | undefined {
  if (payload === SARAIVA_FLOW_PAYLOAD.open) return 'open';
  if (payload === SARAIVA_FLOW_PAYLOAD.ready) return 'ready';
  if (payload === SARAIVA_FLOW_PAYLOAD.build) return 'build';
  if (payload === SARAIVA_FLOW_PAYLOAD.retry) return 'retry';
  if (payload === SARAIVA_FLOW_PAYLOAD.restart) return 'restart';
  const normalized = normalize(text);
  if (['quero acessar', 'quero ver', 'quero copiar', 'abrir', '1'].includes(normalized)) return 'open';
  if ([
    'quero ter uma',
    'quero ter',
    'quero usar',
    'quero usar pronta',
    'usar pronta',
    'usar a estrutura',
    'ferramenta pronta',
    'ferramenta',
    'pronta',
  ].includes(normalized)) return 'ready';
  if ([
    'quero aprender',
    'aprender a montar',
    'aprender a criar',
    'aprender',
    'criar',
  ].includes(normalized)) return 'build';
  return undefined;
}

function resolveReadyGoal(payload?: string): InstagramFlowQualification['goal'] {
  if (payload === SARAIVA_FLOW_PAYLOAD.goalProspect) return 'prospect_clients';
  if (payload === SARAIVA_FLOW_PAYLOAD.goalOrganize) return 'organize_process';
  if (payload === SARAIVA_FLOW_PAYLOAD.goalSell) return 'sell_more';
  return undefined;
}

function resolveBuildLevel(payload?: string): InstagramFlowQualification['level'] {
  if (payload === SARAIVA_FLOW_PAYLOAD.levelStarting) return 'starting';
  if (payload === SARAIVA_FLOW_PAYLOAD.levelUsesAi) return 'uses_ai';
  if (payload === SARAIVA_FLOW_PAYLOAD.levelBuilds) return 'builds_automations';
  return undefined;
}

function resolveWebsiteIntent(
  payload?: string,
  text?: string,
): InstagramFlowPath | undefined {
  if (payload === SARAIVA_FLOW_PAYLOAD.sitesOwnBusiness) return 'ready';
  if (payload === SARAIVA_FLOW_PAYLOAD.sitesSell) return 'build';
  const value = normalize(text);
  if (
    !value
    || isNegatedOrUncertainWebsiteIntent(value)
    || mentionsBothWebsiteIntents(value)
    || looksLikeQuestion(text || '')
  ) return undefined;
  if (['minha empresa', 'meu negocio', 'meu site', 'empresa propria'].includes(value)) return 'ready';
  if (['vender sites', 'criar para clientes', 'sites para clientes', 'meus clientes'].includes(value)) return 'build';
  if (
    /\b(?:vender|revender|oferecer|entregar)\b.{0,60}\b(?:sites?|isso|projetos?)\b.{0,40}\b(?:clientes?|empresas?|terceiros?)\b/u.test(value)
    || /\b(?:criar|fazer|montar|desenvolver)\b.{0,50}\b(?:sites?|projetos?)\b.{0,35}\b(?:para|pra|pros?|as?)\s+(?:(?:um|uma|os|as|meus?|minhas?)\s+)?(?:clientes?|empresas?|terceiros?)\b/u.test(value)
    || /\b(?:para|pra|pros?)\s+(?:os\s+)?meus?\s+clientes?\b/u.test(value)
    || /^(?:e|seria)\s+(?:para|pra|pro)\s+(?:(?:um|uma|o|a|meu|minha)\s+)?cliente\b/u.test(value)
    || /\btrabalho\s+(?:com|criando|fazendo|desenvolvendo)\b.{0,45}\bsites?\b.{0,30}\b(?:para|pra)?\s*clientes?\b/u.test(value)
  ) return 'build';
  if (
    /\b(?:minha|meu)\s+(?:empresa|negocio|site|clinica|agencia|loja|escritorio|restaurante|projeto)\b/u.test(value)
    || /\b(?:uso|projeto)\s+propri[oa]\b/u.test(value)
    || /\b(?:usar|aplicar|criar|fazer|montar)\b.{0,50}\b(?:na|no|para|pra|pro)\s+(?:a\s+|o\s+)?(?:minha|meu)\b/u.test(value)
  ) return 'ready';
  return undefined;
}

function isNegatedOrUncertainWebsiteIntent(value: string): boolean {
  return /^(?:ainda\s+)?nao\b/u.test(value)
    || /\bnao\s+(?:trabalho|atuo)\b.{0,80}\b(?:sites?|clientes?)\b/u.test(value)
    || /\bnao\s+(?:quero|vou|pretendo)\s+(?:usar|aplicar|vender|revender|criar|fazer|montar|desenvolver|oferecer|entregar)\b/u.test(value)
    || /\bnao\s+(?:e|seria)\s+(?:para|pra|pro|na|no)\b/u.test(value)
    || /\b(?:nao|nem)\s+(?:para|pra|pro)\s+(?:(?:a|o)\s+)?(?:minha|meu|clientes?)\b/u.test(value)
    || /\b(?:nao sei|nao decidi|sem certeza|em duvida|indecis[oa]|talvez|pode ser)\b/u.test(value);
}

function mentionsBothWebsiteIntents(value: string): boolean {
  const ownBusiness = /\b(?:minha|meu)\s+(?:empresa|negocio|site|clinica|agencia|loja|escritorio|restaurante|projeto)\b|\b(?:uso|projeto)\s+propri[oa]\b/u.test(value);
  const clientWork = /\b(?:vender|revender|oferecer|entregar|criar|fazer|montar|desenvolver)\b.{0,60}\b(?:sites?|isso|projetos?)?\b.{0,30}\b(?:para|pra|pros?)\s+(?:(?:um|uma|os|as|meus?|minhas?)\s+)?(?:clientes?|empresas?|terceiros?)\b|\b(?:vender sites?|sites? para clientes?)\b/u.test(value);
  return ownBusiness && clientWork;
}

export function createWebsitePromptCard(
  session: InstagramFlowSession,
  options: InstagramFlowOptions = {},
): InstagramInteractiveMessage & { kind: 'link_card' } {
  return {
    kind: 'link_card',
    title: 'Prompt completo do vídeo',
    subtitle: session.path === 'ready'
      ? 'Copie, troque os campos pelos fatos da sua empresa e use na IA que preferir.'
      : 'Copie, troque os campos pelo briefing do cliente e use na IA que preferir.',
    buttons: [{
      type: 'web_url',
      title: 'COPIAR PROMPT',
      url: trackedRedirectUrl('prompt', session, options),
    }],
  };
}

export function createWebsiteProductCard(
  session: InstagramFlowSession,
  options: InstagramFlowOptions = {},
): InstagramInteractiveMessage & { kind: 'link_card' } {
  return {
    kind: 'link_card',
    title: 'Biblioteca Secreta — 24 prompts',
    subtitle: session.path === 'ready'
      ? 'Acesso permanente por R$ 19,90 para criar sem começar da página em branco.'
      : 'Acesso permanente por R$ 19,90 para adaptar a diferentes clientes e projetos.',
    buttons: [{
      type: 'web_url',
      title: WEBSITE_PRODUCT_BUTTON_RECOMMENDED,
      url: trackedRedirectUrl('product', session, options),
    }],
  };
}

function websitePromptReminder(): InstagramInteractiveMessage {
  return {
    kind: 'text',
    text: 'O prompt completo está nas mensagens acima. O único link é o botão da Biblioteca Secreta que enviei depois dele.',
  };
}

export function createWebsitePromptTextMessages(
  path: InstagramFlowPath = 'ready',
  text = WEBSITE_PROMPT_TEXT_BY_PATH[path],
): Array<InstagramInteractiveMessage & { kind: 'text' }> {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) throw new Error('website_prompt_message_empty');
  if (normalized.length > WEBSITE_PROMPT_MESSAGE_MAX_CHARS) {
    throw new Error('website_prompt_message_too_long');
  }
  return [{ kind: 'text', text: normalized }];
}

function websiteFollowGateMessage(
  status: FollowStatus,
  firstName?: string,
): InstagramInteractiveMessage & { kind: 'quick_replies' } {
  const gate = buildFollowGateMessage(status, {
    firstName,
    contentTitle: 'prompt completo do vídeo',
  });
  return {
    kind: 'quick_replies',
    text: gate.message,
    quickReplies: (gate.buttons || []).map((button) => ({
      title: button.title,
      payload: button.payload,
    })),
  };
}

function websiteFollowGateStep(
  current: InstagramFlowSession,
  path: InstagramFlowPath,
  status: FollowStatus,
  options: InstagramFlowOptions,
  now: string,
): InstagramFlowStep {
  const rechecking = current.stage === 'awaiting_follow';
  const session: InstagramFlowSession = {
    ...current,
    path,
    firstName: sanitizeFirstName(options.firstName) || current.firstName,
    username: options.username?.trim() || current.username,
    profileFacts: options.profileFacts || current.profileFacts,
    stage: 'awaiting_follow',
    followStatus: status,
    followRecheckAttempts: rechecking
      ? (current.followRecheckAttempts || 0) + 1
      : 0,
    updatedAt: now,
  };
  return {
    session,
    message: websiteFollowGateMessage(status, session.firstName),
    event: rechecking ? 'website_follow_rechecked' : 'website_follow_required',
    reasonCode: status === 'not_following'
      ? 'follow_required_before_content'
      : 'follow_status_unavailable',
  };
}

function websiteDeliveryStep(
  current: InstagramFlowSession,
  path: InstagramFlowPath,
  options: InstagramFlowOptions,
  now: string,
  event = 'website_prompt_delivered',
  reasonCode = 'free_prompt_before_product',
): InstagramFlowStep {
  const session: InstagramFlowSession = {
    ...current,
    path,
    firstName: sanitizeFirstName(options.firstName) || current.firstName,
    username: options.username?.trim() || current.username,
    profileFacts: options.profileFacts || current.profileFacts,
    stage: 'offering_product',
    followStatus: 'following',
    promptDeliveredAt: now,
    productOfferedAt: now,
    updatedAt: now,
  };
  const messages: InstagramInteractiveMessage[] = [
    ...createWebsitePromptTextMessages(path),
    createWebsiteProductCard(session, options),
  ];
  return {
    session,
    message: messages[0]!,
    messages,
    event,
    reasonCode,
  };
}

function sanitizeFreeText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length < 2 || normalized.length > 280) return undefined;
  return normalized;
}

function communityOffer(
  current: InstagramFlowSession,
  options: InstagramFlowOptions,
  now: string,
  event: { event: string; reasonCode: string } = {
    event: 'goal_captured',
    reasonCode: 'community_offer_ready',
  },
): InstagramFlowStep {
  const session: InstagramFlowSession = {
    ...current,
    stage: 'offering_community',
    destinationUrl: createCommunityDestinationUrl(current),
    updatedAt: now,
  };
  return {
    session,
    message: { kind: 'text', text: buildOfferFallback(session) },
    event: event.event,
    reasonCode: event.reasonCode,
    offer: {
      kind: 'community',
      path: session.path!,
      textFallback: buildOfferFallback(session),
      card: createCommunityCtaCard(session, options),
    },
  };
}

function advanceWebsiteSitesFlow(
  current: InstagramFlowSession,
  input: { payload?: string; text?: string },
  options: InstagramFlowOptions,
): InstagramFlowStep {
  const now = (options.now || new Date()).toISOString();
  if (
    !current.promptDeliveredAt
    && ['technical_paused', 'offering_community', 'offering_product', 'completed'].includes(current.stage)
  ) {
    return {
      session: {
        ...current,
        stage: 'awaiting_intent',
        path: undefined,
        destinationUrl: undefined,
        communityCtaMessageId: undefined,
        communityOpenedAt: undefined,
        productOfferedAt: undefined,
        productCtaMessageId: undefined,
        promptMessageId: undefined,
        promptCardMessageId: undefined,
        completedAt: undefined,
        updatedAt: now,
      },
      message: websiteRequestMessage(),
      event: 'legacy_site_flow_recovered',
      reasonCode: 'intent_selection_required',
    };
  }
  if (current.stage === 'technical_paused') {
    if (input.payload !== SARAIVA_FLOW_PAYLOAD.retry) {
      return repeat(current, retryMessage(), now);
    }
    if (!current.path) {
      return {
        session: { ...current, stage: 'awaiting_intent', updatedAt: now },
        message: websiteRequestMessage(),
        event: 'technical_retry_requested',
        reasonCode: 'technical_retry',
      };
    }
    if (options.followStatus !== 'following') {
      return websiteFollowGateStep(
        current,
        current.path,
        options.followStatus || 'unknown',
        options,
        now,
      );
    }
    return websiteDeliveryStep(current, current.path, options, now, 'technical_retry_requested', 'technical_retry');
  }

  if (current.stage === 'awaiting_request') {
    const opened = input.payload === SARAIVA_FLOW_PAYLOAD.sitesOpen
      || ['criar meu site', 'quero criar meu site'].includes(normalize(input.text));
    if (!opened) return repeat(current, websiteRequestMessage(), now, 'site_creation_confirmation_required');
    return {
      session: { ...current, stage: 'awaiting_intent', path: undefined, updatedAt: now },
      message: websiteRequestMessage(),
      event: 'legacy_site_flow_recovered',
      reasonCode: 'intent_selection_required',
    };
  }

  if (current.stage === 'awaiting_intent') {
    const path = resolveWebsiteIntent(input.payload, input.text);
    if (!path) return repeat(current, websiteRequestMessage(), now, 'intent_selection_required');
    if (options.followStatus !== 'following') {
      return websiteFollowGateStep(
        current,
        path,
        options.followStatus || 'unknown',
        options,
        now,
      );
    }
    return websiteDeliveryStep(current, path, options, now);
  }

  if (current.stage === 'awaiting_follow') {
    if (input.payload !== SARAIVA_FLOW_PAYLOAD.followConfirmed || !current.path) {
      return repeat(
        current,
        websiteFollowGateMessage(current.followStatus || 'unknown', current.firstName),
        now,
        'follow_confirmation_required',
      );
    }
    if (options.followStatus !== 'following') {
      return websiteFollowGateStep(
        current,
        current.path,
        options.followStatus || 'unknown',
        options,
        now,
      );
    }
    return websiteDeliveryStep(
      current,
      current.path,
      options,
      now,
      'website_prompt_delivered_after_follow',
      'follow_confirmed_before_content',
    );
  }

  if (current.stage === 'offering_product' || current.stage === 'offering_community') {
    if (current.promptDeliveredAt) {
      return repeat(current, websitePromptReminder(), now, 'prompt_link_already_sent');
    }
    return repeat(current, websiteRequestMessage(), now, 'intent_selection_required');
  }

  if (current.stage === 'completed' && current.promptDeliveredAt) {
    return repeat(current, websitePromptReminder(), now, 'prompt_link_already_sent');
  }

  return repeat(current, websiteRequestMessage(), now, 'site_flow_state_recovered');
}

function repeat(
  current: InstagramFlowSession,
  message: InstagramInteractiveMessage,
  now: string,
  reasonCode = 'invalid_option',
): InstagramFlowStep {
  return {
    session: { ...current, updatedAt: now },
    message,
    event: 'option_repeated',
    reasonCode,
  };
}

function sanitizeFirstName(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const introduced = trimmed.match(
    /(?:me chamo|meu nome (?:é|e)|pode me chamar de|sou (?:o|a)?)\s+([\p{L}'’-]+)/iu,
  )?.[1];
  const candidate = (introduced || trimmed.split(/\s+/)[0])?.replace(/[^\p{L}'’-]/gu, '');
  if (!candidate || candidate.length < 2 || candidate.length > 30) return undefined;
  return candidate.charAt(0).toLocaleUpperCase('pt-BR') + candidate.slice(1).toLocaleLowerCase('pt-BR');
}

function anonymousCorrelation(mediaId: string, now: string): string {
  return createHash('sha256').update(`${mediaId}:${now}`).digest('hex').slice(0, 20);
}

function normalize(value?: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function looksLikeQuestion(value: string): boolean {
  const normalized = normalize(value);
  return value.includes('?')
    || /^(?:como|quanto|onde|qual|quando|quem|o que|por que|porque|posso|pode|tem|serve|funciona)\b/.test(normalized)
    || /^isso\s+(?:serve|funciona|pode|tem)\b/.test(normalized);
}

function isButtonFlowMedia(mediaId: string): boolean {
  return mediaId === PROSPECTING_FLOW_MEDIA_ID
    || mediaId === WEBSITE_PROMPT_MEDIA_ID;
}
