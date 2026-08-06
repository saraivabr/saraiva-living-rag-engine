export const DEFAULT_TIMEOUT_MS = 8_000;
export const DEFAULT_MAX_TOKENS = 180;
export const DEFAULT_MAX_CHARS = 320;
export const EMERGENCY_FALLBACK = 'Pra eu entender o teu caso: qual parte das suas vendas voce quer melhorar primeiro?';

const promptLeakagePatterns = [
  /(?:system|developer)\s+(?:prompt|message)/iu,
  /(?:prompt|mensagem|instru(?:cao|ção|coes|ções))\s+(?:do sistema|de sistema|intern[ao]s?|ocult[ao]s?|do desenvolvedor)/iu,
  /(?:ignore|ignora|desconsidere|esqueca|esqueça|forget)\b.{0,80}\b(?:prompt|mensagem|instru(?:cao|ção|coes|ções)|regras?)/iu,
  /(?:revele|revela|mostre|mostra|repita|copie|imprima|vaze|exponha)\b.{0,80}\b(?:prompt|mensagem|instru(?:cao|ção|coes|ções)|regras?)/iu,
  /<\/?(?:system|developer|assistant)(?:\s[^>]*)?>/iu,
  /\b(?:chain[ -]of[ -]thought|raciocinio interno|raciocínio interno)\b/iu,
] as const;

const placeholderPattern = /@\s*(?:\[\s*)?(?:user(?:name)?|usuario|usuário|nome|handle)(?:\s*\])?/iu;
const portugueseMarkers = new Set([
  'voce', 'seu', 'sua', 'pra', 'para', 'qual', 'como', 'hoje', 'entendi', 'faz',
  'quer', 'precisa', 'venda', 'vendas', 'atendimento', 'empresa', 'negocio',
  'cliente', 'clientes', 'processo', 'agora', 'onde', 'primeiro', 'isso', 'seria',
  'posso', 'pode', 'vamos', 'contexto', 'ajudar', 'melhorar', 'aplicar', 'sentido',
]);
const urlPattern = /(?:https?:\/\/|www\.)[^\s<>()]+/giu;
const linkWordPattern = /\b(?:link|url)\b/iu;
const pricePattern = /(?:R\$|US\$|USD|BRL|\$)\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*(?:reais?|dolares?|dólares?)/giu;
const percentagePattern = /\b\d+(?:[.,]\d+)?\s*%/giu;
const durationPattern = /\b\d+\s*(?:horas?|dias?|semanas?|meses?|anos?)\b/giu;
const commercialClaimPatterns = [
  /\b(?:desconto|off|economize|promocao|promoção)\b/giu,
  /\b(?:garantia|garantido|garantida|garantidos|garantidas|sem risco)\b/giu,
  /\bresultados?\s+(?:garantido|garantida|garantidos|garantidas)\b/giu,
] as const;

/** Estado permitido para os dois provedores; qualquer campo fora desta lista e descartado. */
const ALLOWED_STATE_KEYS = [
  'stage', 'score', 'turns', 'useCase', 'segment', 'pain', 'urgency',
  'budgetIntent', 'authority', 'lastIntent', 'lastQuestion', 'summary', 'needsHuman',
] as const;

export interface SalesPromiseContext {
  kind?: string;
  label: string;
  /** Somente fatos comerciais confiaveis, vindos do post/oferta versionada. */
  trustedContext: string;
}

export interface SalesReplyInput {
  message: string;
  promise: SalesPromiseContext;
  /** Estado calculado pelo fluxo deterministico. Nunca e tratado como instrucao. */
  state?: unknown;
  summary?: string;
  /** Resposta produzida pelo buildSocialSellingTurn; usada sem depender do modelo. */
  fallbackReply: string;
  /** Fatos adicionais versionados, nunca extraidos da mensagem do seguidor. */
  allowedPrices?: string[];
  allowedLinks?: string[];
}

export type SalesReplyValidationIssue =
  | 'empty'
  | 'too_long'
  | 'not_portuguese'
  | 'question_count'
  | 'prompt_leakage'
  | 'placeholder'
  | 'markdown'
  | 'invented_price'
  | 'invented_link'
  | 'invented_claim';

export interface PromptLeakageDetection {
  detected: boolean;
  signals: string[];
}

interface ReplyValidationContext {
  maxChars: number;
  trustedContext: string;
  allowedPrices: string[];
  allowedLinks: string[];
}

export class SalesResponderTimeoutError extends Error {}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SalesResponderTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function parseStrictReplyJson(raw: string): string {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.reply !== 'string') throw new Error('invalid schema');
  return record.reply;
}

/** Detector reutilizavel tanto na entrada quanto na saida do modelo. */
export function detectPromptLeakage(text: string): PromptLeakageDetection {
  const signals = promptLeakagePatterns
    .map((pattern, index) => (pattern.test(text) ? `pattern_${index + 1}` : undefined))
    .filter((signal): signal is string => Boolean(signal));
  return { detected: signals.length > 0, signals };
}

