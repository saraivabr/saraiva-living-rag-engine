import {
  DIAGNOSTIC_FORK_QUESTION,
  PAIN_FORK_QUESTION,
  isForkQuestion,
  matchDiagnosticFork,
} from './diagnosticFork.js';
import {
  buildSalesSnapshot,
  diagnosticQuestion,
  isVoiceAiWorkshopPromise,
  paymentVerificationReply,
  workshopCheckoutReply,
  type SalesSnapshot,
} from '../sales/empresaAgentica.js';
import {
  isMusicCampaignMedia,
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../campaignTrigger.js';

export type PromiseKind =
  | 'empresa_agentica_live'
  | 'website_prompt'
  | 'sites_whatsapp_workshop'
  | 'prospecting_automation'
  | 'music_business'
  | 'whatsapp_elevenlabs_workshop'
  | 'voice_ai_map_workshop'
  | 'voice_call_map'
  | 'github_flow'
  | 'sdr_voice'
  | 'autism_support'
  | 'demosell'
  | 'standard_operation'
  | 'anti_betting'
  | 'tdah_repos'
  | 'prompt'
  | 'ads'
  | 'whatsapp_ai'
  | 'automation'
  | 'diagnostic'
  | 'unknown';

export interface PostPromise {
  kind: PromiseKind;
  label: string;
  publicReply: string;
  privateReply: string;
}

export interface CampaignReplyCopy {
  publicReply: string;
  privateReply: string;
  variant: string;
}

export type SocialSellingStage =
  | 'opened'
  | 'diagnosing'
  | 'qualified'
  | 'hot'
  | 'handoff'
  | 'nurture'
  | 'disqualified';

export interface SocialSellingState {
  stage: SocialSellingStage;
  score: number;
  turns: number;
  useCase?: string;
  segment?: string;
  pain?: string;
  urgency?: string;
  budgetIntent?: string;
  authority?: string;
  lastIntent?: string;
  lastQuestion?: string;
  summary?: string;
  needsHuman?: boolean;
  updatedAt?: string;
}

export interface SocialSellingTurn {
  reply: string;
  state: SocialSellingState;
  shouldNotifyOwner: boolean;
  shouldEscalate: boolean;
  ownerSummary: string;
  sales: SalesSnapshot;
}

interface ResolveInput {
  postCaption?: string;
  commentText?: string;
}

export function resolveKnownMediaPromise(mediaId?: string): PostPromise | undefined {
  if (mediaId && isMusicCampaignMedia(mediaId)) {
    return musicBusinessPromise();
  }

  switch (mediaId) {
    case PROSPECTING_FLOW_MEDIA_ID:
      return prospectingAutomationPromise();
    case WEBSITE_PROMPT_MEDIA_ID:
      return websitePromptPromise();
    case '17876885349503055':
    case '18106260469955774':
      return voiceAiMapWorkshopPromise();
    case '18087682091104837':
      return whatsappElevenLabsWorkshopPromise();
    default:
      return undefined;
  }
}

export function normalizePostPromise(promise: PostPromise): PostPromise {
  switch (promise.kind) {
    case 'empresa_agentica_live':
      return resolvePostPromise({ postCaption: 'empresa agentica openclaw' });
    case 'whatsapp_elevenlabs_workshop':
      return whatsappElevenLabsWorkshopPromise();
    case 'voice_ai_map_workshop':
      return voiceAiMapWorkshopPromise();
    case 'website_prompt':
      return websitePromptPromise();
    case 'sites_whatsapp_workshop':
      return sitesWhatsappWorkshopPromise();
    case 'prospecting_automation':
      return prospectingAutomationPromise();
    default:
      return promise;
  }
}

export function resolvePostPromise(input: ResolveInput): PostPromise {
  const caption = stripHashtags(input.postCaption || '');
  const context = `${caption}\n${input.commentText || ''}`.toLowerCase();
  const comment = (input.commentText || '').toLowerCase();
  const cta = extractCaptionKeyword(caption);

  if (
    has(context, ['automacao de prospeccao', 'automação de prospecção', 'sistema trabalhando por mim'])
    && has(context, ['nicho', 'cidade', 'ticket medio', 'ticket médio', 'lovable'])
  ) {
    return prospectingAutomationPromise();
  }

  if (
    has(context, ['criando sites com chatgpt', 'criar sites com chatgpt', 'site com chatgpt'])
    && has(context, ['us$ 1.000', 'processo comercial', 'qual site podemos criar com ia', 'site que nao gera uma acao', 'site que não gera uma ação'])
  ) {
    return sitesWhatsappWorkshopPromise();
  }

  if (
    has(context, ['musica com ia', 'música com ia', 'jingle', 'caca cliente', 'caça cliente'])
    || cta === 'MUSICA'
  ) {
    return musicBusinessPromise();
  }

  if (
    has(context, ['empresa agentica', 'empresa agêntica', 'funcionario agentico', 'funcionário agêntico', 'openclaw', '2 noites'])
    || ['AGENTICA', 'EMPRESA', 'OPENCLAW'].includes(cta || '')
  ) {
    return {
      kind: 'diagnostic',
      label: 'diagnostico da operacao',
      publicReply: 'Te chamei na DM pra entender qual tarefa da tua empresa mais depende de voce hoje, sem te mandar uma oferta fora de contexto.',
      privateReply: [
        'boa. voce veio pelo conteudo de operacao com agentes de IA.',
        '',
        'antes de falar de ferramenta ou oferta, preciso entender o processo real.',
        '',
        diagnosticQuestion(),
      ].join('\n'),
    };
  }

  if (
    has(context, ['workshop', 'vagas limitadas', 'r$97', '97', 'ao vivo'])
    && has(context, ['whatsapp', 'elevenlabs', 'ligacao', 'ligação', 'chamada', 'voz'])
  ) {
    return whatsappElevenLabsWorkshopPromise();
  }

  if (
    has(context, ['aprenda a fazer uma ia que liga', 'mapa completo do fluxo', 'comente ligação', 'comente ligacao', 'digite mapa', 'comente mapa'])
    && has(context, ['whatsapp', 'elevenlabs', 'wavoip'])
  ) {
    return voiceAiMapWorkshopPromise();
  }

  const ctaPromise = cta ? operationalCtaPromise(cta) : undefined;
  if (ctaPromise) return ctaPromise;

  if (has(context, ['github', 'lovable'])) {
    return leadMagnetPromise(
      'github_flow',
      'fluxo Lovable + GitHub',
      'GITHUB',
      'um fluxo simples pra usar Lovable sem perder controle do codigo: repositorio, branches, pull request e deploy.',
      'voce quer usar isso pra projeto proprio, cliente ou produto interno?',
    );
  }

  if (has(context, ['sdr', 'wavoip', 'ligacao', 'ligação'])) {
    return leadMagnetPromise(
      'sdr_voice',
      'SDR que liga no WhatsApp',
      'SDR',
      'um mapa de SDR por voz: tipo de lead, Wavoip como telefone do WhatsApp, ElevenLabs pra voz, funcao de qualificacao e handoff humano.',
      'hoje teu atendimento perde mais lead por demora, falta de qualificacao ou falta de follow-up?',
    );
  }

  if (has(context, ['autismo', 'autista'])) {
    return leadMagnetPromise(
      'autism_support',
      'sistema de IA para autistas',
      'AUTISMO',
      'um sistema com traducao de mensagens confusas, mapa de rotina, frases de apoio, ensaio de conversas e explicacao clara de necessidades.',
      'isso seria pra uso pessoal, familiar, clinica/escola ou produto?',
    );
  }

  if (has(context, ['polishop', 'demosell'])) {
    return leadMagnetPromise(
      'demosell',
      'agente DemoSell OS da Polishop',
      'POLISHOP',
      'um agente de demonstracao: transforma produto em cena, quebra objecoes, cria jornada multicanal e monta loja-demonstracao digital.',
      'voce quer aplicar isso em produto fisico, infoproduto, ecommerce ou atendimento comercial?',
    );
  }

  if (has(context, ['madero'])) {
    return leadMagnetPromise(
      'standard_operation',
      'agente Operacao Padrao OS do Madero',
      'MADERO',
      'um agente de operacao padrao: produto campeao, receita como procedimento, cozinha central digital, reposicao, logistica e unidade medida como maquina.',
      'o teu gargalo hoje e padrao, estoque, treinamento, logistica ou unidade vendendo diferente?',
    );
  }

  if (has(context, ['tigre', 'anti-tigrinho'])) {
    return leadMagnetPromise(
      'anti_betting',
      'mapa da IA anti-Tigrinho',
      'TIGRE',
      'um mapa anti-Tigrinho com alerta antes do Pix, bloqueio de escalada, botao de emergencia e painel da verdade.',
      'voce quer isso como produto pessoal, ferramenta familiar, app ou campanha educativa?',
    );
  }

  if (has(context, ['repos', 'repositorio', 'repositório', 'tdah', 'adhd'])) {
    return leadMagnetPromise(
      'tdah_repos',
      'lista de repositorios para TDAH',
      'REPOS',
      'uma lista com repositorios pra montar sistema de execucao: produtividade, foco, assistente pessoal, task master e caminho operacional.',
      'voce quer usar essa lista pra vida pessoal, time, estudo ou produto?',
    );
  }

  if (has(context, ['wavoip', 'ligacao', 'ligação', 'chamada', 'telefone', 'elevenlabs', 'voz'])) {
    return {
      kind: 'voice_call_map',
      label: 'mapa Wavoip + ElevenLabs',
      publicReply: 'Te mandei na DM o mapa desse post. Me responde por la onde voce quer aplicar.',
      privateReply: [
        'boa. esse post era sobre IA atendendo ligacao com Wavoip + ElevenLabs.',
        '',
        'o mapa simples e:',
        '1. Wavoip recebe a chamada do WhatsApp.',
        '2. O bridge abre a sessao de voz com ElevenLabs.',
        '3. A IA atende, pergunta o contexto e registra o resumo.',
        '4. Voce recebe o lead, motivo da ligacao e proximo passo.',
        '',
        'pra eu te direcionar sem genericidade: seria pra atendimento, vendas, suporte ou agenda?',
      ].join('\n'),
    };
  }

  if (has(context, ['prompt']) || has(comment, ['manda', 'quero', 'eu quero']) && has(context, ['comenta'])) {
    return {
      kind: 'prompt',
      label: 'prompt prometido',
      publicReply: 'Te chamei na DM com o prompt. Me responde por la se voce quer transformar ideia solta em carrossel, roteiro ou oferta.',
      privateReply: [
        'fechado. esse e o prompt base do post:',
        '',
        'Vou te mandar uma ideia baguncada. Nao quero que voce escreva ainda. Quero que voce apenas entenda, organize e encontre a tese principal.',
        '',
        'Depois transforme essa tese em um carrossel de 10 slides com:',
        '1. gancho brutal',
        '2. crenca comum',
        '3. quebra da crenca',
        '4. explicacao do problema',
        '5. exemplo pratico',
        '6. metodo',
        '7. erro comum',
        '8. aplicacao',
        '9. sintese',
        '10. CTA',
        '',
        'Regra: cada slide deve ter uma ideia central, texto curto, linguagem direta e direcao visual clara.',
        '',
        'Agora me responde: voce quer usar isso pra conteudo, vendas, atendimento ou automacao interna?',
      ].join('\n'),
    };
  }

  if (has(context, ['ads', 'anuncio', 'anúncio', 'trafego', 'tráfego', 'campanha', 'criativo'])) {
    return {
      kind: 'ads',
      label: 'diagnostico de campanha',
      publicReply: 'Te chamei na DM pra entender tua campanha e te mandar um diagnostico rapido.',
      privateReply: [
        'vi teu comentario no post de campanha.',
        '',
        'pra eu te ajudar de verdade: hoje teu maior gargalo ta em criativo, oferta, segmentacao ou atendimento do lead?',
        '',
        'se voce me responder isso, eu te devolvo um diagnostico gratis com o primeiro ajuste que eu faria.',
      ].join('\n'),
    };
  }

  if (has(context, ['whatsapp', 'meta ai', 'atendimento', 'responder cliente', 'inbox', 'direct'])) {
    return {
      kind: 'whatsapp_ai',
      label: 'fluxo de atendimento com IA',
      publicReply: 'Te chamei na DM pra entender teu atendimento e te mandar um caminho pratico.',
      privateReply: [
        'vi teu comentario no post sobre atendimento/WhatsApp.',
        '',
        'pra nao te mandar resposta pronta: hoje voce quer automatizar entrada de lead, suporte, agendamento ou follow-up?',
        '',
        'me fala o cenario que eu te mando um diagnostico gratis do primeiro fluxo que montaria.',
      ].join('\n'),
    };
  }

  if (has(context, ['n8n', 'api', 'automacao', 'automação', 'agente', 'claude', 'cursor', 'lovable', 'sistema'])) {
    return {
      kind: 'automation',
      label: 'fluxo de automacao',
      publicReply: 'Te chamei na DM pra entender o fluxo e te mostrar um caminho mais direto.',
      privateReply: [
        'vi teu comentario no post de automacao.',
        '',
        'me diz o que voce quer ligar primeiro: WhatsApp, CRM, planilha, pagamento ou atendimento?',
        '',
        'com isso eu consigo te dar um diagnostico gratis do fluxo inicial.',
      ].join('\n'),
    };
  }

  return {
    kind: 'diagnostic',
    label: 'diagnostico gratis',
    publicReply: 'Te chamei na DM pra entender o teu caso por contexto, nao por chute. Me responde por la qual parte voce quer destravar.',
    privateReply: [
      'vi teu comentario e preferi te chamar por aqui pra entender melhor.',
      '',
      'pra eu nao te mandar resposta de prateleira: qual parte voce quer resolver agora?',
      '',
      '1. atendimento',
      '2. vendas',
      '3. conteudo',
      '4. automacao interna',
      '',
      'se fizer sentido, te mando um diagnostico gratis com o primeiro fluxo que eu montaria.',
    ].join('\n'),
  };
}

function leadMagnetPromise(kind: PromiseKind, label: string, keyword: string, delivery: string, question: string): PostPromise {
  return {
    kind,
    label,
    publicReply: `Te mandei na DM o material do post. Me responde por la onde voce quer aplicar. Palavra-chave: ${keyword}.`,
    privateReply: [
      `boa. voce veio pelo post do ${label}.`,
      '',
      `o material prometido e esse: ${delivery}`,
      '',
      question,
    ].join('\n'),
  };
}

const WEBSITE_PUBLIC_REPLY_VARIANTS = [
  'Te enviei o passo a passo no Direct 👀',
  'O caminho para criar seu site está no Direct.',
  'Te mostrei no Direct como começar com o @Sites.',
  'O tutorial prático chegou no seu Direct.',
] as const;

const WEBSITE_PRIVATE_REPLY_VARIANTS = [
  'Vi seu comentário 👀 Vou te mostrar no WhatsApp como criar um site profissional com o @Sites, mesmo sem saber programar.',
  'Vamos tirar o site da ideia. No WhatsApp eu te mostro como usar o @Sites e revisar o resultado antes de publicar.',
  'Você não precisa começar com um prompt gigante. No WhatsApp eu mostro o caminho para criar e melhorar seu site com o @Sites.',
  'Separei no WhatsApp um tutorial curto: abrir o @Sites, gerar a primeira versão e refinar até o site ficar profissional.',
] as const;

function websitePrivateReply(variantIndex: number): string {
  return WEBSITE_PRIVATE_REPLY_VARIANTS[variantIndex % WEBSITE_PRIVATE_REPLY_VARIANTS.length];
}

function stableVariantIndex(key: string, length: number): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % length;
}

