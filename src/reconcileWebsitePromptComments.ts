import 'dotenv/config';
import { createHash, createHmac } from 'node:crypto';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { WEBSITE_PROMPT_MEDIA_ID } from './campaignTrigger.js';
import {
  selectContactedCommentsWithoutContext,
  selectWebsitePromptFirstReplyCandidates,
  type AuditGraphComment,
} from './operations/websitePromptCommentAudit.js';
import type { LeadContext } from './store/leadContextStore.js';

interface Options {
  execute: boolean;
  replyLimit: number;
  backfillLimit: number;
}

const options = parseOptions(process.argv.slice(2));
const tableName = required('DYNAMODB_TABLE');
const storeAccount = required('STORE_ACCOUNT');
const token = required('IG_ACCESS_TOKEN');
const appSecret = required('IG_APP_SECRET');
const accountId = required('ZERNIO_ACCOUNT_ID');
const queueUrl = required('ZERNIO_AUTOMATION_QUEUE_URL');
const graphVersion = process.env.GRAPH_API_VERSION?.trim() || 'v21.0';
const ownUsername = process.env.IG_USERNAME?.trim() || 'saraiva.ai';
const dynamo = new DynamoDBClient({});
const sqs = new SQSClient({});

const [comments, contexts, privateMarkers] = await Promise.all([
  readAllComments(),
  readContexts(),
  readMarkers('private'),
]);
const firstReplies = selectWebsitePromptFirstReplyCandidates({
  comments,
  contexts,
  privateMarkers,
  ownUsername,
});
const backfills = selectContactedCommentsWithoutContext({ comments, contexts, ownUsername });

if (!options.execute) {
  print({
    mode: 'dry-run',
    comments: comments.length,
    firstReplyCandidates: firstReplies.length,
    contactedBackfillCandidates: backfills.length,
    selectedFirstReplies: Math.min(options.replyLimit, firstReplies.length),
    selectedBackfills: Math.min(options.backfillLimit, backfills.length),
  });
  process.exit(0);
}

const summary = {
  mode: 'execute',
  firstRepliesQueued: 0,
  firstRepliesFailed: 0,
  contextsBackfilled: 0,
  backfillsSkipped: 0,
  backfillsFailed: 0,
};
for (const comment of backfills.slice(0, options.backfillLimit)) {
  try {
    if (await backfillContext(comment)) summary.contextsBackfilled++;
    else summary.backfillsSkipped++;
  } catch {
    summary.backfillsFailed++;
  }
}
for (const comment of firstReplies.slice(0, options.replyLimit)) {
  try {
    await enqueueComment(comment);
    summary.firstRepliesQueued++;
  } catch {
    summary.firstRepliesFailed++;
  }
}
print(summary);
if (summary.firstRepliesFailed || summary.backfillsFailed) process.exitCode = 1;

async function backfillContext(comment: AuditGraphComment): Promise<boolean> {
  const senderId = comment.from!.id!;
  const observedAt = new Date().toISOString();
  const context: Omit<LeadContext, 'updatedAt'> = {
    senderId,
    commentId: comment.id,
    username: comment.from?.username || comment.username,
    postId: WEBSITE_PROMPT_MEDIA_ID,
    promise: {
      kind: 'website_prompt',
      label: 'Prompt gratuito usado no vídeo para criar sites com ChatGPT',
      privateReply: 'Você comentou SARAIVA para receber o prompt do vídeo.',
      publicReply: 'Te chamei no Direct para entregar o prompt 👀',
    },
    automationJournal: [{
      at: observedAt,
      action: 'backfill_contacted_comment',
      verifiedFacts: ['own_public_reply_observed', 'private_delivery_not_assumed'],
      rule: 'reconstruct_sender_mapping_without_new_message',
      result: 'context_backfilled',
      reasonCode: 'contacted_comment_context_backfilled',
    }],
    interactions: [{
      at: comment.timestamp || observedAt,
      direction: 'in',
      text: comment.text || 'comentário no Reel',
    }],
  };
  try {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#lead-context` },
        sk: { S: senderId },
        data: { S: JSON.stringify(context) },
        updatedAt: { S: observedAt },
        expiresAt: { N: String(Math.floor(Date.now() / 1_000) + 90 * 24 * 60 * 60) },
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

async function enqueueComment(comment: AuditGraphComment): Promise<void> {
  const eventId = `all-comments-recovery:${comment.id}`;
  const senderId = comment.from!.id!;
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      version: 'zernio-1',
      kind: 'comment',
      eventId,
      inbound: {
        eventId,
        commentId: comment.id,
        mediaId: WEBSITE_PROMPT_MEDIA_ID,
        accountId,
        senderId,
        username: comment.from?.username || comment.username,
        text: comment.text || 'SARAIVA',
        occurredAt: comment.timestamp || new Date().toISOString(),
      },
    }),
    MessageGroupId: `zernio-${senderId}`.slice(0, 128),
    MessageDeduplicationId: eventId.slice(0, 128),
  }));
}

async function readAllComments(): Promise<AuditGraphComment[]> {
  const comments: AuditGraphComment[] = [];
  const proof = createHmac('sha256', appSecret).update(token).digest('hex');
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${WEBSITE_PROMPT_MEDIA_ID}/comments`);
    url.searchParams.set('fields', 'id,text,timestamp,username,from,replies.limit(50){id,text,timestamp,username}');
    url.searchParams.set('limit', '100');
    url.searchParams.set('appsecret_proof', proof);
    if (after) url.searchParams.set('after', after);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`graph_comments_failed:${response.status}`);
    const body = await response.json() as {
      data?: AuditGraphComment[];
      paging?: { cursors?: { after?: string }; next?: string };
    };
    comments.push(...(body.data || []));
    process.stderr.write(`${JSON.stringify({ event: 'comments_page_read', page: page + 1, accumulated: comments.length })}\n`);
    after = body.paging?.next ? body.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return comments;
}

async function readContexts(): Promise<LeadContext[]> {
  const items = await queryPartition(`${storeAccount}#lead-context`);
  const contexts: LeadContext[] = [];
  for (const item of items) {
    try {
      const context = JSON.parse(item.data?.S || '') as Omit<LeadContext, 'updatedAt'>;
      if (context.postId === WEBSITE_PROMPT_MEDIA_ID) contexts.push({ ...context, updatedAt: item.updatedAt?.S || '' });
    } catch {
      // Ignora registro inválido sem interromper a reconciliação inteira.
    }
  }
  return contexts;
}

async function readMarkers(status: 'private' | 'public'): Promise<string[]> {
  return (await queryPartition(`${storeAccount}#${status}`))
    .map((item) => item.sk?.S)
    .filter((value): value is string => Boolean(value));
}

async function queryPartition(pk: string): Promise<Array<Record<string, AttributeValue>>> {
  const items: Array<Record<string, AttributeValue>> = [];
  let key: Record<string, AttributeValue> | undefined;
  do {
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: pk } },
      ExclusiveStartKey: key,
    }));
    items.push(...(response.Items || []));
    key = response.LastEvaluatedKey;
  } while (key);
  return items;
}

function parseOptions(args: string[]): Options {
  const options: Options = { execute: false, replyLimit: 1, backfillLimit: 500 };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--execute') options.execute = true;
    else if (args[index] === '--reply-limit') options.replyLimit = numberArg(args[++index], 0, 50);
    else if (args[index] === '--backfill-limit') options.backfillLimit = numberArg(args[++index], 0, 1_000);
    else throw new Error('argument_unknown');
  }
  return options;
}

function numberArg(raw: string | undefined, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('argument_invalid');
  return value;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
