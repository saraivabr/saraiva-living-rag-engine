/**
 * Gerador de carrossel no formato validado por @saraiva.ai.
 *
 * A estrutura de 10 slides vem de dois achados da auditoria:
 * 1. Os posts com maior taxa de salvamento (5,96% / 4,96% / 4,61%) eram todos
 *    "ensinamento com numero". Aforismo nunca aparece nessa lista. Por isso os
 *    slides 7-9 sao passo a passo obrigatorio — sao eles que compram o save.
 * 2. Legenda entre 400 e 900 caracteres teve alcance mediano de 515, contra
 *    281 das legendas com 900+. 61 dos 121 posts estavam na faixa ruim.
 */

import { scoreHook, type HookScore } from './hookFormula.js';

export interface CarouselSignal {
  /** Manchete crua vinda da pesquisa (last30days, feed, etc). */
  headline: string;
  /** O que de fato mudou, em uma frase. */
  fact: string;
  /** Quem paga o preco de ignorar isso. */
  whoLoses?: string;
  /** Tres passos concretos. Menos que tres e manifesto, nao carrossel. */
  steps: readonly string[];
  /** Palavra que o lead comenta para abrir a DM. */
  ctaKeyword: string;
  source?: string;
  url?: string;
}

export interface CarouselSlide {
  n: number;
  role: string;
  text: string;
}

export interface CarouselDraft {
  hook: string;
  hookScore: HookScore;
  slides: CarouselSlide[];
  caption: string;
  captionLength: number;
  hashtags: string[];
  ctaKeyword: string;
  warnings: string[];
}

/** Publico que engaja de verdade: 38,6% tem 35-44, 77,3% homens, 94,8% BR. */
const DEFAULT_WHO_LOSES = 'quem toca operacao no braco e acha que resolve contratando mais gente';

/** 5 hashtags: voce tem 312 unicas hoje, o que e o oposto de territorio. */
const CORE_HASHTAGS = ['#inteligenciaartificial', '#automacao', '#operacao', '#whatsappbusiness', '#saraivaai'];

const MIN_CAPTION = 400;
const MAX_CAPTION = 900;

export function buildCarousel(signal: CarouselSignal): CarouselDraft {
  const warnings: string[] = [];
  const hook = normalizeHook(signal.headline);
  const hookScore = scoreHook(hook);

  if (hookScore.verdict === 'descartar') {
    warnings.push(`gancho reprovado (score ${hookScore.total}): ${hookScore.reasons.join(' | ')}`);
  }

  const steps = signal.steps.slice(0, 3);
  if (steps.length < 3) {
    warnings.push(`${steps.length} de 3 passos: sem os slides 7-9 o carrossel vira manifesto ilustrado (alcance mediano 45-101)`);
  }

  const whoLoses = signal.whoLoses?.trim() || DEFAULT_WHO_LOSES;
  const slides: CarouselSlide[] = [
    { n: 1, role: 'gancho', text: hook },
    { n: 2, role: 'o que mudou', text: signal.fact },
    { n: 3, role: 'quem perde', text: whoLoses },
    { n: 4, role: 'o erro', text: `o reflexo e correr atras da ferramenta. o custo aparece depois, quando ${lower(whoLoses)} continua no mesmo lugar.` },
    { n: 5, role: 'a causa', text: 'ferramenta nova nao conserta processo quebrado. ela acelera o processo que ja existe, inclusive o errado.' },
    { n: 6, role: 'o novo jogo', text: 'quem sai na frente nao e quem tem a ferramenta. e quem sabe onde encaixar ela.' },
    ...steps.map((step, index) => ({
      n: 7 + index,
      role: `passo ${index + 1}`,
      text: step,
    })),
  ];
  while (slides.length < 9) {
    const n = slides.length + 1;
    slides.push({ n, role: `passo ${n - 6}`, text: '[FALTA PASSO CONCRETO]' });
  }
  slides.push({
    n: 10,
    role: 'cta',
    text: `comenta ${signal.ctaKeyword.toUpperCase()} que eu te mando o passo a passo completo no direct.`,
  });

  const caption = buildCaption(hook, signal, whoLoses, steps);
  if (caption.length > MAX_CAPTION) {
    warnings.push(`legenda com ${caption.length} chars: acima de 900 o alcance mediano cai de 515 para 281`);
  }
  if (caption.length < MIN_CAPTION) {
    warnings.push(`legenda com ${caption.length} chars: abaixo de 400 o alcance mediano cai para 301`);
  }

  return {
    hook,
    hookScore,
    slides,
    caption,
    captionLength: caption.length,
    hashtags: CORE_HASHTAGS,
    ctaKeyword: signal.ctaKeyword.toUpperCase(),
    warnings,
  };
}

function buildCaption(
  hook: string,
  signal: CarouselSignal,
  whoLoses: string,
  steps: readonly string[],
): string {
  const body = [
    hook,
    '',
    signal.fact,
    '',
    `Na pratica isso pesa em ${lower(whoLoses)}.`,
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Ferramenta nova nao conserta processo quebrado — ela so acelera o que ja existe.',
    '',
    `Comenta ${signal.ctaKeyword.toUpperCase()} que eu te mando o passo a passo no direct.`,
    '',
    CORE_HASHTAGS.join(' '),
  ].join('\n');

  return trimToBudget(body);
}

/**
 * Corta pelo fim util (antes do CTA) para respeitar o teto de 900 sem perder
 * o gancho nem a chamada.
 */
function trimToBudget(caption: string): string {
  if (caption.length <= MAX_CAPTION) return caption;
  const lines = caption.split('\n');
  while (caption.length > MAX_CAPTION && lines.length > 6) {
    lines.splice(lines.length - 6, 1);
    caption = lines.join('\n');
  }
  return caption;
}

function normalizeHook(headline: string): string {
  const first = headline.split('\n').find((line) => line.trim())?.trim() ?? headline.trim();
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}...` : first;
}

function lower(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
