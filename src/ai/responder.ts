import { config } from '../config.js';
import { runClaudeCli } from './claudeCli.js';

/**
 * Decide, via Claude, como reagir a um comentário.
 * A IA pode escolher RESPONDER ou PULAR (ex: spam, ofensa, nada a dizer),
 * dando uma camada de moderação automática.
 *
 * Backend configurável (AI_BACKEND): 'cli' usa o Claude Code CLI (assinatura),
 * 'api' usa o Anthropic SDK com ANTHROPIC_API_KEY.
 */

/** Chama o modelo conforme o backend e devolve o texto bruto da resposta. */
async function askModel(systemPrompt: string, userPrompt: string): Promise<string> {
  if (config.ai.backend === 'fallback') {
    throw new Error('AI_BACKEND=fallback');
  }

  if (config.ai.backend === 'cli') {
    return runClaudeCli(systemPrompt, userPrompt);
  }

  // Import dinâmico: só carrega o SDK quando o backend é 'api'.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.ai.apiKey });
  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
}

export interface CommentContext {
  commentText: string;
  username?: string;
  postCaption?: string;
}

export interface AiDecision {
  action: 'reply' | 'skip';
  message: string;
  reason: string;
}

const SYSTEM = `${config.ai.brandVoice}

Você recebe um comentário feito em um post do Instagram da marca e deve decidir como reagir.

Regras:
- Responda apenas quando agregar valor (dúvida, elogio, interesse de compra, pedido de info).
- PULE (não responda) se for: spam, propaganda de terceiros, ofensa grave, ou texto sem sentido.
- Respostas devem ser curtas (1-2 frases), calorosas e na voz da marca.
- Nunca invente informações que você não tem (preços, prazos, estoque). Se faltar dado, peça pra pessoa chamar no Direct.
- Não use hashtags em comentários. No máximo 1 emoji.
- Evite resposta genérica tipo "boa" sem contexto. Sempre conecte com a dor, promessa ou palavra-chave do post.

Responda SEMPRE em JSON puro, sem markdown, no formato exato:
{"action":"reply"|"skip","message":"texto da resposta (vazio se skip)","reason":"motivo curto da decisão"}`;

function buildUserPrompt(ctx: CommentContext): string {
  const parts = [
    ctx.postCaption ? `Legenda do post: """${ctx.postCaption.slice(0, 500)}"""` : null,
    `Comentário de @${ctx.username ?? 'usuario'}: """${ctx.commentText}"""`,
  ].filter(Boolean);
  return parts.join('\n\n');
}

function fallbackDecision(ctx: CommentContext, reason: string): AiDecision {
  const text = ctx.commentText.trim();
  const lower = text.toLowerCase();
  const looksUnsafe =
    /https?:\/\//i.test(text)
    || /\b(follow|promo|bitcoin|crypto|forex|investimento garantido)\b/i.test(text)
    || /\b(merda|porra|golpe|lixo|idiota)\b/i.test(text);

  if (!text || looksUnsafe) {
    return { action: 'skip', message: '', reason: `fallback: ${reason}` };
  }

  if (
    lower.includes('preco')
    || lower.includes('preço')
    || lower.includes('valor')
    || lower.includes('como')
    || lower.includes('quero')
    || lower.includes('ligacao')
    || lower.includes('ligação')
    || lower.includes('direct')
    || lower.length <= 40
  ) {
    if (lower.includes('prompt')) {
      return {
        action: 'reply',
        message: 'Te mandei no direct o prompt do post e uma pergunta pra adaptar pro teu caso.',
        reason: `fallback: ${reason}`,
      };
    }

    return {
      action: 'reply',
      message: 'Te chamei no direct pra entender teu contexto e te mostrar o primeiro passo mais simples.',
      reason: `fallback: ${reason}`,
    };
  }

  return {
    action: 'reply',
    message: 'Esse e o ponto: a ideia so melhora quando ganha tese, estrutura e direcao visual.',
    reason: `fallback: ${reason}`,
  };
}

function safeParse(raw: string): AiDecision {
  // Remove cercas de markdown se a IA escorregar e mandar ```json
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<AiDecision>;

  const action = parsed.action === 'reply' ? 'reply' : 'skip';
  return {
    action,
    message: typeof parsed.message === 'string' ? parsed.message.trim() : '',
    reason: typeof parsed.reason === 'string' ? parsed.reason : 'sem motivo informado',
  };
}

export async function decideReply(ctx: CommentContext): Promise<AiDecision> {
  let raw = '';

  try {
    raw = await askModel(SYSTEM, buildUserPrompt(ctx));
  } catch (err) {
    return fallbackDecision(ctx, (err as Error).message.slice(0, 120));
  }

  try {
    const decision = safeParse(raw);
    // Coerência: se mandou responder mas a mensagem veio vazia, vira skip.
    if (decision.action === 'reply' && !decision.message) {
      return { action: 'skip', message: '', reason: 'resposta vazia gerada' };
    }
    return decision;
  } catch {
    return { action: 'skip', message: '', reason: `falha ao interpretar IA: ${raw.slice(0, 80)}` };
  }
}
