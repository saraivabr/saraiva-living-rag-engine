import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { DynamoDBClient, QueryCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  auditWebsitePromptComments,
  type AuditGraphComment,
} from './operations/websitePromptCommentAudit.js';
import type { LeadContext } from './store/leadContextStore.js';

const MEDIA_ID = '18130447453725127';
const tableName = required('DYNAMODB_TABLE');
const storeAccount = required('STORE_ACCOUNT');
const token = required('IG_ACCESS_TOKEN');
const appSecret = required('IG_APP_SECRET');
const graphVersion = process.env.GRAPH_API_VERSION?.trim() || 'v21.0';
const ownUsername = process.env.IG_USERNAME?.trim() || 'saraiva.ai';
const dynamo = new DynamoDBClient({});

const [comments, contexts, privateMarkers, publicMarkers] = await Promise.all([
  readAllComments(),
  readContexts(),
  readMarkers('private'),
  readMarkers('public'),
]);

process.stdout.write(`${JSON.stringify(auditWebsitePromptComments({
  comments,
  contexts,
  privateMarkers,
  publicMarkers,
  ownUsername,
}), null, 2)}\n`);

async function readAllComments(): Promise<AuditGraphComment[]> {
  const comments: AuditGraphComment[] = [];
  const proof = createHmac('sha256', appSecret).update(token).digest('hex');
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${MEDIA_ID}/comments`);
    url.searchParams.set('fields', 'id,text,timestamp,username,replies.limit(50){id,text,timestamp,username}');
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
    process.stderr.write(`${JSON.stringify({
      event: 'graph_comments_page_read',
      page: page + 1,
      accumulated: comments.length,
    })}\n`);
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
      if (context.postId === MEDIA_ID) contexts.push({ ...context, updatedAt: item.updatedAt?.S || '' });
    } catch {
      // Registro inválido fica fora da operação e aparece como lacuna de cobertura.
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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name.toLowerCase()}_missing`);
  return value;
}