export function resolveCommentCampaignCopy(
  promise: PostPromise,
  commentId: string,
): CampaignReplyCopy {
  if (promise.kind !== 'sites_whatsapp_workshop') {
    return {
      publicReply: promise.publicReply,
      privateReply: promise.privateReply,
      variant: 'default',
    };
  }

  const variantIndex = stableVariantIndex(commentId, WEBSITE_PUBLIC_REPLY_VARIANTS.length);
  return {
    publicReply: WEBSITE_PUBLIC_REPLY_VARIANTS[variantIndex],
    privateReply: websitePrivateReply(variantIndex),
    variant: `website-v${variantIndex + 1}`,
  };
}

export function websiteCampaignVariantCount(): number {
  return WEBSITE_PUBLIC_REPLY_VARIANTS.length;
}

/**
 * Onde o prompt anunciado como gratuito no Reel realmente mora.
 *
 * A raiz do domínio é a LP do Laboratório, com CTA da Biblioteca paga — mandar
 * alguém para lá cobra pelo que foi anunciado de graça. Já aconteceu: 22
 * pessoas clicaram num link "gratuito" que abria a página de R$ 19,90.
 *
 * Esta constante existe porque o endereço estava escrito em dois lugares e um
 * deles voltou a apontar para a raiz. Um endereço, um lugar.
 */
