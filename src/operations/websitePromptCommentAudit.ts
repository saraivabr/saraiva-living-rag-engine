import type { LeadContext } from '../store/leadContextStore.js';

export interface AuditGraphComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  from?: { id?: string; username?: string };
  replies?: { data?: Array<{ username?: string; text?: string }> };
}

export interface WebsitePromptCommentAudit {
  coverage: {
    comments: number;
    uniqueCommenters: number;
    oldest?: string;
    newest?: string;
    within24h: number;
    within7d: number;
  };
  comments: {
    exactKeyword: number;
    keywordInPhrase: number;
    nonKeyword: number;
    repeatedCommenters: number;
  };
  publicReplies: {
    replied: number;
    unanswered: number;
    repliedWithoutContext: number;
    unansweredWithoutContext: number;
  };
  state: {
    contexts: number;
    commentsWithContext: number;
    commentsWithoutContext: number;
    staleContexts: number;
    privateMarkers: number;
    publicMarkers: number;
    stages: Record<string, number>;
    genuineDirectReplies: number;
    recoverySent: number;
    promptDelivered: number;
    promptOpened: number;
    productOpened: number;
    optedOut: number;
  };
  actionable: {
    firstReplyCandidates: number;
    firstReplyCandidatesWithin24h: number;
    alreadyContactedWithoutContext: number;
    waitForNewInbound: number;
  };
  themes: Array<{ theme: string; count: number; examples: string[] }>;
  publicReplyVariants: Array<{ text: string; count: number }>;
}

export function auditWebsitePromptComments(input: {
  comments: AuditGraphComment[];
  contexts: LeadContext[];
  privateMarkers?: Iterable<string>;
  publicMarkers?: Iterable<string>;
  ownUsername: string;
  now?: Date;
}): WebsitePromptCommentAudit {
  const now = (input.now || new Date()).getTime();
  const contextsByComment = new Map(
    input.contexts.flatMap((context) => context.commentId ? [[context.commentId, context] as const] : []),
  );
  const graphIds = new Set(input.comments.map((comment) => comment.id));
  const privateMarkers = new Set(input.privateMarkers || []);
  const publicMarkers = new Set(input.publicMarkers || []);
  const ownUsername = normalize(input.ownUsername);
  const ownReplies = (comment: AuditGraphComment) => (comment.replies?.data || [])
    .filter((reply) => normalize(reply.username) === ownUsername);
  const hasOwnReply = (comment: AuditGraphComment) => ownReplies(comment).length > 0;
  const age = (comment: AuditGraphComment) => now - Date.parse(comment.timestamp || '');
  const within = (comment: AuditGraphComment, milliseconds: number) => {
    const value = age(comment);
    return Number.isFinite(value) && value >= 0 && value <= milliseconds;
  };

  const commenters = new Map<string, number>();
  for (const comment of input.comments) {
    if (comment.username) commenters.set(comment.username, (commenters.get(comment.username) || 0) + 1);
  }
  const timestamps = input.comments.map((comment) => comment.timestamp).filter(Boolean) as string[];
  const firstReplyCandidates = selectWebsitePromptFirstReplyCandidates(input);

  const stages: Record<string, number> = {};
  for (const context of input.contexts) {
    const stage = context.instagramFlow?.stage || 'none';
    stages[stage] = (stages[stage] || 0) + 1;
  }

  const themeMap = new Map<string, string[]>();
  for (const comment of input.comments) {
    if (isKeywordComment(comment.text)) continue;
    const theme = classifyTheme(comment.text);
    const examples = themeMap.get(theme) || [];
    if (examples.length < 3) examples.push(sanitizeExample(comment.text));
    themeMap.set(theme, examples);
  }

  const replyVariants = new Map<string, number>();
  for (const comment of input.comments) {
    for (const reply of ownReplies(comment)) {
      const text = sanitizeExample(reply.text);
      if (text) replyVariants.set(text, (replyVariants.get(text) || 0) + 1);
    }
  }

  return {
    coverage: {
      comments: input.comments.length,
      uniqueCommenters: commenters.size,
      oldest: timestamps.sort()[0],
      newest: timestamps.sort().at(-1),
      within24h: input.comments.filter((comment) => within(comment, 24 * 60 * 60 * 1_000)).length,
      within7d: input.comments.filter((comment) => within(comment, 7 * 24 * 60 * 60 * 1_000)).length,
    },
    comments: {
      exactKeyword: input.comments.filter((comment) => normalize(comment.text) === 'saraiva').length,
      keywordInPhrase: input.comments.filter((comment) =>
        normalize(comment.text) !== 'saraiva' && /(^| )saraiva( |$)/.test(normalize(comment.text))).length,
      nonKeyword: input.comments.filter((comment) => !isKeywordComment(comment.text)).length,
      repeatedCommenters: [...commenters.values()].filter((count) => count > 1).length,
    },
    publicReplies: {
      replied: input.comments.filter(hasOwnReply).length,
      unanswered: input.comments.filter((comment) => !hasOwnReply(comment)).length,
      repliedWithoutContext: input.comments.filter((comment) =>
        hasOwnReply(comment) && !contextsByComment.has(comment.id)).length,
      unansweredWithoutContext: input.comments.filter((comment) =>
        !hasOwnReply(comment) && !contextsByComment.has(comment.id)).length,
    },
    state: {
      contexts: input.contexts.length,
      commentsWithContext: input.comments.filter((comment) => contextsByComment.has(comment.id)).length,
      commentsWithoutContext: input.comments.filter((comment) => !contextsByComment.has(comment.id)).length,
      staleContexts: input.contexts.filter((context) => Boolean(context.commentId && !graphIds.has(context.commentId))).length,
      privateMarkers: input.comments.filter((comment) => privateMarkers.has(comment.id)).length,
      publicMarkers: input.comments.filter((comment) => publicMarkers.has(comment.id)).length,
      stages,
      genuineDirectReplies: input.contexts.filter(hasGenuineDirectReply).length,
      recoverySent: input.contexts.filter((context) => Boolean(context.instagramFlow?.recoverySentAt)).length,
      promptDelivered: input.contexts.filter((context) => Boolean(context.instagramFlow?.promptDeliveredAt)).length,
      promptOpened: input.contexts.filter((context) => Boolean(context.instagramFlow?.promptOpenedAt)).length,
      productOpened: input.contexts.filter((context) => Boolean(context.instagramFlow?.productOpenedAt)).length,
      optedOut: input.contexts.filter((context) => Boolean(context.instagramFlow?.optedOutAt)).length,
    },
    actionable: {
      firstReplyCandidates: firstReplyCandidates.length,
      firstReplyCandidatesWithin24h: firstReplyCandidates.filter((comment) =>
        within(comment, 24 * 60 * 60 * 1_000)).length,
      alreadyContactedWithoutContext: input.comments.filter((comment) =>
        hasOwnReply(comment) && !contextsByComment.has(comment.id)).length,
      waitForNewInbound: input.contexts.filter((context) =>
        !context.instagramFlow?.promptDeliveredAt && !hasGenuineDirectReply(context)).length,
    },
    themes: [...themeMap.entries()]
      .map(([theme, examples]) => ({
        theme,
        count: input.comments.filter((comment) =>
          !isKeywordComment(comment.text) && classifyTheme(comment.text) === theme).length,
        examples,
      }))
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme)),
    publicReplyVariants: [...replyVariants.entries()]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

