/**
 * Scorer de gancho calibrado na auditoria de 121 posts de @saraiva.ai (06/08/2026).
 *
 * Comparando os 12 posts de maior alcance com os 12 de menor, a diferenca nao
 * estava no tema — estava na forma da primeira linha:
 *
 *   traco                TOP12   PIOR12
 *   caixa alta            75%     42%
 *   numero no gancho      25%      0%
 *   promessa em R$/US$    17%      0%
 *   marcador de noticia   17%      0%
 *   pergunta na abertura   0%      8%
 *   emoji de alerta       25%     25%   <- ruido, nao pontua
 *
 * Os 12 piores eram todos aforismos ("Nem toda IA serve pra mesma coisa"):
 * frase esperta, sem numero, sem fato, sem nada pra salvar. Alcance mediano 45-101.
 */

export interface HookScore {
  total: number;
  verdict: 'publicar' | 'reescrever' | 'descartar';
  breakdown: Record<string, number>;
  reasons: string[];
}

const BRANDS = [
  'meta', 'whatsapp', 'chatgpt', 'openai', 'google', 'claude', 'anthropic',
  'instagram', 'apple', 'gemini', 'grok', 'tiktok', 'youtube', 'n8n', 'zapier',
  'make', 'notion', 'canva', 'shopify', 'nubank',
];

const NEWS_MARKERS = [
  'acabou de', 'acaba de', 'lancou', 'lançou', 'liberou', 'chegou',
  'anunciou', 'agora', 'hoje', 'a partir de', 'passou a', 'virou',
];

/** Sinais de aforismo: generalizacao esperta sem carga verificavel. */
const APHORISM_SHAPES = [
  /\bnem\s+tod[oa]\b/u,
  /\bningu(?:e|é)m\s+\w+/u,
  /\bn(?:a|ã)o\s+(?:e|é)\s+.{3,30}\s*[,.…]?\s*(?:e|é)\s/u,
  /\bvira\s+\w+/u,
  /\btod[oa]\s+\w+\s+(?:e|é)\b/u,
];

export function scoreHook(headline: string): HookScore {
  const raw = firstLine(headline);
  const lower = stripDiacritics(raw.toLowerCase());
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];

  const letters = [...raw].filter((c) => /\p{L}/u.test(c));
  const upperRatio = letters.length
    ? [...raw].filter((c) => /\p{Lu}/u.test(c)).length / letters.length
    : 0;
  if (upperRatio > 0.55) {
    breakdown.caixaAlta = 25;
    reasons.push('caixa alta na primeira linha (75% dos seus top vs 42% dos piores)');
  } else {
    breakdown.caixaAlta = 0;
    reasons.push('sem caixa alta: seus ganchos vencedores gritam');
  }

  const hasNumber = /\d/u.test(raw);
  breakdown.numero = hasNumber ? 20 : 0;
  reasons.push(hasNumber
    ? 'tem numero (nenhum dos seus 12 piores tinha)'
    : 'sem numero: zero dos seus piores posts tinha numero, e zero deles funcionou');

  const hasMoney = /r\$|us\$|\b\d+\s*(?:mil|k)\b/iu.test(raw);
  breakdown.grana = hasMoney ? 15 : 0;
  if (hasMoney) reasons.push('promessa financeira explicita');

  const hasNews = NEWS_MARKERS.some((marker) => lower.includes(marker));
  breakdown.noticia = hasNews ? 15 : 0;
  if (hasNews) reasons.push('marcador de novidade: o vetor do post de 69.317 de alcance');

  const brand = BRANDS.find((name) => new RegExp(`\\b${name}\\b`, 'u').test(lower));
  breakdown.marca = brand ? 10 : 0;
  if (brand) reasons.push(`sujeito concreto: ${brand}`);

  if (raw.trimEnd().endsWith('?')) {
    breakdown.pergunta = -25;
    reasons.push('PERGUNTA na abertura: zero dos seus 12 melhores abriu assim');
  }

  if (isAphorism(raw, lower, { hasNumber, hasNews, hasBrand: Boolean(brand) })) {
    breakdown.aforismo = -30;
    reasons.push('formato AFORISMO: seus 12 piores posts eram todos assim (45 a 101 de alcance)');
  }

  const total = clamp(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  return { total, verdict: verdictFor(total), breakdown, reasons };
}

/** Ordena sinais crus por forca de gancho, do melhor para o pior. */
export function rankHooks<T extends { headline: string }>(signals: readonly T[]): Array<T & { score: HookScore }> {
  return signals
    .map((signal) => ({ ...signal, score: scoreHook(signal.headline) }))
    .sort((a, b) => b.score.total - a.score.total);
}

function isAphorism(
  raw: string,
  lower: string,
  facts: { hasNumber: boolean; hasNews: boolean; hasBrand: boolean },
): boolean {
  if (facts.hasNumber || facts.hasNews || facts.hasBrand) return false;
  if (raw.trim().length > 95) return false;
  return APHORISM_SHAPES.some((shape) => shape.test(lower));
}

function verdictFor(total: number): HookScore['verdict'] {
  if (total >= 45) return 'publicar';
  if (total > 0) return 'reescrever';
  return 'descartar';
}

function firstLine(value: string): string {
  for (const line of value.split('\n')) {
    if (line.trim()) return line.trim();
  }
  return value.trim();
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
