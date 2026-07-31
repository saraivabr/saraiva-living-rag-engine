import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { normalizePostPromise, type PostPromise } from '../socialSelling/flow.js';

const tableName = process.env.DYNAMODB_TABLE?.trim() || '';
const storeAccount = process.env.STORE_ACCOUNT?.trim() || process.env.IG_USER_ID?.trim() || 'default';
const dynamo = new DynamoDBClient({});

export interface PublishedMediaContext {
  slug: string;
  mediaId: string;
  caption?: string;
  permalink?: string;
  promise?: PostPromise;
  updatedAt?: string;
}

export async function loadPublishedMediaContextsById(): Promise<Map<string, PublishedMediaContext>> {
  const map = new Map<string, PublishedMediaContext>();
  if (!tableName) return map;

  let ExclusiveStartKey: Record<string, AttributeValue> | undefined;
  do {
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `${storeAccount}#published` },
      },
      ExclusiveStartKey,
    }));

    for (const item of response.Items || []) {
      const context = parsePublishedMediaContext(item);
      if (context?.mediaId) map.set(context.mediaId, context);
    }
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return map;
}

export async function savePublishedMediaContext(context: PublishedMediaContext): Promise<void> {
  if (!tableName || !context.slug || !context.mediaId) return;

  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#published` },
      sk: { S: context.slug },
      mediaId: { S: context.mediaId },
      ...(context.caption ? { caption: { S: context.caption } } : {}),
      ...(context.permalink ? { permalink: { S: context.permalink } } : {}),
      ...(context.promise ? {
        promiseKind: { S: context.promise.kind },
        promiseLabel: { S: context.promise.label },
        promisePublicReply: { S: context.promise.publicReply },
        promisePrivateReply: { S: context.promise.privateReply },
        promiseJson: { S: JSON.stringify(context.promise) },
      } : {}),
      updatedAt: { S: new Date().toISOString() },
    },
  }));
}

function parsePublishedMediaContext(item: Record<string, AttributeValue>): PublishedMediaContext | undefined {
  const slug = item.sk?.S;
  const mediaId = item.mediaId?.S;
  if (!slug || !mediaId) return undefined;

  return {
    slug,
    mediaId,
    caption: item.caption?.S,
    permalink: item.permalink?.S,
    promise: parsePromise(item),
    updatedAt: item.updatedAt?.S,
  };
}

function parsePromise(item: Record<string, AttributeValue>): PostPromise | undefined {
  const raw = item.promiseJson?.S;
  if (raw) {
    try {
      return normalizePostPromise(JSON.parse(raw) as PostPromise);
    } catch {
      // Fall through to individual fields.
    }
  }

  const kind = item.promiseKind?.S;
  const label = item.promiseLabel?.S;
  const publicReply = item.promisePublicReply?.S;
  const privateReply = item.promisePrivateReply?.S;
  if (!kind || !label || !publicReply || !privateReply) return undefined;

  return normalizePostPromise({ kind: kind as PostPromise['kind'], label, publicReply, privateReply });
}