export const PROMPT_GRATUITO_URL = 'https://prompt.saraiva.ai/prompt-do-video';

function websitePromptPromise(): PostPromise {
  return {
    kind: 'website_prompt',
    label: 'prompt usado no vídeo para criar o site',
    publicReply: 'Te chamei no Direct para entregar o prompt 👀',
    privateReply: `Aqui está o prompt que usei no vídeo, liberado gratuitamente para copiar: ${PROMPT_GRATUITO_URL}`,
  };
}

function sitesWhatsappWorkshopPromise(): PostPromise {
  return {
    kind: 'sites_whatsapp_workshop',
    label: 'criação de sites com ChatGPT e @Sites',
    publicReply: WEBSITE_PUBLIC_REPLY_VARIANTS[0],
    privateReply: websitePrivateReply(0),
  };
}

function prospectingAutomationPromise(): PostPromise {
  return {
    kind: 'prospecting_automation',
    label: 'automacao de prospeccao por nicho, cidade e ticket',
    publicReply: 'Te enviei na DM. Toque em QUERO COPIAR.',
    privateReply: 'Quer copiar a automação que encontra empresas e prepara a abordagem enquanto você foca em vender? Toque em QUERO COPIAR.',
  };
}

function musicBusinessPromise(): PostPromise {
  return {
    kind: 'music_business',
    label: 'acesso à musicacom.ia e roteiro de jingles para negócios locais',
    publicReply: 'Te enviei no Direct o acesso à musicacom.ia e o roteiro Google Maps → jingle → abordagem. Confere o inbox.',
    privateReply: [
      'Aqui está o acesso para criar sua música ou jingle com IA:',
      'https://musicacom.ia.br/login/?mode=register&utm_source=instagram&utm_medium=organic_social&utm_campaign=reel_jingle_viral&utm_content=comment_musica',
      '',
      'Roteiro prático:',
      '1. escolha um nicho local no Google Maps;',
      '2. selecione uma empresa com informações públicas suficientes;',
      '3. crie um jingle demonstrativo personalizado;',
      '4. envie a amostra com uma abordagem honesta, sem fingir vínculo com a empresa;',
      '5. ofereça a versão final ou um pacote de campanhas.',
      '',
      'A ferramenta acelera a criação. O resultado financeiro depende da prospecção, da oferta e da venda — não existe faturamento garantido.',
      '',
      'Qual nicho você quer testar primeiro?',
    ].join('\n'),
  };
}

