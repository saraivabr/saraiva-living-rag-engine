/**
 * Follow Gate — controla o acesso a conteúdos exclusivos para seguidores.
 *
 * Regra fundamental: NUNCA inferir o status de follow a partir de username,
 * bio, comportamento ou qualquer outra fonte que não seja o campo isFollower
 * presente explicitamente no payload do Zernio.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type FollowGateState =
  | 'content_requested'
  | 'checking_follow'
  | 'awaiting_follow'
  | 'rechecking_follow'
  | 'delivering_content'
  | 'content_delivered'
  | 'follow_status_unavailable'
  | 'technical_paused';

/**
 * Status de follow — derivado SOMENTE do campo isFollower do Zernio.
 * 'unknown' nunca implica que a pessoa não segue; apenas que não foi possível
 * confirmar.
 */
export type FollowStatus = 'following' | 'not_following' | 'unknown';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Payload do botão "JÁ SEGUI" — único gatilho aceito para re-verificação. */
export const FOLLOW_CONFIRMED_PAYLOAD = 'FLOW:SARAIVA:FOLLOW_CONFIRMED' as const;

/**
 * Número máximo de re-verificações antes de pausar o gate para evitar loop
 * infinito.
 */
export const MAX_FOLLOW_RECHECK_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Funções
// ---------------------------------------------------------------------------

/**
 * Resolve o FollowStatus a partir de um payload desconhecido do Zernio.
 *
 * Extrai o caminho `message.sender.instagramProfile.isFollower`.
 * - true  → 'following'
 * - false → 'not_following'
 * - ausente / null / undefined / qualquer outro valor → 'unknown'
 *
 * Nunca lança exceção; payload malformado resulta em 'unknown'.
 */
export function resolveFollowStatus(payload: unknown): FollowStatus {
  if (!payload || typeof payload !== 'object') return 'unknown';

  const root = payload as Record<string, unknown>;
  const message = asRecord(root.message);
  const sender = asRecord(message.sender);
  const instagramProfile = asRecord(sender.instagramProfile);
  const isFollower = instagramProfile.isFollower;

  if (isFollower === true) return 'following';
  if (isFollower === false) return 'not_following';
  return 'unknown';
}

/**
 * Constrói a mensagem e os botões correspondentes ao estado atual do gate.
 *
 * Nunca afirma que a pessoa não segue quando o status é 'unknown'.
 */
export function buildFollowGateMessage(
  state: FollowGateState | FollowStatus,
  options: { firstName?: string; contentTitle?: string },
): { message: string; buttons?: Array<{ type: 'postback'; title: string; payload: string }> } {
  const name = safeFirstName(options.firstName);
  const greeting = name ? `${name}, ` : '';

  const followButton = [
    {
      type: 'postback' as const,
      title: 'JÁ SEGUI',
      payload: FOLLOW_CONFIRMED_PAYLOAD,
    },
  ];

  switch (state) {
    case 'content_requested':
    case 'checking_follow':
      return {
        message: `${greeting}verificando seu acesso, aguarda um momento.`,
      };

    case 'not_following':
    case 'awaiting_follow':
      return {
        message:
          'Esse conteúdo é exclusivo para quem acompanha o meu trabalho. Segue o @saraiva.ai e toca abaixo para liberar.',
        buttons: followButton,
      };

    case 'unknown':
    case 'follow_status_unavailable':
    case 'rechecking_follow':
      return {
        message:
          'Não consegui confirmar ainda. Segue o @saraiva.ai e toca abaixo para eu verificar novamente.',
        buttons: followButton,
      };

    case 'following':
    case 'delivering_content':
    case 'content_delivered': {
      const contentRef = options.contentTitle
        ? `${options.contentTitle} que você pediu`
        : 'estrutura que você pediu';
      return {
        message: `Pronto. Aqui está a ${contentRef}.`,
      };
    }

    case 'technical_paused':
      return {
        message:
          'Tive um problema técnico por aqui. Tenta de novo em alguns minutos.',
      };

    default: {
      // Garante exaustividade em tempo de compilação
      const _exhaustive: never = state;
      void _exhaustive;
      return { message: 'Aguarda um momento.' };
    }
  }
}

/**
 * Verifica se o payload recebido é o botão "JÁ SEGUI".
 * Comparação estrita — não aceita variações.
 */
export function isFollowConfirmedPayload(payload: string): boolean {
  return payload === FOLLOW_CONFIRMED_PAYLOAD;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function safeFirstName(value?: string): string | undefined {
  const first = value?.trim().split(/\s+/)[0] ?? '';
  if (!/^[\p{L}'-]{2,30}$/u.test(first)) return undefined;
  return (
    first.charAt(0).toLocaleUpperCase('pt-BR') +
    first.slice(1).toLocaleLowerCase('pt-BR')
  );
}
