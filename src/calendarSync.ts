import { createHmac } from 'node:crypto';
import { CreateInvalidationCommand, CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { DynamoDBClient, QueryCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from './config.js';
import { evaluateContentPolicy } from './content/contentPolicy.js';
import { resolvePostPromise } from './socialSelling/flow.js';

interface CalendarDocument {
  posts?: CalendarPost[];
  metricsUpdatedAt?: string;
  metricsSummary?: CalendarMetricsSummary;
  [key: string]: unknown;
}

interface CalendarPost {
  number?: number;
  slug: string;
  tipo?: string;
  tema?: string;
  imageUrl?: string;
  caption?: string;
  hashtags?: string[];
  ctaKeyword?: string | null;
  localTime?: string;
  utcTime?: string;
  scheduleExpression?: string | null;
  eventBridgeRule?: string | null;
  mediaId?: string;
  status?: string;
  permalink?: string;
  mediaType?: string;
  mediaProductType?: string;
  publishedAt?: string;
  metrics?: CalendarPostMetrics;
  metricsError?: {
    updatedAt: string;
    mediaId: string;
    source: string;
    error: string;
  };
  metricsUnavailable?: {
    updatedAt: string;
    mediaId: string;
    source: string;
    reason: string;
  };
  importedFromPublishedContext?: boolean;
  materialUrl?: string;
  materialKey?: string;
  promiseLabel?: string;
  [key: string]: unknown;
}

interface CalendarPostMetrics extends MetricTotals {
  updatedAt: string;
  source: string;
  mediaId: string;
  permalink?: string;
  mediaType?: string;
  mediaProductType?: string;
  publishedAt?: string;
}

interface MetricTotals {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  totalInteractions: number;
}

interface CalendarMetricsSummary {
  updatedAt: string;
  updated: number;
  skippedNoMediaId: number;
  errors: number;
  imported: number;
  totals: MetricTotals;
}

interface PublishedContext {
  slug: string;
  mediaId: string;
  caption?: string;
  permalink?: string;
  promiseLabel?: string;
  promiseKind?: string;
  updatedAt?: string;
}

interface GraphMedia {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  media_url?: string;
  thumbnail_url?: string;
}

interface GraphInsights {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number | string }>;
  }>;
}

export interface CalendarSyncSummary {
  ok: boolean;
  bucket: string;
  key: string;
  updatedAt: string;
  updated: number;
  imported: number;
  skippedNoMediaId: number;
  errors: Array<{ slug: string; mediaId: string; step: string; error: string }>;
  totals: MetricTotals;
  invalidationId?: string;
}

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});
const dynamo = new DynamoDBClient({});
const tableName = process.env.DYNAMODB_TABLE?.trim() || '';
const storeAccount = process.env.STORE_ACCOUNT?.trim() || 'saraiva-os';
const calendarBucket = process.env.CALENDAR_BUCKET?.trim() || 'calendario.saraiva.ai';
const calendarPostsKey = process.env.CALENDAR_POSTS_KEY?.trim() || 'data/posts.json';
const calendarDistributionId = process.env.CALENDAR_DISTRIBUTION_ID?.trim() || 'E3DUE7QRCA8R0H';
const insightMetrics = 'views,reach,saved,likes,comments,shares,total_interactions';

