import { DynamoDBClient, PutItemCommand, QueryCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { mirrorInBackground, mirrorLeadToAirtable } from '../crm/airtableMirror.js';
import type { SalesSnapshot } from '../sales/empresaAgentica.js';
import type { LeadInteraction } from './leadContextStore.js';

const tableName = process.env.DYNAMODB_TABLE?.trim() || '';
const storeAccount = process.env.STORE_ACCOUNT?.trim() || process.env.IG_USER_ID?.trim() || 'default';
const dynamo = new DynamoDBClient({});

export interface SalesLeadRecord {
  senderId: string;
  username?: string;
  commentId?: string;
  postId?: string;
  postPermalink?: string;
  promiseLabel: string;
  snapshot: SalesSnapshot;
  lastInbound: string;
  lastOutbound: string;
  interactions?: LeadInteraction[];
}

export interface SalesLeadExport {
  senderId: string;
  username?: string;
  commentId?: string;
  stage: string;
  score: number;
  temperature: string;
  icpFit: string;
  offer: string;
  promiseLabel: string;
  nextAction: string;
  crmTitle: string;
  crmNote: string;
  updatedAt: string;
  lastInbound?: string;
  lastOutbound?: string;
  interactions?: LeadInteraction[];
  postId?: string;
  postPermalink?: string;
  sync?: SalesLeadSyncState;
}

export interface SalesLeadSyncState {
  /** Metadados preservados somente para leitura de registros históricos. */
  provider: string;
  status: 'pending' | 'synced' | 'failed' | 'skipped';
  syncedAt?: string;
  error?: string;
  personId?: string;
  companyId?: string;
  opportunityId?: string;
  taskId?: string;
}

export async function saveSalesLead(record: SalesLeadRecord): Promise<void> {
  if (!tableName || !record.senderId) return;
  const updatedAt = new Date().toISOString();
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#sales-leads` },
      sk: { S: record.senderId },
      updatedAt: { S: updatedAt },
      score: { N: String(record.snapshot.score) },
      stage: { S: record.snapshot.stage },
      temperature: { S: record.snapshot.temperature },
      icpFit: { S: record.snapshot.icpFit },
      offer: { S: record.snapshot.offer },
      promiseLabel: { S: record.promiseLabel },
      nextAction: { S: record.snapshot.nextAction },
      crmTitle: { S: record.snapshot.crmTitle },
      crmNote: { S: record.snapshot.crmNote },
      data: { S: JSON.stringify({ ...record, updatedAt }) },
    },
  }));

  // O DynamoDB acabou de registrar a verdade; o Airtable é só a visão humana.
  mirrorInBackground('lead', () => mirrorLeadToAirtable({
    senderId: record.senderId,
    username: record.username,
    stage: record.snapshot.stage,
    score: record.snapshot.score,
    temperature: record.snapshot.temperature,
    offer: record.snapshot.offer,
    promiseLabel: record.promiseLabel,
    nextAction: record.snapshot.nextAction,
    lastInbound: record.lastInbound,
    lastOutbound: record.lastOutbound,
    postPermalink: record.postPermalink,
    updatedAt,
  }));
}

export async function exportSalesLeads(limit = 50): Promise<SalesLeadExport[]> {
  if (!tableName) return [];
  const response = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `${storeAccount}#sales-leads` },
    },
    Limit: limit,
    ScanIndexForward: false,
  }));

  return (response.Items || [])
    .map(parseSalesLead)
    .filter((item): item is SalesLeadExport => Boolean(item))
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));
}

function parseSalesLead(item: Record<string, AttributeValue>): SalesLeadExport | undefined {
  const raw = item.data?.S;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as (SalesLeadRecord & { updatedAt?: string }) | SalesLeadExport;
      if (!('snapshot' in parsed)) {
        return {
          ...parsed,
          sync: parsed.sync || parseSync(item.sync?.S),
        };
      }
      return {
        senderId: parsed.senderId,
        username: parsed.username,
        commentId: parsed.commentId,
        stage: parsed.snapshot.stage,
        score: parsed.snapshot.score,
        temperature: parsed.snapshot.temperature,
        icpFit: parsed.snapshot.icpFit,
        offer: parsed.snapshot.offerLabel,
        promiseLabel: parsed.promiseLabel,
        nextAction: parsed.snapshot.nextAction,
        crmTitle: parsed.snapshot.crmTitle,
        crmNote: parsed.snapshot.crmNote,
        updatedAt: parsed.updatedAt || item.updatedAt?.S || '',
        lastInbound: parsed.lastInbound,
        lastOutbound: parsed.lastOutbound,
        interactions: parsed.interactions,
        postId: parsed.postId,
        postPermalink: parsed.postPermalink,
        sync: parseSync(item.sync?.S) || (parsed as { sync?: SalesLeadSyncState }).sync,
      };
    } catch {
      // Fall through to flat fields.
    }
  }

  const senderId = item.sk?.S;
  if (!senderId) return undefined;
  return {
    senderId,
    stage: item.stage?.S || '',
    score: Number(item.score?.N || 0),
    temperature: item.temperature?.S || '',
    icpFit: item.icpFit?.S || '',
    offer: item.offer?.S || '',
    promiseLabel: item.promiseLabel?.S || '',
    nextAction: item.nextAction?.S || '',
    crmTitle: item.crmTitle?.S || '',
    crmNote: item.crmNote?.S || '',
    updatedAt: item.updatedAt?.S || '',
    sync: parseSync(item.sync?.S),
  };
}

function parseSync(raw?: string): SalesLeadSyncState | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as SalesLeadSyncState;
    if (parsed?.provider && parsed?.status) return parsed;
  } catch {
    return undefined;
  }
  return undefined;
}
