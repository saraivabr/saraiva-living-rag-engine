import 'dotenv/config';

/**
 * Carrega e valida as variáveis de ambiente uma única vez.
 * Falha rápido com mensagens claras se algo essencial estiver faltando.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. ` +
        `Copie .env.example para .env e preencha os valores.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function asInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asList(name: string, fallback: string): string[] {
  return optional(name, fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  ig: {
    accessToken: required('IG_ACCESS_TOKEN'),
    userId: optional('IG_USER_ID', ''),
    pageId: optional('IG_PAGE_ID', ''),
    appSecret: optional('IG_APP_SECRET', ''),
    apiVersion: optional('GRAPH_API_VERSION', 'v21.0'),
  },
  ai: {
    // 'cli' usa o Claude Code CLI (sua assinatura, sem custo de API).
    // 'api' usa o Anthropic SDK com ANTHROPIC_API_KEY.
    // Default: 'cli' se não houver API key, senão 'api'.
    backend: (() => {
      const backend = optional('AI_BACKEND', process.env.ANTHROPIC_API_KEY ? 'api' : 'cli').toLowerCase();
      if (backend === 'api' || backend === 'fallback') return backend;
      return 'cli';
    })() as 'cli' | 'api' | 'fallback',
    apiKey: optional('ANTHROPIC_API_KEY', ''),
    model: optional('AI_MODEL', 'claude-sonnet-4-6'),
    brandVoice: optional(
      'BRAND_VOICE',
      'Você é o atendimento da marca no Instagram. Responda em português do Brasil, simpático e breve.',
    ),
  },
  behavior: {
    mediaLimit: asInt('MEDIA_LIMIT', 10),
    priorityMediaIds: asList('PRIORITY_MEDIA_IDS', ''),
    disabledMediaIds: asList('DISABLED_MEDIA_IDS', ''),
    disabledShortcodes: asList('DISABLED_SHORTCODES', ''),
    disabledPermalinks: asList('DISABLED_PERMALINKS', ''),
    commentCampaignMediaIds: asList('COMMENT_CAMPAIGN_MEDIA_IDS', ''),
    maxCommentsPerCycle: asInt('MAX_COMMENTS_PER_CYCLE', 15),
    pollIntervalSeconds: asInt('POLL_INTERVAL_SECONDS', 120),
    replyDelayMs: asInt('REPLY_DELAY_MS', 4000),
    dryRun: optional('DRY_RUN', 'true').toLowerCase() === 'true',
    publicReply: optional(
      'PUBLIC_REPLY',
      'Te mandei na DM com o mapa pra ligar Wavoip + ElevenLabs. Depois me responde por la onde voce quer aplicar.',
    ),
    diagnosticPublicReply: optional(
      'DIAGNOSTIC_PUBLIC_REPLY',
      'Te chamei na DM pra entender teu caso e te mandar um diagnostico gratis.',
    ),
    privateReply: optional(
      'PRIVATE_REPLY',
      [
        'Fechado. Aqui esta o mapa rapido pra IA atender ligacao no WhatsApp:',
        '',
        '1. Wavoip recebe a chamada do WhatsApp e dispara o evento.',
        '2. Seu bridge abre uma sessao de voz com ElevenLabs.',
        '3. A IA atende com contexto, faz perguntas e registra o resumo.',
        '4. No fim, voce recebe lead, motivo da chamada e proximo passo.',
        '',
        'Me responde LIGAR + teu caso (ex: clinica, curso, agencia) que eu te digo o primeiro fluxo que montaria.',
      ].join('\n'),
    ),
    diagnosticPrivateReply: optional(
      'DIAGNOSTIC_PRIVATE_REPLY',
      [
        'vi teu comentario no post e preferi te chamar por aqui pra nao te responder de forma generica.',
        '',
        'me diz uma coisa: hoje voce quer ajuda mais com atendimento, vendas, conteudo ou automacao interna?',
        '',
        'se fizer sentido, eu te mando um diagnostico gratis com o primeiro fluxo de IA que eu montaria no teu caso.',
      ].join('\n'),
    ),
    triggerWords: optional(
      'TRIGGER_WORDS',
      'mapa,ligacao,ligação,wavoip,elevenlabs,voz,chamada,telefone,ia liga,ligar,workshop,aula,vaga,vagas,inscricao,inscrição,entrar,participar,comprar',
    )
      .split(',')
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
    // Polling legado. Pode ficar desligado enquanto o webhook em tempo real segue ativo.
    enabled: optional('RESPONDER_ENABLED', 'false').toLowerCase() === 'true',
    webhookEnabled: optional(
      'WEBHOOK_RESPONDER_ENABLED',
      optional('RESPONDER_ENABLED', 'false'),
    ).toLowerCase() === 'true',
    dmWebhookEnabled: optional(
      'WEBHOOK_DM_ENABLED',
      optional('WEBHOOK_RESPONDER_ENABLED', optional('RESPONDER_ENABLED', 'false')),
    ).toLowerCase() === 'true',
    commentWebhookEnabled: optional(
      'WEBHOOK_COMMENT_ENABLED',
      optional('WEBHOOK_RESPONDER_ENABLED', optional('RESPONDER_ENABLED', 'false')),
    ).toLowerCase() === 'true',
    standbyMessagingEnabled: optional('WEBHOOK_STANDBY_ENABLED', 'false').toLowerCase() === 'true',
    chatraceEnabled: optional('CHATRACE_RESPONDER_ENABLED', 'false').toLowerCase() === 'true',
  },
} as const;

export type Config = typeof config;