function whatsappElevenLabsWorkshopPromise(): PostPromise {
  return {
    kind: 'whatsapp_elevenlabs_workshop',
    label: 'Workshop Ligações com IA no WhatsApp',
    publicReply: 'Te mandei na DM os detalhes do workshop pra te direcionar sem confundir o passo a passo.',
    privateReply: [
      'boa. voce veio pelo post do Workshop Ligações com IA no WhatsApp.',
      '',
      'o foco e ligação dentro do WhatsApp com IA: o cliente liga, o agente atende por voz, entende o contexto e ajuda no atendimento ou na venda.',
      '',
      'pagamento unico: R$97.',
      'no workshop eu mostro como montar o fluxo e onde WhatsApp, Wavoip, ElevenLabs, contexto e passagem para humano entram.',
      '',
      'se quiser entrar, me responde aqui com o cenario que voce quer montar primeiro: atendimento, vendas, suporte ou agenda.',
    ].join('\n'),
  };
}

function voiceAiMapWorkshopPromise(): PostPromise {
  return {
    kind: 'voice_ai_map_workshop',
    label: 'Workshop Ligações com IA no WhatsApp',
    publicReply: 'Te mandei na DM o mapa da IA de ligacao pra voce ver o passo a passo certo.',
    privateReply: [
      'boa. voce comentou no post da IA de ligacao no WhatsApp.',
      '',
      'o mapa do fluxo e esse:',
      '1. o WhatsApp recebe a chamada.',
      '2. o Wavoip organiza a camada de ligacao.',
      '3. o ElevenLabs entra com a voz do agente.',
      '4. o bridge conecta a chamada com a IA e registra o contexto.',
      '5. no final, voce sabe quem chamou, o que queria e qual e o proximo passo.',
      '',
      'e importante: esse post nao era sobre um SDR generico. era sobre montar a IA de ligacao, passo a passo.',
      '',
      'no workshop eu ensino exatamente como fazer isso:',
      '- configurar a entrada da chamada',
      '- ligar WhatsApp/Wavoip com a camada de voz',
      '- conectar ElevenLabs',
      '- registrar contexto do atendimento',
      '- definir quando a IA responde e quando passa para humano',
      '',
      'o pagamento e unico: R$97.',
      '',
      'se quiser entrar no workshop, me responde aqui onde voce quer aplicar primeiro: atendimento, vendas, suporte ou agenda?',
    ].join('\n'),
  };
}

