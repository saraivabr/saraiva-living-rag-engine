import type { IgComment } from '../instagram/types.js';
import type { PromiseKind } from '../socialSelling/flow.js';

const INSTAGRAM_ID = /^\d{5,30}$/;
const MAX_COMMENTS = 50;
const MAX_COPY_LENGTH = 2_000;

const PROMISE_KINDS = new Set<PromiseKind>([
  'empresa_agentica_live',
  'website_prompt',
  'whatsapp_elevenlabs_workshop',
  'voice_ai_map_workshop',
  'voice_call_map',
  'github_flow',
  'sdr_voice',
  'autism_support',
  'demosell',
  'standard_operation',
  'anti_betting',
  'tdah_repos',
  'prompt',
  'ads',
  'whatsapp_ai',
  'automation',
  'diagnostic',
  'unknown',
]);

const UNSAFE_COPY_PATTERNS = [
  /\{\{|\}\}/,
  /@(?:usuario|usu[aá]rio|username)\b/i,
  /\[\s*(?:usuario|usu[aá]rio|username|nome)\s*\]/i,
  /para responder a esse coment[aá]rio/i,
  /preciso do nome de usu[aá]rio/i,
  /estou pronto para atuar/i,
  /aqui est[aã]o algumas op[cç][oõ]es de resposta/i,
  /instru[cç][oõ]es? (?:acima|do sistema|recebidas?)/i,
];

const PRIVATE_DELIVERY_CLAIM_PATTERNS = [
  /\b(?:te|lhe)\s+(?:mandei|enviei|chamei)\b.{0,60}\b(?:dm|direct|privad[oa])\b/i,
  /\b(?:dm|direct|privad[oa])\b.{0,60}\b(?:te|lhe)\s+(?:mandei|enviei|chamei)\b/i,
  /\b(?:mandei|enviei)\b.{0,60}\b(?:por la|por lá)\b/i,
];

export interface CommentRecoveryTarget {
  commentId: string;
  /**
   * Usado somente para reparar uma persistencia antiga incompleta. Em uma nova
   * private reply, o ID devolvido pela Meta sempre prevalece.
   */
  senderId?: string;
  /**
   * Use somente depois de a Meta confirmar que a private reply do comentario
   * ja foi consumida. Exige senderId lido do proprio comentario no Graph.
   */
  privateReplyAlreadyUsed?: boolean;
}

export interface CommentRecoveryManifest {
  accountUsername: string;
  mediaId: string;
  postPermalink?: string;
  promiseKind?: PromiseKind;
  promiseLabel: string;
  privateReply: string;
  publicReply: string;
  comments: CommentRecoveryTarget[];
}

export interface PersistedLeadEvidence {
  senderId: string;
  complete: boolean;
}

export interface PersistLeadInput {
  senderId: string;
  commentId: string;
  username?: string;
  commentText: string;
  mediaId: string;
  postPermalink?: string;
  promiseKind: PromiseKind;
  promiseLabel: string;
  privateReply: string;
  publicReply: string;
  privateReplyKnownSent?: boolean;
}

export interface CommentRecoveryDependencies {
  ownUsername: string;
  getComments(mediaId: string): Promise<IgComment[]>;
  hasPrivateReply(commentId: string): boolean;
  markPrivateReply(commentId: string): Promise<void>;
  markPublicReply(commentId: string): Promise<void>;
  findPersistedLead(commentId: string): PersistedLeadEvidence | undefined;
  persistLead(input: PersistLeadInput): Promise<void>;
  sendPrivateReply(commentId: string, message: string): Promise<string>;
  replyToComment(commentId: string, message: string): Promise<string>;
  wait(ms: number): Promise<void>;
}

export type RecoveryStepState =
  | 'planned'
  | 'sent'
  | 'saved'
  | 'already_done'
  | 'healed'
  | 'blocked'
  | 'failed'
  | 'not_run';

export interface CommentRecoveryResult {
  commentId: string;
  status: 'planned' | 'completed' | 'skipped' | 'blocked' | 'failed';
  privateReply: RecoveryStepState;
  persistence: RecoveryStepState;
  publicReply: RecoveryStepState;
  errorCode?: string;
}

export interface CommentRecoverySummary {
  ok: boolean;
  mode: 'dry-run' | 'execute';
  mediaId: string;
  totals: {
    requested: number;
    completed: number;
    skipped: number;
    blocked: number;
    failed: number;
  };
  results: CommentRecoveryResult[];
}

export class CommentRecoveryValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CommentRecoveryValidationError';
  }
}

