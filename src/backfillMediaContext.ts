import fs from 'node:fs';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { resolvePostPromise } from './socialSelling/flow.js';
import { savePublishedMediaContext } from './store/mediaContextStore.js';

const tableName = process.env.DYNAMODB_TABLE?.trim() || '';
const storeAccount = process.env.STORE_ACCOUNT?.trim() || 'saraiva-os';
const calendarPath = process.env.CALENDAR_POSTS_PATH?.trim()
  || '/Users/saraiva/conversaOS/calendario/data/posts.json';
const dynamo = new DynamoDBClient({});

interface CalendarPost {
  slug: string;
  caption?: string;
  tema?: string;
  imageUrl?: string;
}

async function main() {
  if (!tableName) throw new Error('DYNAMODB_TABLE ausente.');
  const posts = readCalendarPosts();
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const published = await loadPublished();
  let updated = 0;
  let missing = 0;

  for (const item of published) {
    const post = bySlug.get(item.slug);
    const caption = post?.caption || item.slug;
    if (!post?.caption) {
      missing++;
      console.warn('Sem legenda no calendario para slug publicado; usando slug como contexto', item.slug);
    }
    const promise = resolvePostPromise({ postCaption: caption });
    await savePublishedMediaContext({
      slug: item.slug,
      mediaId: item.mediaId,
      caption,
      promise,
    });
    updated++;
    console.log(JSON.stringify({
      slug: item.slug,
      mediaId: item.mediaId,
      promise: promise.kind,
      label: promise.label,
    }));
  }

  console.log(JSON.stringify({
    updated,
    missing,
    totalPublished: published.length,
    calendarPath,
  }, null, 2));
}

function readCalendarPosts(): CalendarPost[] {
  const data = JSON.parse(fs.readFileSync(calendarPath, 'utf8')) as { posts?: CalendarPost[] };
  return data.posts || [];
}

async function loadPublished(): Promise<Array<{ slug: string; mediaId: string }>> {
  const items: Array<{ slug: string; mediaId: string }> = [];
  let ExclusiveStartKey: Record<string, { S: string }> | undefined;
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
      const slug = item.sk?.S;
      const mediaId = item.mediaId?.S;
      if (slug && mediaId) items.push({ slug, mediaId });
    }
    ExclusiveStartKey = response.LastEvaluatedKey as typeof ExclusiveStartKey;
  } while (ExclusiveStartKey);

  return items;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