export function buildDirectContinuation(text: string, context?: PostPromise): string {
  return buildSocialSellingTurn(text, context).reply;
}

export function buildSocialSellingTurn(
  text: string,
  context?: PostPromise,
  previous?: SocialSellingState,
): SocialSellingTurn {
  const lower = text.toLowerCase();
  const promise = context ?? inferPromiseFromText(lower);
  const state = updateSocialSellingState(text, promise, previous);

  if (state.stage === 'disqualified') {
    const reply = [
      'entendi. vou parar por aqui e nao vou continuar a abordagem comercial.',
      '',
      'se quiser retomar no futuro, basta me escrever QUERO RETOMAR.',
    ].join('\n');
    return turn(reply, state, promise, text);
  }

  if (
    has(lower, ['entrei', 'comprei', 'paguei', 'pix pago', 'ja paguei', 'já paguei'])
  ) {
    return turn(paymentVerificationReply(), state, promise, text);
  }

  if (promise.kind === 'website_prompt') {
    const reply = [
      'o prompt gratuito mostrado no vídeo está liberado aqui:',
      PROMPT_GRATUITO_URL,
      '',
      'você pode abrir, copiar e usar sem pagar.',
    ].join('\n');
    return turn(reply, state, promise, text);
  }

  if (
    isVoiceAiWorkshopPromise(promise)
    && has(lower, ['link', 'comprar', 'pix', 'inscricao', 'inscrição', 'entrar', 'participar', 'quero entrar', 'vaga'])
  ) {
    return turn(workshopCheckoutReply(), state, promise, text);
  }

  if (state.stage === 'handoff' || state.stage === 'hot') {
    const reply = [
      'faz sentido.',
      '',
      handoffSummary(state, promise),
      '',
      'pra eu nao te responder no escuro: me manda em uma frase qual operacao voce quer destravar primeiro e eu te devolvo o primeiro fluxo.',
    ].join('\n');
    return turn(reply, state, promise, text);
  }

  if (has(lower, ['atendimento', 'suporte', 'agenda', 'agendamento', 'vendas', 'conteudo', 'conteúdo', 'automacao', 'automação'])) {
    const reply = [
      'boa. agora ficou mais claro.',
      '',
      nextQuestionFor(promise.kind, state),
    ].join('\n');
    return turn(reply, state, promise, text);
  }

  if (has(lower, ['sim', 'quero', 'manda', 'pode mandar', 'me manda', 'tenho interesse'])) {
    const reply = state.turns <= 1
      ? promise.privateReply
      : [
          'fechado.',
          '',
          nextQuestionFor(promise.kind, state),
        ].join('\n');
    return turn(reply, state, promise, text);
  }

  if (has(lower, ['preco', 'preço', 'valor', 'quanto custa', 'custa'])) {
    if (isVoiceAiWorkshopPromise(promise)) {
      const reply = [
        'o pagamento do Workshop Ligações com IA no WhatsApp e unico: R$97.',
        '',
        'o conteúdo mostra como conectar WhatsApp, Wavoip, ElevenLabs, contexto e passagem para humano.',
        '',
        'se quiser entrar agora, o checkout oficial e https://workshop.saraiva.ai/checkout',
      ].join('\n');
      return turn(reply, state, promise, text);
    }

    const reply = [
      'depende bastante do fluxo, mas antes de falar valor eu preciso entender o tamanho do problema.',
      '',
      nextQuestionFor(promise.kind, state),
    ].join('\n');
    return turn(reply, state, promise, text);
  }

  const reply = [
    context
      ? `entendi. voce veio pelo post de ${context.label}.`
      : 'entendi. so pra eu nao assumir errado de qual post voce veio:',
    '',
    nextQuestionFor(promise.kind, state),
  ].join('\n');
  return turn(reply, state, promise, text);
}