export function validateCommentRecoveryManifest(value: unknown): CommentRecoveryManifest {
  if (!isRecord(value)) throw new CommentRecoveryValidationError('manifest_not_object');

  const mediaId = requiredString(value.mediaId, 'media_id_missing');
  if (!INSTAGRAM_ID.test(mediaId)) throw new CommentRecoveryValidationError('media_id_invalid');

  const accountUsername = requiredString(value.accountUsername, 'account_username_missing')
    .replace(/^@/, '')
    .toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(accountUsername)) {
    throw new CommentRecoveryValidationError('account_username_invalid');
  }

  const promiseLabel = requiredString(value.promiseLabel, 'promise_label_missing');
  const privateReply = validateCopy(value.privateReply, 'private_reply');
  const publicReply = validateCopy(value.publicReply, 'public_reply');
  const promiseKind = optionalString(value.promiseKind) || 'diagnostic';
  if (!PROMISE_KINDS.has(promiseKind as PromiseKind)) {
    throw new CommentRecoveryValidationError('promise_kind_invalid');
  }

  if (!Array.isArray(value.comments) || value.comments.length === 0) {
    throw new CommentRecoveryValidationError('comments_missing');
  }
  if (value.comments.length > MAX_COMMENTS) {
    throw new CommentRecoveryValidationError('comments_limit_exceeded');
  }

  const seen = new Set<string>();
  const comments = value.comments.map((target): CommentRecoveryTarget => {
    if (!isRecord(target)) throw new CommentRecoveryValidationError('comment_not_object');
    const commentId = requiredString(target.commentId, 'comment_id_missing');
    if (!INSTAGRAM_ID.test(commentId)) {
      throw new CommentRecoveryValidationError('comment_id_invalid');
    }
    if (seen.has(commentId)) throw new CommentRecoveryValidationError('comment_id_duplicate');
    seen.add(commentId);

    const senderId = optionalString(target.senderId);
    if (senderId && !INSTAGRAM_ID.test(senderId)) {
      throw new CommentRecoveryValidationError('sender_id_invalid');
    }
    const privateReplyAlreadyUsed = target.privateReplyAlreadyUsed === true;
    if (target.privateReplyAlreadyUsed !== undefined && typeof target.privateReplyAlreadyUsed !== 'boolean') {
      throw new CommentRecoveryValidationError('private_reply_already_used_invalid');
    }
    if (privateReplyAlreadyUsed && !senderId) {
      throw new CommentRecoveryValidationError('private_reply_already_used_sender_missing');
    }
    return { commentId, senderId, privateReplyAlreadyUsed };
  });

  if (
    comments.some((target) => target.privateReplyAlreadyUsed)
    && PRIVATE_DELIVERY_CLAIM_PATTERNS.some((pattern) => pattern.test(publicReply))
  ) {
    throw new CommentRecoveryValidationError('public_reply_false_private_claim');
  }

  const postPermalink = optionalString(value.postPermalink);
  if (postPermalink && !isInstagramPermalink(postPermalink)) {
    throw new CommentRecoveryValidationError('post_permalink_invalid');
  }

  return {
    accountUsername,
    mediaId,
    postPermalink,
    promiseKind: promiseKind as PromiseKind,
    promiseLabel,
    privateReply,
    publicReply,
    comments,
  };
}

