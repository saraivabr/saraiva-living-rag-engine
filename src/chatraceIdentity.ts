const metaScopedIdPattern = /^\d{14,25}$/;

/**
 * Prioriza o mesmo Instagram-scoped ID retornado pela Meta na private reply.
 * Quando o Chatrace envia um identificador interno, preserva o namespace para
 * evitar colisao com contatos de outros canais.
 */
export function chatraceContextCandidates(rawSenderId: string): string[] {
  const senderId = rawSenderId.trim();
  if (!senderId) return [];
  if (senderId.startsWith('chatrace:')) return [senderId];

  const namespaced = `chatrace:${senderId}`;
  return metaScopedIdPattern.test(senderId)
    ? [senderId, namespaced]
    : [namespaced];
}

export function chatraceFallbackSenderId(rawSenderId: string): string {
  const candidates = chatraceContextCandidates(rawSenderId);
  return candidates.at(-1) || 'chatrace:unknown';
}