export async function syncCalendarBio(): Promise<CalendarSyncSummary> {
  if (!tableName) throw new Error('DYNAMODB_TABLE ausente.');

  const calendar = await loadCalendarDocument();
  const posts = Array.isArray(calendar.posts) ? calendar.posts : [];
  calendar.posts = posts;

  const publishedBySlug = await loadPublishedContexts();
  const postsBySlug = new Map(posts.map((post) => [post.slug, post]));
  let imported = 0;

  for (const [slug, published] of publishedBySlug) {
    if (postsBySlug.has(slug)) continue;
    const promise = resolvePostPromise({ postCaption: published.caption });
    const post: CalendarPost = {
      number: nextPostNumber(posts),
      slug,
      tipo: 'Publicado fora do calendario',
      tema: promise.label || titleFromSlug(slug),
      imageUrl: '',
      caption: published.caption || '',
      hashtags: [],
      ctaKeyword: null,
      localTime: '',
      utcTime: '',
      scheduleExpression: null,
      eventBridgeRule: null,
      mediaId: published.mediaId,
      status: 'publicado',
      importedFromPublishedContext: true,
      materialUrl: `./material.html?slug=${encodeURIComponent(slug)}`,
      materialKey: materialKeyFromContext(published.caption, published.promiseKind),
      promiseLabel: published.promiseLabel || promise.label,
    };
    posts.push(post);
    postsBySlug.set(slug, post);
    imported++;
  }

  const updatedAt = new Date().toISOString();
  const errors: CalendarSyncSummary['errors'] = [];
  let updated = 0;
  let skippedNoMediaId = 0;
  const totals = emptyTotals();

  for (const post of posts) {
    const published = publishedBySlug.get(post.slug);
    const mediaId = post.mediaId || published?.mediaId;
    post.materialUrl = post.materialUrl || `./material.html?slug=${encodeURIComponent(post.slug)}`;
    post.materialKey = post.materialKey || materialKeyFromContext(post.caption || published?.caption, published?.promiseKind);
    post.promiseLabel = post.promiseLabel || published?.promiseLabel || resolvePostPromise({ postCaption: post.caption || published?.caption }).label;

    if (!mediaId) {
      skippedNoMediaId++;
      continue;
    }

    try {
      const media = await graphGet<GraphMedia>(mediaId, {
        fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,media_url,thumbnail_url',
      });
      const insightData = await graphGet<GraphInsights>(`${mediaId}/insights`, { metric: insightMetrics })
        .catch((error) => {
          errors.push({ slug: post.slug, mediaId, step: 'insights', error: (error as Error).message });
          return { data: [] };
        });
      const insightValues = normalizeInsights(insightData.data || []);
      const postMetrics: CalendarPostMetrics = {
        updatedAt,
        source: 'instagram_graph_api',
        mediaId,
        permalink: media.permalink || published?.permalink || post.permalink,
        mediaType: media.media_type || post.mediaType,
        mediaProductType: media.media_product_type || post.mediaProductType,
        publishedAt: media.timestamp || post.publishedAt,
        views: numberValue(insightValues.views),
        reach: numberValue(insightValues.reach),
        likes: numberValue(insightValues.likes, media.like_count),
        comments: numberValue(insightValues.comments, media.comments_count),
        saved: numberValue(insightValues.saved),
        shares: numberValue(insightValues.shares),
        totalInteractions: numberValue(insightValues.total_interactions),
      };

      post.mediaId = mediaId;
      post.caption = post.caption || media.caption || published?.caption || '';
      post.imageUrl = post.imageUrl || media.thumbnail_url || media.media_url || '';
      post.permalink = postMetrics.permalink;
      post.mediaType = postMetrics.mediaType;
      post.mediaProductType = postMetrics.mediaProductType;
      post.publishedAt = postMetrics.publishedAt;
      post.utcTime = post.utcTime || toUtcIso(media.timestamp);
      post.localTime = post.localTime || toLocalTime(media.timestamp);
      post.status = 'publicado';
      post.metrics = postMetrics;
      post.policy = evaluateContentPolicy({
        mediaProductType: postMetrics.mediaProductType,
        publishAt: postMetrics.publishedAt,
        caption: post.caption,
        hashtags: post.hashtags,
      });
      delete post.metricsError;
      delete post.metricsUnavailable;
      updated++;
      addTotals(totals, postMetrics);
    } catch (error) {
      const message = (error as Error).message;
      post.metricsError = {
        updatedAt,
        mediaId,
        source: 'instagram_graph_api',
        error: message,
      };
      post.metricsUnavailable = {
        updatedAt,
        mediaId,
        source: 'instagram_graph_api',
        reason: classifyMetricsUnavailableReason(message),
      };
      const fallbackDate = published?.updatedAt || updatedAt;
      post.utcTime = post.utcTime || toUtcIso(fallbackDate);
      post.localTime = post.localTime || toLocalTime(fallbackDate);
      errors.push({ slug: post.slug, mediaId, step: 'media', error: message });
    }
  }

  calendar.metricsUpdatedAt = updatedAt;
  calendar.metricsSummary = {
    updatedAt,
    updated,
    skippedNoMediaId,
    errors: errors.length,
    imported,
    totals,
  };

  await saveCalendarDocument(calendar);
  const invalidationId = await invalidateCalendarData().catch((error) => {
    console.warn('Falha ao invalidar CloudFront do calendario:', (error as Error).message);
    return undefined;
  });

  return {
    ok: true,
    bucket: calendarBucket,
    key: calendarPostsKey,
    updatedAt,
    updated,
    imported,
    skippedNoMediaId,
    errors,
    totals,
    invalidationId,
  };
}