function nextQuestionFor(kind: PromiseKind, state?: SocialSellingState): string {
  if (kind === 'website_prompt') {
    if (!state?.useCase) {
      return 'voce prefere APOSTILA para aprender o passo a passo ou PRONTA para receber a automacao montada?';
    }
    if (!state.segment) {
      return state.useCase === 'aprender sites'
        ? 'qual nicho voce quer atender primeiro com esses sites?'
        : 'para qual tipo de negocio a automacao precisa criar sites primeiro?';
    }
    if (!state.pain) {
      return state.useCase === 'aprender sites'
        ? 'o que mais trava voce hoje: escolher a oferta, escrever a copy, montar o site ou conseguir clientes?'
        : 'o que voce quer que a automacao resolva: briefing, copy, design, codigo, publicacao ou o fluxo inteiro?';
    }
    if (!state.urgency) {
      return 'voce quer colocar isso para rodar agora ou ainda esta mapeando a ideia?';
    }
    return state.useCase === 'aprender sites'
      ? 'quer receber o acesso da apostila assim que a pagina de compra estiver confirmada?'
      : 'me diga quantos sites voce imagina produzir por mes para eu preparar o diagnostico da automacao pronta.';
  }

  if (!state?.useCase) {
    return DIAGNOSTIC_FORK_QUESTION;
  }
  if (!state.segment) {
    return `em que tipo de operacao voce quer aplicar isso: clinica, imobiliaria, agencia, ecommerce, curso, servico local ou outro?`;
  }
  if (!state.pain) {
    return PAIN_FORK_QUESTION;
  }
  if (!state.urgency) {
    return 'isso e algo pra resolver agora ou voce esta mapeando possibilidade?';
  }

  switch (kind) {
    case 'whatsapp_elevenlabs_workshop':
      return 'se quiser entrar na aula do workshop, me responde aqui qual fluxo voce quer montar primeiro: atendimento, vendas, suporte ou agenda.';
    case 'voice_ai_map_workshop':
      return 'se quiser montar isso ao vivo comigo no workshop, me responde aqui onde voce quer aplicar primeiro: atendimento, vendas, suporte ou agenda.';
    case 'voice_call_map':
      return 'isso seria pra atender lead, suporte, consulta/agendamento ou venda por telefone?';
    case 'github_flow':
      return 'voce quer organizar esse fluxo pra um produto seu, projeto de cliente ou time interno?';
    case 'sdr_voice':
      return 'no atendimento, voce quer que a IA primeiro qualifique lead, recupere follow-up, agende conversa ou transfira pro humano?';
    case 'autism_support':
      return 'isso seria pra rotina pessoal, familia, clinica/escola ou pra transformar em produto?';
    case 'demosell':
      return 'qual produto voce quer demonstrar melhor: produto fisico, infoproduto, ecommerce ou servico consultivo?';
    case 'standard_operation':
      return 'onde o padrao mais quebra hoje: treinamento, estoque, atendimento, entrega ou unidade operando diferente?';
    case 'anti_betting':
      return 'voce imagina isso como app pessoal, ferramenta familiar, campanha educativa ou produto com alertas financeiros?';
    case 'tdah_repos':
      return 'voce quer montar esse sistema pra vida pessoal, estudos, time de trabalho ou produto?';
    case 'prompt':
      return 'voce quer transformar uma ideia solta em carrossel, roteiro, oferta ou fluxo de atendimento?';
    case 'ads':
      return 'teu gargalo hoje ta em criativo, oferta, segmentacao ou atendimento do lead?';
    case 'whatsapp_ai':
      return 'no WhatsApp, o que mais pesa hoje: responder rapido, qualificar lead, agendar ou fazer follow-up?';
    case 'automation':
      return 'qual sistema voce quer conectar primeiro: WhatsApp, CRM, planilha, pagamento ou atendimento?';
    case 'empresa_agentica_live':
      return diagnosticQuestion();
    default:
      return DIAGNOSTIC_FORK_QUESTION;
  }
}

function updateSocialSellingState(
  text: string,
  promise: PostPromise,
  previous?: SocialSellingState,
): SocialSellingState {
  const lower = text.toLowerCase();
  const signal = extractSignals(lower, previous?.lastQuestion);
  const turns = (previous?.turns ?? 0) + 1;
  const next: SocialSellingState = {
    ...previous,
    stage: previous?.stage ?? 'opened',
    score: previous?.score ?? 10,
    turns,
    useCase: signal.useCase ?? previous?.useCase,
    segment: signal.segment ?? previous?.segment,
    pain: signal.pain ?? previous?.pain,
    urgency: signal.urgency ?? previous?.urgency,
    budgetIntent: signal.budgetIntent ?? previous?.budgetIntent,
    authority: signal.authority ?? previous?.authority,
    lastIntent: signal.intent,
    updatedAt: new Date().toISOString(),
  };

  next.score = scoreLead(next, signal);
  if (previous?.stage === 'disqualified' && signal.intent !== 'requalify') {
    next.score = 0;
    next.stage = 'disqualified';
  } else {
    next.stage = stageLead(next, signal);
  }
  next.needsHuman = next.stage === 'hot' || next.stage === 'handoff';
  next.lastQuestion = nextQuestionFor(promise.kind, next);
  next.summary = compactSummary(next, promise);
  return next;
}

