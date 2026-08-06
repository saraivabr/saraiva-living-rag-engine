/**
 * Esteira: sinal cru de pesquisa -> pauta ranqueada -> carrossel validado.
 *
 * A entrada e o JSON do `last30days --emit=json`. O normalizador aceita varias
 * grafias de chave porque o formato pode mudar entre versoes da skill; o que
 * nao aparecer vira undefined em vez de quebrar a esteira.
 */

import { evaluateContentPolicy, type ContentPolicyResult } from './contentPolicy.js';
import { buildCarousel, type CarouselDraft, type CarouselSignal } from './carouselBuilder.js';
import { scoreHook, type HookScore } from './hookFormula.js';

export interface ResearchFinding {
  headline: string;
  source?: string;
  url?: string;
  engagement?: number;
  publishedAt?: string;
}

export interface RankedPauta extends ResearchFinding {
  hookScore: HookScore;
  /** Gancho x tracao social, normalizado 0-100. */
  priority: number;
}

export interface PautaDraft {
  pauta: RankedPauta;
  carousel: CarouselDraft;
  policy: ContentPolicyResult;
  readyToQueue: boolean;
}

const TITLE_KEYS = ['headline', 'title', 'name', 'text', 'summary'];
const URL_KEYS = ['url', 'link', 'permalink', 'href'];
const SOURCE_KEYS = ['source', 'platform', 'site', 'origin'];
const ENGAGEMENT_KEYS = ['engagement', 'score', 'points', 'upvotes', 'likes', 'votes'];
const DATE_KEYS = ['publishedAt', 'published_at', 'date', 'createdAt', 'created_at'];

/** Achata o JSON do last30days em uma lista plana de achados. */
export function ingestFindings(payload: unknown): ResearchFinding[] {
  const out: ResearchFinding[] = [];
  walk(payload, out, 0);
  const seen = new Set<string>();
  return out.filter((finding) => {
    const key = finding.headline.toLowerCase().trim();
    if (key.length < 12 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Ordena por prioridade = 70% forca do gancho + 30% tracao social.
 * O gancho pesa mais porque a auditoria mostrou que o formato da primeira linha
 * separou os 12 melhores dos 12 piores posts, nao o tema.
 */
export function rankPautas(findings: readonly ResearchFinding[]): RankedPauta[] {
  const maxEngagement = Math.max(1, ...findings.map((f) => f.engagement ?? 0));
  return findings
    .map((finding) => {
      const hookScore = scoreHook(finding.headline);
      const traction = ((finding.engagement ?? 0) / maxEngagement) * 100;
      return {
        ...finding,
        hookScore,
        priority: Math.round(hookScore.total * 0.7 + traction * 0.3),
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

/** Monta o rascunho e passa pela politica de conteudo antes de liberar. */
export function draftFromPauta(
  pauta: RankedPauta,
  signal: Omit<CarouselSignal, 'headline'>,
  publishAt?: string,
): PautaDraft {
  const carousel = buildCarousel({ ...signal, headline: pauta.headline });
  const policy = evaluateContentPolicy({
    mediaProductType: 'REELS',
    publishAt,
    caption: carousel.caption,
    hashtags: carousel.hashtags,
  });
  return {
    pauta,
    carousel,
    policy,
    readyToQueue: policy.ok
      && carousel.warnings.length === 0
      && carousel.hookScore.verdict !== 'descartar',
  };
}

function walk(node: unknown, out: ResearchFinding[], depth: number): void {
  if (depth > 6 || node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  const headline = pickString(record, TITLE_KEYS);
  if (headline) {
    out.push({
      headline,
      url: pickString(record, URL_KEYS),
      source: pickString(record, SOURCE_KEYS),
      engagement: pickNumber(record, ENGAGEMENT_KEYS),
      publishedAt: pickString(record, DATE_KEYS),
    });
  }
  for (const value of Object.values(record)) walk(value, out, depth + 1);
}

function pickString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}