export async function recoverComments(input: {
  manifest: CommentRecoveryManifest;
  execute: boolean;
  delayMs?: number;
  dependencies?: CommentRecoveryDependencies;
}): Promise<CommentRecoverySummary> {
  const manifest = validateCommentRecoveryManifest(input.manifest);
  const mode = input.execute ? 'execute' : 'dry-run';

  if (!input.execute) {
    return summarize(mode, manifest.mediaId, manifest.comments.map((target) => ({
      commentId: target.commentId,
      status: 'planned',
      privateReply: 'planned',
      persistence: 'planned',
      publicReply: 'planned',
    })));
  }

  const dependencies = input.dependencies;
  if (!dependencies) throw new CommentRecoveryValidationError('dependencies_missing');
  if (!dependencies.ownUsername.trim()) {
    throw new CommentRecoveryValidationError('own_username_missing');
  }
  if (normalizeUsername(dependencies.ownUsername) !== normalizeUsername(manifest.accountUsername)) {
    throw new CommentRecoveryValidationError('account_username_mismatch');
  }

  const delayMs = normalizeDelay(input.delayMs);
  let liveComments: IgComment[];
  try {
    liveComments = await dependencies.getComments(manifest.mediaId);
  } catch {
    return summarize(mode, manifest.mediaId, manifest.comments.map((target) => failedResult(
      target.commentId,
      'media_comments_read_failed',
    )));
  }

  const liveById = new Map(liveComments.map((comment) => [comment.id, comment]));
  const results: CommentRecoveryResult[] = [];
  const handledUsernames = new Set<string>();

  for (const target of manifest.comments) {
    const live = liveById.get(target.commentId);
    if (!live) {
      results.push(blockedResult(target.commentId, 'comment_not_in_media'));
      continue;
    }

    const existingOwnReplies = (live.replies?.data ?? []).filter(
      (reply) => normalizeUsername(reply.username) === normalizeUsername(dependencies.ownUsername),
    );
    const matchingPublicReply = existingOwnReplies.some(
      (reply) => normalizeCopy(reply.text) === normalizeCopy(manifest.publicReply),
    );
    if (existingOwnReplies.length > 0 && !matchingPublicReply) {
      results.push(blockedResult(target.commentId, 'unexpected_existing_public_reply'));
      continue;
    }

    const followerUsername = normalizeUsername(live.username);
    if (followerUsername && handledUsernames.has(followerUsername)) {
      results.push(blockedResult(target.commentId, 'duplicate_follower_in_batch'));
      continue;
    }
    if (followerUsername) handledUsernames.add(followerUsername);

    const result: CommentRecoveryResult = {
      commentId: target.commentId,
      status: 'failed',
      privateReply: 'not_run',
      persistence: 'not_run',
      publicReply: 'not_run',
    };

    const persisted = dependencies.findPersistedLead(target.commentId);
    const privateMarked = dependencies.hasPrivateReply(target.commentId);
    let senderId = persisted?.senderId || target.senderId;

    if (target.privateReplyAlreadyUsed && !persisted && !privateMarked) {
      senderId = target.senderId;
      result.privateReply = 'already_done';
      try {
        await dependencies.persistLead(buildPersistInput(manifest, live, senderId!, false));
        result.persistence = 'saved';
      } catch {
        result.persistence = 'failed';
        result.publicReply = 'blocked';
        result.errorCode = 'lead_persistence_failed';
        results.push(result);
        continue;
      }
      try {
        await dependencies.markPrivateReply(target.commentId);
      } catch {
        result.privateReply = 'failed';
        result.publicReply = 'blocked';
        result.errorCode = 'private_store_mark_failed';
        results.push(result);
        continue;
      }
    } else if (persisted?.complete) {
      result.persistence = 'already_done';
      if (privateMarked) {
        result.privateReply = 'already_done';
      } else {
        try {
          await dependencies.markPrivateReply(target.commentId);
          result.privateReply = 'healed';
        } catch {
          result.privateReply = 'failed';
          result.errorCode = 'private_store_mark_failed';
          results.push(result);
          continue;
        }
      }
    } else if (privateMarked || persisted) {
      if (!senderId) {
        result.status = 'blocked';
        result.privateReply = 'already_done';
        result.persistence = 'blocked';
        result.publicReply = 'blocked';
        result.errorCode = 'private_reply_context_missing';
        results.push(result);
        continue;
      }

      result.privateReply = 'already_done';
      try {
        await dependencies.persistLead(buildPersistInput(manifest, live, senderId));
        result.persistence = 'saved';
      } catch {
        result.persistence = 'failed';
        result.publicReply = 'blocked';
        result.errorCode = 'lead_persistence_failed';
        results.push(result);
        continue;
      }
      if (!privateMarked) {
        try {
          await dependencies.markPrivateReply(target.commentId);
          result.privateReply = 'healed';
        } catch {
          result.privateReply = 'failed';
          result.publicReply = 'blocked';
          result.errorCode = 'private_store_mark_failed';
          results.push(result);
          continue;
        }
      }
    } else {
      try {
        senderId = await dependencies.sendPrivateReply(target.commentId, manifest.privateReply);
        if (!senderId?.trim()) throw new Error('empty_sender_id');
        result.privateReply = 'sent';
        await dependencies.wait(delayMs);
      } catch (error) {
        if (isAlreadyRepliedError(error) && target.senderId) {
          senderId = target.senderId;
          result.privateReply = 'already_done';
        } else {
          result.status = isAlreadyRepliedError(error) ? 'blocked' : 'failed';
          result.privateReply = isAlreadyRepliedError(error) ? 'already_done' : 'failed';
          result.persistence = 'blocked';
          result.publicReply = 'blocked';
          result.errorCode = isAlreadyRepliedError(error)
            ? 'private_reply_already_used_context_unknown'
            : 'private_reply_failed';
          results.push(result);
          continue;
        }
      }

      try {
        await dependencies.persistLead(buildPersistInput(manifest, live, senderId));
        result.persistence = 'saved';
      } catch {
        result.persistence = 'failed';
        result.publicReply = 'blocked';
        result.errorCode = 'lead_persistence_failed';
        results.push(result);
        continue;
      }
      try {
        await dependencies.markPrivateReply(target.commentId);
      } catch {
        result.privateReply = 'failed';
        result.publicReply = 'blocked';
        result.errorCode = 'private_store_mark_failed';
        results.push(result);
        continue;
      }
    }

    if (matchingPublicReply) {
      try {
        await dependencies.markPublicReply(target.commentId);
        result.publicReply = 'already_done';
        result.status = 'skipped';
      } catch {
        result.publicReply = 'failed';
        result.errorCode = 'public_store_mark_failed';
      }
      results.push(result);
      continue;
    }

    try {
      await dependencies.replyToComment(target.commentId, manifest.publicReply);
      result.publicReply = 'sent';
      await dependencies.markPublicReply(target.commentId);
      result.status = 'completed';
      await dependencies.wait(delayMs);
    } catch (error) {
      if (isAlreadyRepliedError(error)) {
        try {
          await dependencies.markPublicReply(target.commentId);
          result.publicReply = 'already_done';
          result.status = 'skipped';
        } catch {
          result.publicReply = 'failed';
          result.errorCode = 'public_store_mark_failed';
        }
      } else {
        result.publicReply = 'failed';
        result.errorCode = 'public_reply_failed';
      }
    }
    results.push(result);
  }

  return summarize(mode, manifest.mediaId, results);
}