function extractSignals(
  lower: string,
  lastQuestion?: string,
): Partial<SocialSellingState> & { intent: string } {
  const signal: Partial<SocialSellingState> & { intent: string } = { intent: 'reply' };

  if (hasOptOutIntent(lower)) {
    signal.intent = 'disqualify';
  } else if (has(lower, ['quero retomar', 'pode continuar', 'voltar a conversar', 'reativar conversa'])) {
    signal.intent = 'requalify';
  } else if (has(lower, ['falar com voce', 'falar com você', 'reuniao', 'reunião', 'call', 'consultoria', 'contratar', 'implementar pra mim'])) {
    signal.intent = 'handoff';
  } else if (has(lower, ['preco', 'preço', 'valor', 'quanto custa', 'orcamento', 'orçamento'])) {
    signal.intent = 'price';
    signal.budgetIntent = 'perguntou valor';
  } else if (has(lower, ['link', 'inscricao', 'inscrição', 'comprar', 'vaga', 'participar'])) {
    signal.intent = 'conversion';
  }

  if (
    has(lower, ['pronto', 'pronta', 'automacao pronta', 'automação pronta', 'feito pra mim', 'montada pra mim', 'quero pronto', 'quero pronta'])
  ) {
    signal.useCase = 'automacao pronta de sites';
    signal.intent = 'conversion';
  }
  if (
    !signal.useCase
    && has(lower, ['apostila', 'quero aprender', 'aprender a fazer', 'passo a passo', 'fazer eu mesmo'])
  ) {
    signal.useCase = 'aprender sites';
  }

  // A bifurcacao binaria responde useCase e pain no mesmo turno. Vem antes da
  // varredura generica porque 91,8% dos leads so mandam uma mensagem.
  const fork = matchDiagnosticFork(lower, { forkWasAsked: isForkQuestion(lastQuestion) });
  if (fork) {
    if (!signal.useCase) signal.useCase = fork.useCase;
    signal.pain = fork.pain;
    if (fork.urgency) signal.urgency = fork.urgency;
  }

  if (!signal.useCase && has(lower, ['atendimento', 'suporte', 'sac', 'responder cliente', 'cliente esperando'])) signal.useCase = 'atendimento';
  if (!signal.useCase && has(lower, ['vendas', 'lead', 'proposta', 'comercial', 'fechar cliente'])) signal.useCase = 'vendas';
  if (!signal.useCase && has(lower, ['follow-up', 'follow up', 'retorno', 'recuperar lead', 'lead esfria'])) signal.useCase = 'follow-up';
  if (!signal.useCase && has(lower, ['agenda', 'agendamento', 'marcar consulta', 'marcar reuniao', 'marcar reunião'])) signal.useCase = 'agenda';
  if (!signal.useCase && has(lower, ['conteudo', 'conteúdo', 'carrossel', 'roteiro', 'post'])) signal.useCase = 'conteudo';
  if (!signal.useCase && has(lower, ['automacao interna', 'automação interna', 'processo', 'operacao', 'operação', 'crm', 'planilha'])) signal.useCase = 'automacao interna';
  if (!signal.useCase && has(lower, ['financeiro', 'cobranca', 'cobrança'])) signal.useCase = 'financeiro';
  if (!signal.useCase && has(lower, ['organizacao', 'organização', 'interno', 'gestao', 'gestão'])) signal.useCase = 'organizacao interna';

  if (has(lower, ['clinica', 'clínica', 'dentista', 'medico', 'médico', 'saude', 'saúde'])) signal.segment = 'clinica/saude';
  if (has(lower, ['imobiliaria', 'imobiliária', 'corretor', 'imovel', 'imóvel'])) signal.segment = 'imobiliario';
  if (has(lower, ['agencia', 'agência', 'social media', 'trafego', 'tráfego'])) signal.segment = 'agencia';
  if (has(lower, ['ecommerce', 'loja', 'pedido', 'produto fisico', 'produto físico'])) signal.segment = 'ecommerce';
  if (has(lower, ['curso', 'mentoria', 'infoproduto', 'aluno', 'escola', 'faculdade'])) signal.segment = 'educacao';
  if (has(lower, ['restaurante', 'barbearia', 'advocacia', 'escritorio', 'escritório'])) signal.segment = 'servico local';

  // A dor lida pela bifurcacao tem prioridade: ela veio de uma pergunta direta,
  // nao de palavra solta no meio da frase.
  if (!signal.pain && has(lower, ['demora', 'lento', 'nao responde', 'não responde'])) signal.pain = 'demora na resposta';
  if (!signal.pain && has(lower, ['lead esfria', 'perco lead', 'perdendo lead', 'some'])) signal.pain = 'lead esfriando';
  if (!signal.pain && has(lower, ['repete contexto', 'sem contexto', 'historico', 'histórico'])) signal.pain = 'contexto perdido';
  if (!signal.pain && has(lower, ['follow', 'retorno', 'esquece', 'lembrar'])) signal.pain = 'follow-up fraco';
  if (!signal.pain && has(lower, ['time sobrecarregado', 'muita mensagem', 'demanda alta'])) signal.pain = 'time sobrecarregado';
  if (!signal.pain && has(lower, ['depende de mim', 'depende muito de mim', 'eu que faco', 'eu que faço', 'manual', 'repetitiva', 'repetitivo'])) signal.pain = 'dono dependente ou tarefa manual repetitiva';

  if (has(lower, ['urgente', 'agora', 'essa semana', 'hoje', 'pra ontem', 'perdendo dinheiro'])) signal.urgency = 'alta';
  if (has(lower, ['mes que vem', 'mês que vem', 'futuro', 'estudando', 'vendo possibilidade'])) signal.urgency = 'baixa';

  if (has(lower, ['minha empresa', 'meu negocio', 'meu negócio', 'sou dono', 'sou gestor', 'meus clientes', 'tenho uma'])) {
    signal.authority = 'decisor ou operador direto';
  }

  return signal;
}

function hasOptOutIntent(text: string): boolean {
  return [
    /(?:^|[^\p{L}\p{N}_])(?:pare|parar|stop|cancelar|cancele|remova|remover)(?:$|[^\p{L}\p{N}_])/u,
    /\b(?:nao|não)\s+(?:tenho\s+interesse|me\s+chame|me\s+mande|mande\s+mais|quero\s+(?:receber|isso|comprar|falar))\b/u,
    /\bsem\s+interesse\b/u,
    /\bpara\s+de\s+(?:me\s+)?(?:mandar|enviar|chamar|escrever)(?:\s+mensagens?)?\b/u,
    /\bquero\s+sair\s+(?:da|dessa)\s+lista\b/u,
    /(?:^|[^\p{L}\p{N}_])(?:nao|não)\s+quero(?:\s+mais)?(?:[.!?,\s]*)$/u,
  ].some((pattern) => pattern.test(text));
}