async function loadCalendarDocument(): Promise<CalendarDocument> {
  const response = await s3.send(new GetObjectCommand({
    Bucket: calendarBucket,
    Key: calendarPostsKey,
  }));
  const body = response.Body as { transformToString?: () => Promise<string> } | undefined;
  const text = await body?.transformToString?.();
  if (!text) throw new Error(`S3 object vazio: s3://${calendarBucket}/${calendarPostsKey}`);
  return JSON.parse(text) as CalendarDocument;
}

async function saveCalendarDocument(calendar: CalendarDocument): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: calendarBucket,
    Key: calendarPostsKey,
    Body: `${JSON.stringify(calendar, null, 2)}\n`,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache, max-age=0',
  }));
}

async function invalidateCalendarData(): Promise<string | undefined> {
  if (!calendarDistributionId) return undefined;
  const response = await cloudfront.send(new CreateInvalidationCommand({
    DistributionId: calendarDistributionId,
    InvalidationBatch: {
      CallerReference: `calendar-sync-${Date.now()}`,
      Paths: {
        Quantity: 3,
        Items: ['/data/posts.json', '/links.html', '/material.html'],
      },
    },
  }));
  return response.Invalidation?.Id;
}

async function loadPublishedContexts(): Promise<Map<string, PublishedContext>> {
  const map = new Map<string, PublishedContext>();
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
      const context = parsePublishedContext(item);
      if (context) map.set(context.slug, context);
    }
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return map;
}

function parsePublishedContext(item: Record<string, AttributeValue>): PublishedContext | undefined {
  const slug = item.sk?.S;
  const mediaId = item.mediaId?.S;
  if (!slug || !mediaId) return undefined;
  return {
    slug,
    mediaId,
    caption: item.caption?.S,
    permalink: item.permalink?.S,
    promiseLabel: item.promiseLabel?.S,
    promiseKind: item.promiseKind?.S,
    updatedAt: item.updatedAt?.S,
  };
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${config.ig.apiVersion}/${path}`);
  url.searchParams.set('access_token', config.ig.accessToken);
  const proof = graphProof();
  if (proof) url.searchParams.set('appsecret_proof', proof);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url);
  const body = await res.json() as { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message || `Graph API HTTP ${res.status}`);
  return body as T;
}

function graphProof(): string | undefined {
  const secret = config.ig.appSecret;
  if (!secret) return undefined;
  return createHmac('sha256', secret).update(config.ig.accessToken).digest('hex');
}

function normalizeInsights(data: NonNullable<GraphInsights['data']>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const metric of data) {
    if (!metric.name) continue;
    out[metric.name] = metric.values?.[0]?.value ?? 0;
  }
  return out;
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function emptyTotals(): MetricTotals {
  return {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    saved: 0,
    shares: 0,
    totalInteractions: 0,
  };
}

function addTotals(totals: MetricTotals, postMetrics: MetricTotals): void {
  totals.views += postMetrics.views;
  totals.reach += postMetrics.reach;
  totals.likes += postMetrics.likes;
  totals.comments += postMetrics.comments;
  totals.saved += postMetrics.saved;
  totals.shares += postMetrics.shares;
  totals.totalInteractions += postMetrics.totalInteractions;
}

function nextPostNumber(posts: CalendarPost[]): number {
  return Math.max(0, ...posts.map((post) => Number(post.number || 0)).filter(Number.isFinite)) + 1;
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function materialKeyFromContext(caption = '', promiseKind = ''): string {
  const context = `${caption} ${promiseKind}`.toLowerCase();
  if (has(context, ['workshop', 'elevenlabs', 'wavoip', 'ligacao', 'ligação'])) return 'workshop';
  if (has(context, ['prompt', 'carrossel', 'roteiro'])) return 'prompt';
  if (has(context, ['whatsapp', 'atendimento', 'direct', 'inbox'])) return 'whatsapp';
  if (has(context, ['vendas', 'lead', 'follow-up', 'sdr'])) return 'vendas';
  if (has(context, ['diagnostico', 'diagnóstico', 'padrao', 'padrão', 'processo', 'sistema', 'contexto'])) return 'diagnostico';
  return 'diagnostico';
}

function classifyMetricsUnavailableReason(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('does not exist') || lower.includes('missing permissions') || lower.includes('unsupported get request')) {
    return 'media_inacessivel_ou_sem_permissao_no_graph_api';
  }
  return 'falha_ao_ler_metricas_no_graph_api';
}

function has(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function toUtcIso(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function toLocalTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  return `${parts} -03`;
}