export function selectWebsitePromptFirstReplyCandidates(input: {
  comments: AuditGraphComment[];
  contexts: LeadContext[];
  privateMarkers?: Iterable<string>;
  ownUsername: string;
  now?: Date;
}): AuditGraphComment[] {
  const contexts = new Set(input.contexts.map((context) => context.commentId).filter(Boolean));
  const privateMarkers = new Set(input.privateMarkers || []);
  const ownUsername = normalize(input.ownUsername);
  const now = (input.now || new Date()).getTime();
  return input.comments.filter((comment) => {
    const timestamp = Date.parse(comment.timestamp || '');
    const age = now - timestamp;
    return isKeywordComment(comment.text)
      && Boolean(comment.from?.id)
      && !(comment.replies?.data || []).some((reply) => normalize(reply.username) === ownUsername)
      && !contexts.has(comment.id)
      && !privateMarkers.has(comment.id)
      && Number.isFinite(timestamp)
      && age >= 0
      && age <= 7 * 24 * 60 * 60 * 1_000;
  });
}

export function selectContactedCommentsWithoutContext(input: {
  comments: AuditGraphComment[];
  contexts: LeadContext[];
  ownUsername: string;
}): AuditGraphComment[] {
  const contextComments = new Set(input.contexts.map((context) => context.commentId).filter(Boolean));
  const contextSenders = new Set(input.contexts.map((context) => context.senderId));
  const ownUsername = normalize(input.ownUsername);
  const newestBySender = new Map<string, AuditGraphComment>();
  for (const comment of input.comments) {
    const senderId = comment.from?.id;
    if (
      !senderId
      || contextComments.has(comment.id)
      || contextSenders.has(senderId)
      || !(comment.replies?.data || []).some((reply) => normalize(reply.username) === ownUsername)
    ) continue;
    const current = newestBySender.get(senderId);
    if (!current || (comment.timestamp || '') > (current.timestamp || '')) {
      newestBySender.set(senderId, comment);
    }
  }
  return [...newestBySender.values()];
}

function hasGenuineDirectReply(context: LeadContext): boolean {
  const interactions = context.interactions || [];
  const firstOutbound = interactions.findIndex((interaction) => interaction.direction === 'out');
  return firstOutbound >= 0 && interactions.slice(firstOutbound + 1)
    .some((interaction) => interaction.direction === 'in');
}

function isKeywordComment(value?: string): boolean {
  const text = normalize(value);
  return text === 'saraiva' || /(^| )saraiva( |$)/.test(text);
}

function classifyTheme(value?: string): string {
  const text = normalize(value);
  if (!text) return 'emoji_or_empty';
  if (/automacao|whatsapp|mensagem sozinho|numero aleatorio/.test(text)) return 'automation_question';
  if (/comprar|quero um|queroo|eu quero/.test(text)) return 'buying_intent';
  if (/onde.*receb|manda|envia|prompt|link/.test(text)) return 'delivery_request';
  if (/nao adianta|todo mundo ja sabe|venda|pix/.test(text)) return 'proof_objection';
  if (/como|qual ferramenta|como fazer|conseguir/.test(text)) return 'method_question';
  if (/generico|genérico/.test(text)) return 'quality_critique';
  if (/porra/.test(text)) return 'abusive';
  if (/\.com|https?:|www\./.test((value || '').toLowerCase())) return 'promotion_or_link';
  return 'other';
}

function normalize(value?: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeExample(value?: string): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}
