import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../campaignTrigger.js';
import type { ProfileFact } from './profilePersonalization.js';

export const SARAIVA_FLOW_ID = 'saraiva-prospecting-v1';

export type InstagramFlowCampaign = 'prospecting' | 'sites_workshop';

export type InstagramFlowStage =
  | 'awaiting_request'
  | 'awaiting_intent'
  | 'awaiting_name'
  | 'awaiting_path'
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
  promptCardMessageId?: string;
  productOfferedAt?: string;
  productOpenedAt?: string;
  productCtaMessageId?: string;
  followUpSentAt?: string;
  followUpMessageId?: string;
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
} as const;

const WEBSITE_INTENT_OPTIONS: InstagramQuickReply[] = [
  { title: 'MINHA EMPRESA', payload: SARAIVA_FLOW_PAYLOAD.sitesOwnBusiness },
  { title: 'VENDER SITES', payload: SARAIVA_FLOW_PAYLOAD.sitesSell },
];

export const WEBSITE_PRODUCT_BUTTON_OPTIONS = [
  'VER GERADOR',
  'ACESSAR GERADOR',
  'CONHECER GERADOR',
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
      publicReply: 'Te chamei no Direct para entregar o prompt 👀',
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
    if (current.stage === 'awaiting_request') {
      return input.payload === SARAIVA_FLOW_PAYLOAD.sitesOpen
        || ['criar meu site', 'quero criar meu site'].includes(normalize(text));
    }
    if (current.stage === 'offering_product' || current.stage === 'offering_community') return true;
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
      return websiteOfferReminder(current.path);
    }
    if (current.stage === 'completed' && !current.promptDeliveredAt) return websiteRequestMessage();
  }
  if (current.stage === 'awaiting_request') return requestMessage();
  if (current.stage === 'awaiting_intent') return pathMessage(current.firstName);
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
    text: 'Pode deixar: vou te entregar o prompt do vídeo. Você quer usar para:',
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

function trackedRedirectUrl(
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

export function createStorefrontProductDestinationUrl(input: {
  correlationId: string;
  intent: 'ter' | 'aprender';
  issuedAt: number;
  secret: string;
}): string {
  if (!input.secret || input.secret.length < 32) {
    throw new Error('instagram_attribution_secret_invalid');
  }
  const destination = new URL('https://prompt.saraiva.ai/quero-o-prompt');
  destination.searchParams.set('correlationId', input.correlationId);
  destination.searchParams.set('intent', input.intent);
  destination.searchParams.set('campaign', 'quero_o_prompt');
  destination.searchParams.set('sourceIntent', input.intent);
  destination.searchParams.set('sourceIssuedAt', String(input.issuedAt));
  destination.searchParams.set(
    'sourceSignature',
    createHmac('sha256', input.secret)
      .update(`quero_o_prompt:${input.intent}:${input.correlationId}:${input.issuedAt}`)
      .digest('hex'),
  );
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
  if (['minha empresa', 'meu negocio', 'meu site', 'empresa propria'].includes(value)) return 'ready';
  if (['vender sites', 'criar para clientes', 'sites para clientes', 'meus clientes'].includes(value)) return 'build';
  return undefined;
}

export function createWebsitePromptCard(
  session: InstagramFlowSession,
  options: InstagramFlowOptions = {},
): InstagramInteractiveMessage & { kind: 'link_card' } {
  return {
    kind: 'link_card',
    title: 'Prompt usado no vídeo',
    subtitle: session.path === 'ready'
      ? 'Use gratuitamente como ponto de partida para o site da sua empresa.'
      : 'Use gratuitamente como ponto de partida para criar sites para potenciais clientes.',
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
    title: 'Gerador de Prompts — R$ 9,97',
    subtitle: session.path === 'ready'
      ? 'Crie novos prompts para páginas, produtos, serviços e campanhas da sua empresa.'
      : 'Crie novos prompts para diferentes nichos, empresas e potenciais clientes.',
    buttons: [{
      type: 'web_url',
      title: WEBSITE_PRODUCT_BUTTON_RECOMMENDED,
      url: trackedRedirectUrl('product', session, options),
    }],
  };
}

function websiteContextMessage(path: InstagramFlowPath): InstagramInteractiveMessage {
  return {
    kind: 'text',
    text: path === 'ready'
      ? 'Perfeito. Este é o prompt do vídeo para você usar como ponto de partida no site da sua empresa 👇'
      : 'Perfeito. Este é o prompt do vídeo para você usar como ponto de partida em sites de potenciais clientes 👇',
  };
}

function websiteTransitionMessage(path: InstagramFlowPath): InstagramInteractiveMessage {
  return {
    kind: 'text',
    text: path === 'ready'
      ? 'Esse modelo resolve o exemplo do vídeo. Para criar novos prompts para outras páginas e necessidades da sua empresa, você teria que adaptar a estrutura manualmente.'
      : 'Esse modelo resolve o exemplo do vídeo. Para usar em outros nichos e clientes, você teria que adaptar e reescrever a estrutura manualmente.',
  };
}

function websiteOfferReminder(path?: InstagramFlowPath): InstagramInteractiveMessage {
  return {
    kind: 'text',
    text: path === 'build'
      ? 'O prompt gratuito já está liberado acima. Teste com um projeto; se quiser criar versões para outros nichos e clientes, o Gerador está no botão que enviei.'
      : 'O prompt gratuito já está liberado acima. Teste na sua empresa; se quiser criar versões para outras páginas, o Gerador está no botão que enviei.',
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
    promptDeliveredAt: now,
    productOfferedAt: now,
    updatedAt: now,
  };
  const messages: InstagramInteractiveMessage[] = [
    websiteContextMessage(path),
    createWebsitePromptCard(session, options),
    websiteTransitionMessage(path),
    createWebsiteProductCard(session, options),
  ];
  return {
    session,
    message: messages[0],
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
    return websiteDeliveryStep(
      current,
      current.path,
      options,
      now,
      'technical_retry_requested',
      'technical_retry',
    );
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
    return websiteDeliveryStep(current, path, options, now);
  }

  if (current.stage === 'offering_product' || current.stage === 'offering_community') {
    return repeat(current, websiteOfferReminder(current.path), now, 'product_cta_already_sent');
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
    || /^(?:como|quanto|onde|qual|quando|quem|o que|por que|porque|posso|pode|tem|isso|serve|funciona)\b/.test(normalized);
}

function isButtonFlowMedia(mediaId: string): boolean {
  return mediaId === PROSPECTING_FLOW_MEDIA_ID
    || mediaId === WEBSITE_PROMPT_MEDIA_ID;
}
