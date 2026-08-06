import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { normalizePostPromise, type PostPromise, type SocialSellingState } from '../socialSelling/flow.js';
import type { InstagramFlowSession } from '../instagram/automationFlow.js';
import type { ProfileFact } from '../instagram/profilePersonalization.js';

const tableName = process.env.DYNAMODB_TABLE?.trim() || 'respondedor-instagram-state';
const storeAccount = process.env.STORE_ACCOUNT?.trim() || process.env.IG_USER_ID?.trim() || 'default';
const dynamo = new DynamoDBClient({});

export interface LeadContext {
  senderId: string;
  commentId?: string;
  username?: string;
  postId?: string;
  postPermalink?: string;
  promise: PostPromise;
  socialSelling?: SocialSellingState;
  instagramFlow?: InstagramFlowSession;
  profileFacts?: ProfileFact[];
  automationJournal?: AutomationDecision[];
  personalizedOffer?: {
    reasonCode: 'audio_sent' | 'audio_fallback_text';
    script: string;
    audioMessageId?: string;
    audioAttempted?: boolean;
    textMessageId?: string;
    cardMessageId?: string;
    audioKey?: string;
  };
  interactions?: LeadInteraction[];
  updatedAt: string;
}

export interface LeadInteraction {
  at: string;
  direction: 'in' | 'out';
  text: string;
}

export interface AutomationDecision {
  at: string;
  action: string;
  verifiedFacts: string[];
  rule: string;
  result: string;
  reasonCode: string;
}

export async function saveLeadContext(context: Omit<LeadContext, 'updatedAt'>): Promise<void> {
  if (!tableName || !context.senderId) return;

  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#lead-context` },
      sk: { S: context.senderId },
      updatedAt: { S: new Date().toISOString() },
      expiresAt: { N: String(Math.floor(Date.now() / 1_000) + 90 * 24 * 60 * 60) },
      data: { S: JSON.stringify(context) },
    },
  }));
}

export async function getLeadContext(senderId: string): Promise<LeadContext | undefined> {
  if (!tableName || !senderId) return undefined;

  const response = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#lead-context` },
      sk: { S: senderId },
    },
    ConsistentRead: true,
  }));

  const raw = response.Item?.data?.S;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Omit<LeadContext, 'updatedAt'>;
    return {
      ...parsed,
      promise: normalizeStoredPromise(parsed.promise),
      updatedAt: response.Item?.updatedAt?.S || '',
    };
  } catch {
    return undefined;
  }
}

export async function listLeadContexts(limit = 200): Promise<LeadContext[]> {
  if (!tableName) return [];
  const contexts: LeadContext[] = [];
  let ExclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `${storeAccount}#lead-context` },
      },
      ExclusiveStartKey,
      Limit: Math.min(limit - contexts.length, 100),
    }));
    for (const item of response.Items || []) {
      const parsed = parseLeadContextItem(item);
      if (parsed) contexts.push(parsed);
      if (contexts.length >= limit) break;
    }
    ExclusiveStartKey = contexts.length >= limit ? undefined : response.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return contexts;
}

function parseLeadContextItem(item: Record<string, AttributeValue>): LeadContext | undefined {
  const raw = item.data?.S;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Omit<LeadContext, 'updatedAt'>;
    return {
      ...parsed,
      promise: normalizeStoredPromise(parsed.promise),
      updatedAt: item.updatedAt?.S || '',
    };
  } catch {
    return undefined;
  }
}

function normalizeStoredPromise(promise: PostPromise): PostPromise {
  const canonical = normalizePostPromise(promise);
  return {
    ...canonical,
    publicReply: removeOutdatedCta(canonical.publicReply),
    privateReply: removeOutdatedCta(canonical.privateReply),
  };
}

function removeOutdatedCta(text: string): string {
  return text
    .replace(/\n*me responde AULA que eu te direciono para a turma\.?/gi, '\n\nte explico por aqui o caminho certo.')
    .replace(/\n*responde AULA que eu te direciono para a turma\.?/gi, '\n\nte explico por aqui o caminho certo.')
    .replace(/\n*comente AULA[^.\n]*(?:\.|\n|$)/gi, '\n\nte explico por aqui o caminho certo.\n');
}
