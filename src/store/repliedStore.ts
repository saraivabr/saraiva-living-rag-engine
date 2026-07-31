import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';

/**
 * Persistência simples em arquivo JSON dos comentários já respondidos.
 * Evita responder o mesmo comentário duas vezes entre reinícios.
 * Para volume alto, troque por SQLite/Redis mantendo a mesma interface.
 */

const STORE_PATH = resolve(process.cwd(), 'data', 'replied.json');
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE?.trim() || '';
const STORE_ACCOUNT = process.env.STORE_ACCOUNT?.trim() || process.env.IG_USER_ID?.trim() || 'default';

export interface RepliedStore {
  hasPublicReply(commentId: string): boolean;
  hasPrivateReply(commentId: string): boolean;
  markPublicReply(commentId: string): Promise<void>;
  markPrivateReply(commentId: string): Promise<void>;
}

export async function loadStore(): Promise<RepliedStore> {
  if (DYNAMODB_TABLE) return loadDynamoStore();
  return loadFileStore();
}

async function loadDynamoStore(): Promise<RepliedStore> {
  const client = new DynamoDBClient({});
  const publicReplies = new Set<string>();
  const privateReplies = new Set<string>();

  async function loadStatus(status: 'public' | 'private', target: Set<string>): Promise<void> {
    const response = await client.send(new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `${STORE_ACCOUNT}#${status}` },
      },
      ProjectionExpression: 'sk',
    }));
    for (const item of response.Items ?? []) {
      if (item.sk?.S) target.add(item.sk.S);
    }
  }

  await Promise.all([
    loadStatus('public', publicReplies),
    loadStatus('private', privateReplies),
  ]);

  async function mark(status: 'public' | 'private', commentId: string): Promise<void> {
    await client.send(new PutItemCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        pk: { S: `${STORE_ACCOUNT}#${status}` },
        sk: { S: commentId },
        updatedAt: { S: new Date().toISOString() },
      },
    }));
  }

  return {
    hasPublicReply: (commentId) => publicReplies.has(commentId),
    hasPrivateReply: (commentId) => privateReplies.has(commentId),
    markPublicReply: async (commentId) => {
      publicReplies.add(commentId);
      await mark('public', commentId);
    },
    markPrivateReply: async (commentId) => {
      privateReplies.add(commentId);
      await mark('private', commentId);
    },
  };
}

async function loadFileStore(): Promise<RepliedStore> {
  const publicReplies = new Set<string>();
  const privateReplies = new Set<string>();

  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as string[] | { publicReplies?: string[]; privateReplies?: string[] };
    if (Array.isArray(parsed)) {
      for (const id of parsed) publicReplies.add(id);
    } else {
      for (const id of parsed.publicReplies ?? []) publicReplies.add(id);
      for (const id of parsed.privateReplies ?? []) privateReplies.add(id);
    }
  } catch {
    // arquivo ainda não existe — começa vazio
  }

  async function persist(): Promise<void> {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await writeFile(
      STORE_PATH,
      JSON.stringify({
        publicReplies: [...publicReplies],
        privateReplies: [...privateReplies],
      }, null, 2),
      'utf8',
    );
  }

  return {
    hasPublicReply: (commentId) => publicReplies.has(commentId),
    hasPrivateReply: (commentId) => privateReplies.has(commentId),
    markPublicReply: async (commentId) => {
      publicReplies.add(commentId);
      await persist();
    },
    markPrivateReply: async (commentId) => {
      privateReplies.add(commentId);
      await persist();
    },
  };
}