function scoreLead(state: SocialSellingState, signal: Partial<SocialSellingState> & { intent: string }): number {
  let score = 10;
  if (state.useCase) score += 15;
  if (state.segment) score += 10;
  if (state.pain) score += 15;
  if (state.urgency === 'alta') score += 15;
  if (state.urgency === 'baixa') score -= 5;
  if (state.authority) score += 10;
  if (state.budgetIntent) score += 10;
  if (signal.intent === 'handoff') score += 25;
  if (signal.intent === 'conversion') score += 15;
  if (signal.intent === 'disqualify') score = 0;
  return Math.max(0, Math.min(100, score));
}

function stageLead(state: SocialSellingState, signal: Partial<SocialSellingState> & { intent: string }): SocialSellingStage {
  if (signal.intent === 'disqualify') return 'disqualified';
  if (signal.intent === 'handoff') return 'handoff';
  if (state.score >= 75) return 'hot';
  if (state.score >= 50) return 'qualified';
  if (state.turns > 3 && state.score < 35) return 'nurture';
  if (state.turns > 0) return 'diagnosing';
  return 'opened';
}

function handoffSummary(state: SocialSellingState, promise: PostPromise): string {
  const parts = [
    `post: ${promise.label}`,
    state.useCase ? `aplicacao: ${state.useCase}` : undefined,
    state.segment ? `segmento: ${state.segment}` : undefined,
    state.pain ? `gargalo: ${state.pain}` : undefined,
  ].filter(Boolean);
  return `pelo que voce falou, o caminho e ${parts.join(' | ')}.`;
}

function compactSummary(state: SocialSellingState, promise: PostPromise): string {
  return [
    `post=${promise.label}`,
    `stage=${state.stage}`,
    `score=${state.score}`,
    state.useCase ? `useCase=${state.useCase}` : undefined,
    state.segment ? `segment=${state.segment}` : undefined,
    state.pain ? `pain=${state.pain}` : undefined,
    state.urgency ? `urgency=${state.urgency}` : undefined,
  ].filter(Boolean).join('; ');
}

function turn(
  reply: string,
  state: SocialSellingState,
  promise: PostPromise,
  inbound: string,
): SocialSellingTurn {
  const sales = buildSalesSnapshot(state, promise, inbound);
  const shouldEscalate = state.stage === 'hot' || state.stage === 'handoff';
  const shouldNotifyOwner = state.stage !== 'disqualified' && (shouldEscalate || state.turns >= 2);
  const nextAction = shouldEscalate
    ? 'assumir a conversa ou mandar diagnostico personalizado'
    : state.lastQuestion || nextQuestionFor(promise.kind, state);
  return {
    reply,
    state,
    shouldNotifyOwner,
    shouldEscalate,
    ownerSummary: [
      `Post: ${promise.label}`,
      `Etapa: ${state.stage}`,
      `Score: ${state.score}`,
      state.useCase ? `Aplicacao: ${state.useCase}` : undefined,
      state.segment ? `Segmento: ${state.segment}` : undefined,
      state.pain ? `Gargalo: ${state.pain}` : undefined,
      state.urgency ? `Urgencia: ${state.urgency}` : undefined,
      state.authority ? `Autoridade: ${state.authority}` : undefined,
      `Oferta: ${sales.offerLabel}`,
      `Temperatura: ${sales.temperature}`,
      `ICP: ${sales.icpFit}`,
      `Mensagem: ${inbound}`,
      `Proxima acao: ${sales.nextAction || nextAction}`,
      '',
      'Nota CRM:',
      sales.crmNote,
    ].filter(Boolean).join('\n'),
    sales,
  };
}

function inferPromiseFromText(text: string): PostPromise {
  return resolvePostPromise({ commentText: text });
}

function has(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function stripHashtags(text: string): string {
  return text.replace(/#[\p{L}\p{N}_]+/gu, '');
}

function extractCaptionKeyword(text: string): string | undefined {
  const match = text.match(/\b(?:comente|digite|mande|me mande)\s+`?([A-ZÀ-Ú0-9_-]{3,24})`?/i);
  return match?.[1]?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function operationalCtaPromise(keyword: string): PostPromise | undefined {
  if (['PROMPT', 'WHATSAPP', 'SDR', 'GITHUB', 'LIGACAO', 'LIGAÇÃO', 'VOZ', 'WORKSHOP', 'AULA'].includes(keyword)) {
    return undefined;
  }

  return {
    kind: 'diagnostic',
    label: `mapa operacional: ${keyword}`,
    publicReply: `Te mandei na DM o material desse post. Palavra-chave: ${keyword}.`,
    privateReply: [
      `boa. voce comentou ${keyword} no post.`,
      '',
      'o mapa operacional por tras dele e esse:',
      '1. identificar o sintoma visivel.',
      '2. achar onde o contexto esta se perdendo.',
      '3. separar o que e ferramenta do que e comportamento.',
      '4. transformar a conversa em proxima acao.',
      '5. criar continuidade para o cliente nao ficar sozinho.',
      '',
      'pra eu adaptar isso ao teu caso: hoje voce quer aplicar em atendimento, vendas, follow-up ou gestao interna?',
    ].join('\n'),
  };
}
