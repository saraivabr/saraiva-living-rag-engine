import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import {
  CommentRecoveryValidationError,
  recoverComments,
  validateCommentRecoveryManifest,
  type CommentRecoveryDependencies,
  type PersistLeadInput,
} from './operations/commentRecovery.js';
import type { LeadContext, LeadInteraction } from './store/leadContextStore.js';
import type { SalesLeadExport } from './store/salesLeadStore.js';
import type { PostPromise } from './socialSelling/flow.js';

interface CliOptions {
  inputPath?: string;
  execute: boolean;
  delayMs?: number;
  help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write([
      'Uso:',
      '  npx tsx src/recoverComments.ts --input ./manifest.json',
      '  npx tsx src/recoverComments.ts --input ./manifest.json --execute',
      '',
      'Sem --execute, nenhuma mensagem ou gravacao e feita.',
      '',
    ].join('\n'));
    return;
  }
  if (!options.inputPath) throw new CommentRecoveryValidationError('input_missing');

  const raw = await readManifest(options.inputPath);
  const manifest = validateCommentRecoveryManifest(raw);

  if (!options.execute) {
    const summary = await recoverComments({ manifest, execute: false, delayMs: options.delayMs });
    printJson(summary);
    return;
  }

  assertExecutionEnvironment();
  const dependencies = await createExecutionDependencies();
  const summary = await recoverComments({
    manifest,
    execute: true,
    delayMs: options.delayMs,
    dependencies,
  });
  printJson(summary);
  if (!summary.ok) process.exitCode = 1;
}

async function createExecutionDependencies(): Promise<CommentRecoveryDependencies> {
  const [instagram, repliedStore, leadContextStore, salesLeadStore, socialSelling] = await Promise.all([
    import('./instagram/client.js'),
    import('./store/repliedStore.js'),
    import('./store/leadContextStore.js'),
    import('./store/salesLeadStore.js'),
    import('./socialSelling/flow.js'),
  ]);

  const [store, ownUserId, contexts, salesLeads] = await Promise.all([
    repliedStore.loadStore(),
    instagram.resolveUserId(),
    leadContextStore.listLeadContexts(1_000),
    salesLeadStore.exportSalesLeads(1_000),
  ]);
  const ownUsername = await instagram.getAccountUsername(ownUserId);

  const contextsByComment = indexContextsByComment(contexts);
  const salesByComment = indexSalesByComment(salesLeads);

  async function persistLead(input: PersistLeadInput): Promise<void> {
    const promise: PostPromise = {
      kind: input.promiseKind,
      label: input.promiseLabel,
      privateReply: input.privateReply,
      publicReply: input.publicReply,
    };
    const initialTurn = socialSelling.buildSocialSellingTurn(input.commentText, promise);
    const at = new Date().toISOString();
    const interactions: LeadInteraction[] = [
      { at, direction: 'in', text: input.commentText },
    ];
    if (input.privateReplyKnownSent !== false) {
      interactions.push({ at, direction: 'out', text: input.privateReply });
    }

    await leadContextStore.saveLeadContext({
      senderId: input.senderId,
      commentId: input.commentId,
      username: input.username,
      postId: input.mediaId,
      postPermalink: input.postPermalink,
      promise,
      socialSelling: initialTurn.state,
      interactions,
    });
    await salesLeadStore.saveSalesLead({
      senderId: input.senderId,
      commentId: input.commentId,
      username: input.username,
      postId: input.mediaId,
      postPermalink: input.postPermalink,
      promiseLabel: promise.label,
      snapshot: initialTurn.sales,
      lastInbound: input.commentText,
      lastOutbound: input.privateReplyKnownSent === false ? '' : input.privateReply,
      interactions,
    });

    contextsByComment.set(input.commentId, input.senderId);
    salesByComment.set(input.commentId, input.senderId);
  }

  return {
    ownUsername,
    getComments: instagram.getComments,
    hasPrivateReply: (commentId) => store.hasPrivateReply(commentId),
    markPrivateReply: (commentId) => store.markPrivateReply(commentId),
    markPublicReply: (commentId) => store.markPublicReply(commentId),
    findPersistedLead: (commentId) => {
      const contextSenderId = contextsByComment.get(commentId);
      const salesSenderId = salesByComment.get(commentId);
      const senderId = contextSenderId || salesSenderId;
      if (!senderId) return undefined;
      return {
        senderId,
        complete: Boolean(
          contextSenderId
          && salesSenderId
          && contextSenderId === salesSenderId
        ),
      };
    },
    persistLead,
    sendPrivateReply: instagram.sendPrivateReply,
    replyToComment: instagram.replyToComment,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function indexContextsByComment(contexts: LeadContext[]): Map<string, string> {
  const indexed = new Map<string, string>();
  for (const context of contexts) {
    if (context.commentId && context.senderId) indexed.set(context.commentId, context.senderId);
  }
  return indexed;
}

function indexSalesByComment(leads: SalesLeadExport[]): Map<string, string> {
  const indexed = new Map<string, string>();
  for (const lead of leads) {
    if (lead.commentId && lead.senderId) indexed.set(lead.commentId, lead.senderId);
  }
  return indexed;
}

function assertExecutionEnvironment(): void {
  const missing = [
    'IG_ACCESS_TOKEN',
    'IG_USER_ID',
    'IG_PAGE_ID',
    'DYNAMODB_TABLE',
  ].filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new CommentRecoveryValidationError(`environment_missing_${missing.join('_').toLowerCase()}`);
  }
}

async function readManifest(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new CommentRecoveryValidationError('input_read_failed');
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CommentRecoveryValidationError('input_json_invalid');
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { execute: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--execute') {
      options.execute = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--input') {
      options.inputPath = requireArgValue(args, ++index, 'input_value_missing');
      continue;
    }
    if (arg === '--delay-ms') {
      const raw = requireArgValue(args, ++index, 'delay_ms_missing');
      const delayMs = Number(raw);
      if (!Number.isFinite(delayMs)) throw new CommentRecoveryValidationError('delay_ms_invalid');
      options.delayMs = delayMs;
      continue;
    }
    throw new CommentRecoveryValidationError('argument_unknown');
  }
  return options;
}

function requireArgValue(args: string[], index: number, code: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new CommentRecoveryValidationError(code);
  return value;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

void main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    const errorCode = error instanceof CommentRecoveryValidationError
      ? error.code
      : 'unexpected_failure';
    printJson({ ok: false, errorCode });
    process.exit(2);
  });
