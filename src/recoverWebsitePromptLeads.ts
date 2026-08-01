import 'dotenv/config';
import { createHash } from 'node:crypto';
import {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { getZernioCredentials } from './zernio/credentials.js';
import { sendZernioInteractive } from './zernio/client.js';
import type { LeadContext } from './store/leadContextStore.js';
import {
  buildWebsitePromptRecoveryCandidate,
  completeWebsitePromptRecoveryContext,
  prepareWebsitePromptRecoveryContext,
} from './operations/websitePromptLeadRecovery.js';

interface Options {
  execute: boolean;
  limit: number;
  delayMs: number;
}

const options = parseOptions(process.argv.slice(2));
const tableName = required('DYNAMODB_TABLE');
const storeAccount = required('STORE_ACCOUNT');
const accountId = options.execute ? required('ZERNIO_ACCOUNT_ID') : '';
const dynamo = new DynamoDBClient({});

const contexts = await listContexts();
const now = new Date();
const candidates = contexts
  .map((context) => buildWebsitePromptRecoveryCandidate(context, { now }))
  .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
  .sort((a, b) => b.lastInboundAt.localeCompare(a.lastInboundAt));

if (!options.execute) {
  print({
    mode: 'dry-run',
    checked: contexts.length,
    eligible: candidates.length,
    selected: candidates.slice(0, options.limit).map((candidate) => ({
      lead: anonymize(candidate.context.senderId),
      stage: candidate.context.instagramFlow?.stage,
      lastInboundAt: candidate.lastInboundAt,
    })),
  });
  process.exit(0);
}

const credentials = await getZernioCredentials();
const summary = { mode: 'execute', eligible: candidates.length, selected: 0, sent: 0, skipped: 0, failed: 0 };
for (const candidate of candidates.slice(0, options.limit)) {
  summary.selected++;
  const currentCandidate = buildWebsitePromptRecoveryCandidate(candidate.context, { now: new Date() });
  if (!currentCandidate) {
    summary.skipped++;
    continue;
  }
  const lockId = `website-prompt-lead-recovery#${candidate.context.instagramFlow!.correlationId}`;
  if (!(await acquireLock(lockId))) {
    summary.skipped++;
    continue;
  }

  const preparedAt = new Date().toISOString();
  const prepared = prepareWebsitePromptRecoveryContext(currentCandidate, preparedAt);
  try {
    const preparedSaved = await conditionalSave(candidate.context, prepared, preparedAt);
    if (!preparedSaved) {
      await releaseLock(lockId);
      summary.skipped++;
      continue;
    }

    const messageId = await sendZernioInteractive({
      apiKey: credentials.apiKey,
      accountId,
      conversationId: candidate.context.instagramFlow!.conversationId!,
      message: currentCandidate.message,
      reconcileSince: candidate.context.updatedAt,
    });
    const sentAt = new Date().toISOString();
    const completed = completeWebsitePromptRecoveryContext(prepared, { sentAt, messageId });
    await conditionalSaveRaw(candidate.context.senderId, preparedAt, completed, sentAt);
    await completeLock(lockId, messageId);
    summary.sent++;
    if (options.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  } catch (error) {
    await releaseLock(lockId);
    summary.failed++;
    process.stderr.write(`${JSON.stringify({
      lead: anonymize(candidate.context.senderId),
      error: safeError(error),
    })}\n`);
  }
}
print(summary);
if (summary.failed > 0) process.exitCode = 1;

async function listContexts(): Promise<LeadContext[]> {
  const values: LeadContext[] = [];
  let key: Record<string, AttributeValue> | undefined;
  do {
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: `${storeAccount}#lead-context` } },
      ExclusiveStartKey: key,
    }));
    for (const item of response.Items || []) {
      try {
        const context = JSON.parse(item.data?.S || '') as Omit<LeadContext, 'updatedAt'>;
        values.push({ ...context, updatedAt: item.updatedAt?.S || '' });
      } catch {
        // Registro inválido não entra em operação.
      }
    }
    key = response.LastEvaluatedKey;
  } while (key);
  return values;
}

async function conditionalSave(
  previous: LeadContext,
  next: Omit<LeadContext, 'updatedAt'>,
  updatedAt: string,
): Promise<boolean> {
  return conditionalSaveRaw(previous.senderId, previous.updatedAt, next, updatedAt);
}

async function conditionalSaveRaw(
  senderId: string,
  expectedUpdatedAt: string,
  next: Omit<LeadContext, 'updatedAt'>,
  updatedAt: string,
): Promise<boolean> {
  try {
    await dynamo.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { pk: { S: `${storeAccount}#lead-context` }, sk: { S: senderId } },
      UpdateExpression: 'SET #data = :data, updatedAt = :updatedAt, expiresAt = :expiresAt',
      ConditionExpression: 'updatedAt = :expectedUpdatedAt',
      ExpressionAttributeNames: { '#data': 'data' },
      ExpressionAttributeValues: {
        ':data': { S: JSON.stringify(next) },
        ':updatedAt': { S: updatedAt },
        ':expectedUpdatedAt': { S: expectedUpdatedAt },
        ':expiresAt': { N: String(Math.floor(Date.now() / 1_000) + 90 * 24 * 60 * 60) },
      },
    }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

async function acquireLock(lockId: string): Promise<boolean> {
  try {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#webhook` },
        sk: { S: lockId },
        status: { S: 'leased' },
        updatedAt: { S: new Date().toISOString() },
        expiresAt: { N: String(Math.floor(Date.now() / 1_000) + 7 * 24 * 60 * 60) },
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

async function completeLock(lockId: string, messageId: string): Promise<void> {
  await dynamo.send(new UpdateItemCommand({
    TableName: tableName,
    Key: { pk: { S: `${storeAccount}#webhook` }, sk: { S: lockId } },
    UpdateExpression: 'SET #status = :status, externalId = :externalId, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': { S: 'completed' },
      ':externalId': { S: messageId },
      ':updatedAt': { S: new Date().toISOString() },
    },
  }));
}

async function releaseLock(lockId: string): Promise<void> {
  await dynamo.send(new DeleteItemCommand({
    TableName: tableName,
    Key: { pk: { S: `${storeAccount}#webhook` }, sk: { S: lockId } },
  }));
}

function parseOptions(args: string[]): Options {
  const parsed: Options = { execute: false, limit: 1, delayMs: 2_000 };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--execute') parsed.execute = true;
    else if (args[index] === '--limit') parsed.limit = boundedNumber(args[++index], 1, 25, 'limit');
    else if (args[index] === '--delay-ms') parsed.delayMs = boundedNumber(args[++index], 0, 60_000, 'delay-ms');
    else throw new Error('argument_unknown');
  }
  return parsed;
}

function boundedNumber(raw: string | undefined, min: number, max: number, name: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}_invalid`);
  return value;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}

function anonymize(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown';
  return message.replace(/[^a-z0-9:_-]/gi, '_').slice(0, 100);
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