function buildPersistInput(
  manifest: CommentRecoveryManifest,
  comment: IgComment,
  senderId: string,
  privateReplyKnownSent = true,
): PersistLeadInput {
  return {
    senderId,
    commentId: comment.id,
    username: comment.username,
    commentText: comment.text || 'comentou no post',
    mediaId: manifest.mediaId,
    postPermalink: manifest.postPermalink,
    promiseKind: manifest.promiseKind || 'diagnostic',
    promiseLabel: manifest.promiseLabel,
    privateReply: manifest.privateReply,
    publicReply: manifest.publicReply,
    privateReplyKnownSent,
  };
}

function validateCopy(value: unknown, prefix: string): string {
  const copy = requiredString(value, `${prefix}_missing`);
  if (copy.length > MAX_COPY_LENGTH) {
    throw new CommentRecoveryValidationError(`${prefix}_too_long`);
  }
  if (UNSAFE_COPY_PATTERNS.some((pattern) => pattern.test(copy))) {
    throw new CommentRecoveryValidationError(`${prefix}_unsafe`);
  }
  return copy;
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CommentRecoveryValidationError(code);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isInstagramPermalink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['instagram.com', 'www.instagram.com'].includes(url.hostname)
      && /^\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeDelay(value?: number): number {
  if (value === undefined) return 4_000;
  if (!Number.isFinite(value) || value < 0 || value > 60_000) {
    throw new CommentRecoveryValidationError('delay_ms_invalid');
  }
  return Math.floor(value);
}

function normalizeUsername(value?: string): string {
  return (value || '').trim().replace(/^@/, '').toLowerCase();
}

function normalizeCopy(value?: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function isAlreadyRepliedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('2534023')
    || message.includes('already has a reply')
    || message.includes('ja tem uma resposta')
    || message.includes('já tem uma resposta');
}

function failedResult(commentId: string, errorCode: string): CommentRecoveryResult {
  return {
    commentId,
    status: 'failed',
    privateReply: 'not_run',
    persistence: 'not_run',
    publicReply: 'not_run',
    errorCode,
  };
}

function blockedResult(commentId: string, errorCode: string): CommentRecoveryResult {
  return {
    commentId,
    status: 'blocked',
    privateReply: 'not_run',
    persistence: 'not_run',
    publicReply: 'blocked',
    errorCode,
  };
}

function summarize(
  mode: CommentRecoverySummary['mode'],
  mediaId: string,
  results: CommentRecoveryResult[],
): CommentRecoverySummary {
  const totals = {
    requested: results.length,
    completed: results.filter((result) => result.status === 'completed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
    failed: results.filter((result) => result.status === 'failed').length,
  };
  return {
    ok: totals.blocked === 0 && totals.failed === 0,
    mode,
    mediaId,
    totals,
    results,
  };
}
