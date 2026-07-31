import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';

const tableName = process.env.DYNAMODB_TABLE?.trim() || 'respondedor-instagram-state';
const storeAccount = process.env.STORE_ACCOUNT?.trim() || process.env.IG_USER_ID?.trim() || 'saraiva-os';
const dynamo = new DynamoDBClient({});

export interface SecondBrainHypothesis {
  id: string;
  title: string;
  description: string;
  variableTested: 'private_reply' | 'audio_script' | 'cta_button';
  variantA: string;
  variantB?: string;
  exposures: number;
  clicks: number;
  conversionRate: number;
  status: 'TESTING' | 'VALIDATED' | 'REJECTED';
  startedAt: string;
  concludedAt?: string;
}

export interface KnowledgeInsight {
  id: string;
  topic: string;
  insight: string;
  confidenceScore: number;
  sourceHypothesisId?: string;
  createdAt: string;
}

export interface DailyBrainMetrics {
  date: string;
  totalLeadsStarted: number;
  totalAudiosDelivered: number;
  totalWhatsappClicks: number;
  overallConversionRate: number;
  topPerformingHypothesisId?: string;
}

export async function saveHypothesis(hypothesis: SecondBrainHypothesis): Promise<void> {
  if (!tableName) return;
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#second-brain#hypotheses` },
      sk: { S: hypothesis.id },
      updatedAt: { S: new Date().toISOString() },
      data: { S: JSON.stringify(hypothesis) },
    },
  }));
}

export async function getHypothesis(id: string): Promise<SecondBrainHypothesis | undefined> {
  if (!tableName) return undefined;
  const res = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#second-brain#hypotheses` },
      sk: { S: id },
    },
  }));
  if (!res.Item?.data?.S) return undefined;
  try {
    return JSON.parse(res.Item.data.S) as SecondBrainHypothesis;
  } catch {
    return undefined;
  }
}

export async function listHypotheses(): Promise<SecondBrainHypothesis[]> {
  if (!tableName) return [];
  const res = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `${storeAccount}#second-brain#hypotheses` },
    },
  }));

  const items: SecondBrainHypothesis[] = [];
  for (const item of res.Items || []) {
    if (item.data?.S) {
      try {
        items.push(JSON.parse(item.data.S));
      } catch {}
    }
  }
  return items;
}

export async function saveKnowledgeInsight(insight: KnowledgeInsight): Promise<void> {
  if (!tableName) return;
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#second-brain#knowledge` },
      sk: { S: insight.id },
      updatedAt: { S: new Date().toISOString() },
      data: { S: JSON.stringify(insight) },
    },
  }));
}

export async function listKnowledgeInsights(): Promise<KnowledgeInsight[]> {
  if (!tableName) return [];
  const res = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `${storeAccount}#second-brain#knowledge` },
    },
  }));

  const items: KnowledgeInsight[] = [];
  for (const item of res.Items || []) {
    if (item.data?.S) {
      try {
        items.push(JSON.parse(item.data.S));
      } catch {}
    }
  }
  return items;
}