export function validateGeneratedSalesReply(
  reply: string,
  context: Partial<ReplyValidationContext> = {},
): { ok: true } | { ok: false; issue: SalesReplyValidationIssue } {
  const text = reply.trim();
  if (!text) return { ok: false, issue: 'empty' };
  if (text.length > (context.maxChars ?? DEFAULT_MAX_CHARS)) return { ok: false, issue: 'too_long' };
  if ((text.match(/\?/g) || []).length !== 1) return { ok: false, issue: 'question_count' };
  if (detectPromptLeakage(text).detected) return { ok: false, issue: 'prompt_leakage' };
  if (placeholderPattern.test(text)) return { ok: false, issue: 'placeholder' };
  if (/```|^\s*[-*]\s+/mu.test(text)) return { ok: false, issue: 'markdown' };
  if (!looksLikePortuguese(text)) return { ok: false, issue: 'not_portuguese' };

  const trustedContext = context.trustedContext ?? '';
  const allowedPrices = extractPrices([
    trustedContext,
    ...(context.allowedPrices ?? []),
  ].join('\n'));
  const replyPrices = extractPrices(text);
  if (replyPrices.some((price) => !allowedPrices.includes(price))) {
    return { ok: false, issue: 'invented_price' };
  }

  const trustedLinks = extractLinks([
    trustedContext,
    ...(context.allowedLinks ?? []),
  ].join('\n'));
  const replyLinks = extractLinks(text);
  if (replyLinks.some((link) => !trustedLinks.includes(link))) {
    return { ok: false, issue: 'invented_link' };
  }
  if (linkWordPattern.test(text) && !linkWordPattern.test(trustedContext) && trustedLinks.length === 0) {
    return { ok: false, issue: 'invented_link' };
  }

  const trustedClaims = extractCommercialClaims(trustedContext);
  const replyClaims = extractCommercialClaims(text);
  if (replyClaims.some((claim) => !trustedClaims.includes(claim))) {
    return { ok: false, issue: 'invented_claim' };
  }

  return { ok: true };
}

/** Texto usado quando o próprio fallback determinístico não é seguro para reenviar como está. */
export function safeFallback(value: string): string {
  const text = value.trim();
  if (!text || placeholderPattern.test(text) || detectPromptLeakage(text).detected) {
    return EMERGENCY_FALLBACK;
  }
  return text;
}

export function sanitizeState(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const sanitized: Record<string, string | number | boolean> = {};
  for (const key of ALLOWED_STATE_KEYS) {
    const item = source[key];
    if (typeof item === 'string') sanitized[key] = truncate(item, 800);
    if (typeof item === 'number' || typeof item === 'boolean') sanitized[key] = item;
  }
  return sanitized;
}

/** Corpo comum enviado a qualquer provedor: mensagem, oferta confiável e estado da conversa. */
export function buildSalesPayload(input: SalesReplyInput): Record<string, unknown> {
  return {
    inbound_message: truncate(input.message, 2_000),
    trusted_offer: {
      kind: truncate(input.promise.kind || '', 80),
      label: truncate(input.promise.label, 200),
      context: truncate(input.promise.trustedContext, 5_000),
      allowed_prices: (input.allowedPrices ?? []).map((item) => truncate(item, 120)).slice(0, 10),
      allowed_links: (input.allowedLinks ?? []).map((item) => truncate(item, 500)).slice(0, 10),
    },
    conversation: {
      state: sanitizeState(input.state),
      summary: truncate(input.summary || '', 1_500),
    },
  };
}

function extractPrices(text: string): string[] {
  return unique((text.match(pricePattern) ?? []).map(normalizePrice));
}

function looksLikePortuguese(text: string): boolean {
  const normalized = normalizeText(text);
  const tokens = normalized.match(/[a-z]+/g) ?? [];
  const matches = new Set(tokens.filter((token) => portugueseMarkers.has(token)));
  return matches.size >= 2;
}

function extractCommercialClaims(text: string): string[] {
  const claims = [
    ...(text.match(percentagePattern) ?? []),
    ...(text.match(durationPattern) ?? []),
    ...commercialClaimPatterns.flatMap((pattern) => text.match(pattern) ?? []),
  ];
  return unique(claims.map(normalizeText));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePrice(value: string): string {
  const lower = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const amount = lower.match(/\d+(?:[.,]\d{1,2})?/)?.[0].replace(',', '.') ?? '';
  const currency = /r\$|brl|reais?/.test(lower) ? 'brl' : 'usd';
  return `${currency}:${amount}`;
}

function extractLinks(text: string): string[] {
  return unique((text.match(urlPattern) ?? []).map((link) => link.replace(/[.,;:!?]+$/, '').toLowerCase()));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function truncate(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export function nonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() || '';
}

export function envInt(name: string): number | undefined {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : undefined;
}

export function envFloat(name: string): number | undefined {
  const value = Number.parseFloat(process.env[name] || '');
  return Number.isFinite(value) ? value : undefined;
}

export function boundedInt(value: number | undefined, fallbackValue: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallbackValue;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

export function boundedFloat(value: number | undefined, fallbackValue: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallbackValue;
  return Math.min(max, Math.max(min, value as number));
}
