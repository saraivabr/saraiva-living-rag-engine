/**
 * Politica de conteudo derivada da auditoria de 121 posts (06/08/2026).
 *
 * Os numeros que geraram cada regra:
 * - Reels ate 45s retiveram 30,4% da audiencia; acima de 45s, 13,7% — com
 *   alcance mediano praticamente igual (330 vs 353). Passar de 45s custa
 *   metade da retencao sem comprar alcance nenhum.
 * - A curva de seguidores online (29 dias) tem pico entre 14h e 16h
 *   (~4.100/hora) e cai para ~838 as 23h. Postar fora da janela e falar
 *   para um quinto da casa.
 * - Os 42 posts de FEED tiveram alcance mediano de 144 (0,23% da base)
 *   contra 435 dos Reels.
 * - 312 hashtags distintas em 121 posts: dispersao total, zero territorio.
 * - 66 posts sairam sem nenhum CTA.
 */

export const CONTENT_POLICY = Object.freeze({
  /** Comando 4: todo Reel com no maximo 45 segundos. */
  maxReelSeconds: 45,
  /** Comando 5: janela unica de publicacao, horario de Sao Paulo. */
  postingWindow: Object.freeze({ startHour: 14, endHour: 16 }),
  timeZone: 'America/Sao_Paulo',
  /** Formatos liberados enquanto o FEED estatico estiver suspenso. */
  allowedMediaProductTypes: Object.freeze(['REELS'] as const),
  /** Teto de hashtags por post, para concentrar territorio. */
  maxHashtags: 5,
});

export type PolicyRule =
  | 'reel_duration'
  | 'posting_window'
  | 'media_format'
  | 'hashtag_spread'
  | 'missing_cta';

export type PolicySeverity = 'block' | 'warn';

export interface PolicyViolation {
  rule: PolicyRule;
  severity: PolicySeverity;
  detail: string;
}

export interface ContentPolicyInput {
  /** REELS, FEED, STORY... conforme media_product_type da Graph API. */
  mediaProductType?: string;
  /** Duracao do video em segundos. Ausente = regra nao avaliada. */
  durationSeconds?: number;
  /** Instante de publicacao (ISO). Ausente = regra nao avaliada. */
  publishAt?: string;
  caption?: string;
  hashtags?: readonly string[];
}

export interface ContentPolicyResult {
  ok: boolean;
  violations: PolicyViolation[];
  /** Regras que nao puderam ser avaliadas por falta de dado. */
  unchecked: PolicyRule[];
}

const CTA_PATTERNS: readonly RegExp[] = [
  /\bcomenta\b/iu,
  /\bcomente\b/iu,
  /link na bio/iu,
  /\bdm\b/iu,
  /\bdirect\b/iu,
  /me chama/iu,
  /\bsalva\b/iu,
];

export function evaluateContentPolicy(input: ContentPolicyInput): ContentPolicyResult {
  const violations: PolicyViolation[] = [];
  const unchecked: PolicyRule[] = [];

  const format = input.mediaProductType?.toUpperCase();
  if (!format) {
    unchecked.push('media_format');
  } else if (!CONTENT_POLICY.allowedMediaProductTypes.includes(format as 'REELS')) {
    violations.push({
      rule: 'media_format',
      severity: 'block',
      detail: `formato ${format} suspenso: FEED estatico entregou alcance mediano de 144 contra 435 do Reel`,
    });
  }

  if (typeof input.durationSeconds !== 'number' || !Number.isFinite(input.durationSeconds)) {
    unchecked.push('reel_duration');
  } else if (input.durationSeconds > CONTENT_POLICY.maxReelSeconds) {
    violations.push({
      rule: 'reel_duration',
      severity: 'block',
      detail: `${Math.round(input.durationSeconds)}s excede o teto de ${CONTENT_POLICY.maxReelSeconds}s (retencao cai de 30,4% para 13,7%)`,
    });
  }

  const hour = localHour(input.publishAt);
  if (hour === undefined) {
    unchecked.push('posting_window');
  } else if (!isInsidePostingWindow(hour)) {
    violations.push({
      rule: 'posting_window',
      severity: 'block',
      detail: `${String(hour).padStart(2, '0')}h esta fora da janela ${CONTENT_POLICY.postingWindow.startHour}h-${CONTENT_POLICY.postingWindow.endHour}h (${CONTENT_POLICY.timeZone})`,
    });
  }

  const hashtags = resolveHashtags(input);
  if (hashtags.length > CONTENT_POLICY.maxHashtags) {
    violations.push({
      rule: 'hashtag_spread',
      severity: 'warn',
      detail: `${hashtags.length} hashtags: teto e ${CONTENT_POLICY.maxHashtags} para concentrar territorio`,
    });
  }

  const caption = input.caption ?? '';
  if (!caption.trim()) {
    unchecked.push('missing_cta');
  } else if (!CTA_PATTERNS.some((pattern) => pattern.test(caption))) {
    violations.push({
      rule: 'missing_cta',
      severity: 'warn',
      detail: 'legenda sem CTA: 66 dos 121 posts auditados sairam assim',
    });
  }

  return {
    ok: violations.every((violation) => violation.severity !== 'block'),
    violations,
    unchecked,
  };
}

export function isInsidePostingWindow(hour: number): boolean {
  const { startHour, endHour } = CONTENT_POLICY.postingWindow;
  return hour >= startHour && hour <= endHour;
}

/** Horas da janela, uteis para montar slots de fila. */
export function postingWindowHours(): number[] {
  const { startHour, endHour } = CONTENT_POLICY.postingWindow;
  const hours: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) hours.push(hour);
  return hours;
}

function localHour(value?: string): number | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: CONTENT_POLICY.timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  const hour = Number.parseInt(formatted, 10);
  return Number.isFinite(hour) ? hour % 24 : undefined;
}

function resolveHashtags(input: ContentPolicyInput): string[] {
  if (input.hashtags?.length) return [...input.hashtags];
  return [...(input.caption ?? '').matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]);
}
