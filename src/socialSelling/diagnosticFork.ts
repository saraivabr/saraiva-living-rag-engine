/**
 * Bifurcacao binaria do diagnostico — a segunda mensagem do Direct.
 *
 * Auditoria de 1.299 conversas (06/08/2026): 91,8% morreram na primeira
 * mensagem do lead. So 107 chegaram a segunda e 11 a quinta. A pergunta que
 * recebia todo mundo era um menu de seis opcoes ("atendimento, follow-up,
 * vendas, conteudo, financeiro ou organizacao interna?") — formulario, nao
 * conversa.
 *
 * Como o lead responde uma vez e some, a segunda mensagem precisa extrair o
 * maximo de sinal desse unico turno. Por isso a pergunta e binaria e cada
 * resposta preenche useCase E pain de uma vez.
 */

export const DIAGNOSTIC_FORK_QUESTION =
  'o que mais te tirou o sono essa semana: cliente que ficou sem resposta ou mes sem previsao de faturamento?';

export const PAIN_FORK_QUESTION =
  'e o que doi mais nisso hoje: perder o lead que ja chegou ou nao saber quantos vao chegar?';

export interface DiagnosticForkMatch {
  useCase: string;
  pain: string;
  urgency?: 'alta' | 'baixa';
}

const BOTH = /\b(?:ambos|os\s+dois|as\s+duas|todos\s+os\s+dois|tudo\s+isso)\b/u;

/** Ramo A, sinais que valem sozinhos em qualquer ponto da conversa. */
const ATTENDANCE_STRONG = [
  /sem\s+resposta/u,
  /n(?:a|ã)o\s+respond/u,
  /ficou\s+esperando/u,
  /demora\s+(?:na|pra|para)\s+respon/u,
  /perd(?:er|endo|i)\s+(?:o\s+)?lead/u,
];

/** Ramo A, atalhos que so valem quando a bifurcacao acabou de ser perguntada. */
const ATTENDANCE_SHORTCUT = [
  /^\s*(?:a|1)\s*[.,!)]?\s*$/u,
  /\bprimeir[ao]\b/u,
  /^\s*(?:o\s+)?cliente\b/u,
  /^\s*atendimento\s*[.,!]?\s*$/u,
];

/** Ramo B, sinais que valem sozinhos em qualquer ponto da conversa. */
const FORECAST_STRONG = [
  /sem\s+previs/u,
  /previsibilidade/u,
  /faturamento/u,
  /\bm(?:e|ê)s\s+fraco\b/u,
  /quantos?\s+(?:v(?:a|ã)o|vai)\s+chegar/u,
];

/** Ramo B, atalhos dependentes de contexto. */
const FORECAST_SHORTCUT = [
  /^\s*(?:b|2)\s*[.,!)]?\s*$/u,
  /\bsegund[ao]\b/u,
  /^\s*(?:o\s+)?m(?:e|ê)s\b/u,
  /^\s*(?:previs(?:a|ã)o|caixa|pipeline)\s*[.,!]?\s*$/u,
];

export interface MatchOptions {
  /**
   * true quando a ultima pergunta enviada foi a bifurcacao. Libera os atalhos
   * ("a", "2", "o primeiro"), que fora desse contexto gerariam falso positivo.
   */
  forkWasAsked?: boolean;
}

/**
 * Le a resposta do lead a bifurcacao. Retorna undefined quando nada casa,
 * para que o extrator de sinais generico siga funcionando normalmente.
 */
export function matchDiagnosticFork(
  text: string,
  options: MatchOptions = {},
): DiagnosticForkMatch | undefined {
  const lower = text.toLowerCase();
  const shortcuts = options.forkWasAsked === true;
  const attendance = matches(lower, ATTENDANCE_STRONG)
    || (shortcuts && matches(lower, ATTENDANCE_SHORTCUT));
  const forecast = matches(lower, FORECAST_STRONG)
    || (shortcuts && matches(lower, FORECAST_SHORTCUT));

  if ((shortcuts && BOTH.test(lower)) || (attendance && forecast)) {
    return {
      useCase: 'atendimento',
      pain: 'lead parado na fila e mes sem previsibilidade',
      urgency: 'alta',
    };
  }
  if (attendance) {
    return { useCase: 'atendimento', pain: 'demora na resposta' };
  }
  if (forecast) {
    return { useCase: 'vendas', pain: 'mes sem previsibilidade de faturamento' };
  }
  return undefined;
}

/** true quando `question` e uma das perguntas da bifurcacao. */
export function isForkQuestion(question?: string): boolean {
  return question === DIAGNOSTIC_FORK_QUESTION || question === PAIN_FORK_QUESTION;
}

function matches(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
