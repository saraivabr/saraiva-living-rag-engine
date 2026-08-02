import { runCycle } from './responder.js';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  type AttributeValue,
  type QueryCommandInput,
  type TransactWriteItemsCommandInput,
} from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getAccountUsername,
  getComments,
  getInstagramUserProfile,
  getMediaById,
  replyToComment,
  resolveUserId,
  sendDirectMessage,
  sendDirectInteractive,
  sendPrivateReply,
  sendPrivateReplyInteractive,
} from './instagram/client.js';
import {
  advanceInstagramFlow,
  createCommunityCtaCard,
  createCommunityDestinationUrl,
  createInstagramCommentFlow,
  createStorefrontProductDestinationUrl,
  isInstagramFlowOptOut,
  isInstagramFlowResume,
  pauseInstagramFlow,
  recoverInstagramFlowSessionForInbound,
  resumeInstagramFlowMessage,
  shouldAdvanceInstagramFlow,
  summarizeInteractiveMessage,
  verifyTrackedFlowSignature,
  type TrackedFlowKind,
  type InstagramFlowStep,
  type InstagramFlowSession,
} from './instagram/automationFlow.js';
import { generateConversationalFlowReply } from './instagram/conversationalFlow.js';
import { buildSafeProfileBrief } from './instagram/profilePersonalization.js';
import { deliverPersonalizedOffer, deliverStandaloneSaraivaAudio } from './instagram/personalizedOffer.js';
import {
  buildAbandonmentAudioCandidate,
  buildWebsitePromptFollowUpCandidate,
} from './instagram/abandonmentFollowUp.js';
import {
  parseInstagramAutomationCommand,
  type InstagramAutomationCommandV1,
  type InstagramAutomationOutcomeV1,
} from './instagram/automationCommand.js';
import { getLeadContext, listLeadContexts, saveLeadContext, type AutomationDecision, type LeadContext, type LeadInteraction } from './store/leadContextStore.js';
import { loadPublishedMediaContextsById, savePublishedMediaContext } from './store/mediaContextStore.js';
import { loadStore } from './store/repliedStore.js';
import { exportSalesLeads, saveSalesLead, type SalesLeadExport } from './store/salesLeadStore.js';
import {
  buildDirectContinuation,
  buildSocialSellingTurn,
  resolveCommentCampaignCopy,
  resolveKnownMediaPromise,
  resolvePostPromise,
  websiteCampaignVariantCount,
} from './socialSelling/flow.js';
import { config } from './config.js';
import { syncCalendarBio, type CalendarSyncSummary } from './calendarSync.js';
import { buildSalesSnapshot } from './sales/empresaAgentica.js';
import { findUnansweredLeads, type ReengagementCandidate } from './sales/reengagement.js';
import { buildSocialSellingTaskPack, type SocialSellingTaskPack } from './sales/taskPack.js';
import { isMediaDisabled } from './disabledMedia.js';
import { isTargetWebhookEntry } from './webhookTarget.js';
import { chatraceContextCandidates, chatraceFallbackSenderId } from './chatraceIdentity.js';
import { generateBedrockSalesReply, type BedrockSalesReplyResult } from './ai/bedrockSalesResponder.js';
import { isAuthorizedSyntheticValidation } from './chatraceSecurity.js';
import {
  matchesCampaignTrigger,
  matchesMediaCampaignTrigger,
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from './campaignTrigger.js';
import {
  AGENCY_SUBSCRIPTION_VALUE_CENTS,
  buildWebsiteGuideCheckoutReply,
  createWebsiteGuideCharge,
  getAgencySubscription,
  getWebsiteGuideCharge,
  isAgencySubscriptionActive,
  isWebsiteGuideCheckoutIntent,
  parseCompletedGuidePayment,
  verifyWooviWebhook,
  WEBSITE_GUIDE_PRODUCT,
  WEBSITE_GUIDE_VALUE_CENTS,
  isSupportedWebsiteGuideValue,
  websiteGuideCorrelationId,
  type WooviCharge,
  type WooviChargeStatus,
  type AgencySubscription,
} from './payments/woovi.js';
import {
  buildClientReadyKit,
  buildReadySitePrompt,
  businessPromptData,
  lookupBusinessWithApify,
  type BusinessPromptData,
  type ClientReadyKit,
} from './automation/sitePromptAutomation.js';
import { getApifyToken } from './automation/apifyToken.js';
import { getZernioCredentials } from './zernio/credentials.js';
import { handleZernioWebhook } from './zernio/handler.js';
import {
  isZernioWebhookPath,
  type ZernioCommentInboundV1,
  type ZernioLifecycleInboundV1,
  type ZernioMessageInboundV1,
} from './zernio/webhook.js';
import {
  findZernioCommentReply,
  findRecentZernioAudioMessage,
  isTerminalZernioConversationError,
  replyZernioComment,
  sendZernioInteractive,
  sendZernioPrivateReply,
} from './zernio/client.js';

interface LambdaEvent {
  Records?: Array<{
    messageId?: string;
    body?: string;
    attributes?: { ApproximateReceiveCount?: string };
    eventSource?: string;
    eventSourceARN?: string;
    awsRegion?: string;
  }>;
  action?: string;
  limit?: number;
  dryRun?: boolean;
  shortcodes?: string[];
  slug?: string;
  imageUrl?: string;
  videoUrl?: string;
  urls?: string[];
  caption?: string;
  mediaId?: string;
  rawPath?: string;
  path?: string;
  requestContext?: { http?: { method?: string; path?: string; sourceIp?: string } };
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface PlannerUploadFile {
  name?: string;
  contentType?: string;
  size?: number;
}

interface PlannerScheduleRequest {
  pin?: string;
  mode?: 'carousel' | 'photos';
  slug?: string;
  caption?: string;
  captions?: string[];
  urls?: string[];
  folder?: string;
  startAfter?: string;
  slots?: string[];
}

interface ScheduledQueueItem {
  pk: { S: string };
  sk: { S: string };
  payload?: { S: string };
  slug?: { S: string };
  dueAt?: { S: string };
}

interface LambdaResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

interface CycleResponse {
  ok: boolean;
  finishedAt: string;
  scheduledPublished?: number;
  calendarSync?: CalendarSyncSummary;
  leads?: SalesLeadExport[];
  reengagement?: ReengagementSummary;
  messagingAccess?: InstagramMessagingAccess;
  socialSellingTaskPack?: SocialSellingTaskPack;
  instagramEngagement?: InstagramEngagementReport;
  commentCampaignPreview?: CommentCampaignPreview;
  commentCampaignRun?: CommentCampaignRunSummary;
  websiteGuidePayments?: WebsiteGuidePaymentPollSummary;
  abandonmentAudioFollowUps?: AbandonmentAudioFollowUpSummary;
  abandonmentTextFollowUps?: AbandonmentAudioFollowUpSummary;
  report?: string;
  zernioAudioRepair?: {
    repaired: boolean;
    reason?: string;
    reasonCode?: string;
    messageId?: string;
  };
}

interface AbandonmentAudioFollowUpSummary {
  checked: number;
  eligible: number;
  sent: number;
  failed: number;
}

interface SqsBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

interface CommentCampaignRunSummary {
  mode: 'dry-run' | 'execute';
  mediaId: string;
  attempted: number;
  handled: number;
  remainingEligible: number;
  variants: Record<string, number>;
}

interface CommentCampaignPreview {
  checkedAt: string;
  accountUsername: string;
  media: {
    id: string;
    permalink?: string;
    caption?: string;
  };
  promise: {
    kind: string;
    label: string;
    publicReply: string;
    privateReply: string;
  };
  replyRotation: {
    variants: number;
    distribution: Array<{
      variant: string;
      comments: number;
    }>;
    examples: Array<{
      variant: string;
      publicReply: string;
    }>;
  };
  totals: {
    comments: number;
    matched: number;
    ownPublicReply: number;
    privateMarked: number;
    eligibleForRecovery: number;
  };
  comments: Array<{
    commentId: string;
    username?: string;
    text: string;
    timestamp?: string;
    matched: boolean;
    hasOwnPublicReply: boolean;
    privateMarked: boolean;
    variant?: string;
  }>;
}

interface WebsiteGuidePaymentRecord {
  correlationId: string;
  senderId: string;
  value: number;
  status: string;
  paymentLinkUrl: string;
  createdAt: string;
  accessType?: 'free' | 'paid' | 'subscription';
  accessGrantedAt?: string;
  upgradedFrom?: string;
  generationLimit?: number;
  lead?: WebsiteGuideLeadProfile;
  transactionId?: string;
  paidAt?: string;
  deliveredAt?: string;
  generationCount?: number;
  automation?: {
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    inputHash: string;
    businessInput: string;
    locationInput?: string;
    startedAt?: string;
    lockExpiresAt?: string;
    business?: BusinessPromptData;
    prompt?: string;
    kit?: ClientReadyKit;
    generatedAt?: string;
    error?: string;
  };
  automationHistory?: Array<{
    status: string;
    businessName?: string;
    businessInput?: string;
    generatedAt?: string;
    resetAt: string;
  }>;
}

export const WEBSITE_GUIDE_GENERATION_LIMIT = 10;
export const WEBSITE_GUIDE_FREE_GENERATION_LIMIT = 1;

interface WebsiteGuideLeadProfile {
  name: string;
  email: string;
  whatsapp: string;
  city?: string;
  marketingConsent: boolean;
  termsAcceptedAt: string;
  source: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
}

interface WebsiteGuideAdminOrder {
  correlationId: string;
  value: number;
  status: string;
  accessType: 'free' | 'paid' | 'subscription';
  createdAt: string;
  accessGrantedAt?: string;
  paidAt?: string;
  deliveredAt?: string;
  lead?: WebsiteGuideLeadProfile;
  upgradedFrom?: string;
  automationStatus: 'NOT_STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  businessName?: string;
  businessInput?: string;
  locationInput?: string;
  generatedAt?: string;
  error?: string;
  resetCount: number;
  generationCount: number;
  generationLimit: number;
  generationRemaining: number;
}

interface AgencySubscriptionRecord {
  correlationId: string;
  sessionId: string;
  globalId: string;
  value: number;
  status: string;
  pixRecurringStatus: string;
  paymentLinkUrl: string;
  createdAt: string;
  approvedAt?: string;
}

interface WebsiteGuideCheckoutIntent {
  senderId: string;
  orderId: string;
  correlationId: string;
  updatedAt: string;
}

interface WebsiteGuidePaymentPollSummary {
  checked: number;
  completed: number;
  failed: number;
}

interface InstagramEngagementReport {
  checkedAt: string;
  igUserId: string;
  fetched: number;
  targetLinks: InstagramEngagementMedia[];
  topWeighted: InstagramEngagementMedia[];
  topViews: InstagramEngagementMedia[];
  topComments: InstagramEngagementMedia[];
  topSaved: InstagramEngagementMedia[];
  topShares: InstagramEngagementMedia[];
  automationJourneys: Array<{
    correlationId: string;
    username?: string;
    stage: string;
    path?: string;
    verifiedFacts: LeadContext['profileFacts'];
    script?: string;
    audioStatus?: string;
    decisions: LeadContext['automationJournal'];
    updatedAt: string;
  }>;
}

interface InstagramEngagementMedia {
  id: string;
  shortcode: string;
  permalink?: string;
  timestamp?: string;
  mediaType?: string;
  product?: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  interactions: number;
  score: number;
  caption: string;
  insightsError?: string;
}

interface ReengagementSummary {
  preview: boolean;
  blockedReason?: string;
  candidates: Array<{
    senderId: string;
    username?: string;
    score: number;
    stage: string;
    temperature: string;
    reason: string;
    message: string;
  }>;
  sent: number;
  failed: number;
  errors: Array<{ senderId: string; error: string }>;
}

interface InstagramMessagingAccess {
  ok: boolean;
  checkedAt: string;
  igUserId: string;
  igUsername?: string;
  pageId?: string;
  pageName?: string;
  canReadConversations: boolean;
  error?: {
    message: string;
    code?: number;
    subcode?: number;
    type?: string;
    fbtraceId?: string;
  };
}

interface ChatraceReplyResponse {
  ok: boolean;
  reply: string;
  message: string;
  text: string;
  resposta_comentario_gpt: string;
  'respostacomentário_gpt': string;
  lead: {
    senderId: string;
    username?: string;
    stage: string;
    score: number;
    temperature: string;
    nextAction: string;
    shouldEscalate: boolean;
  };
  customFields: Record<string, string | number | boolean>;
  ownerSummary: string;
}

interface ChatraceInbound {
  senderId: string;
  username?: string;
  text: string;
  postId?: string;
  commentId?: string;
  postPermalink?: string;
  requestId: string;
  accountUsername: string;
  flowId: string;
}

interface ChatraceCommit {
  senderId: string;
  commentId?: string;
  username?: string;
  postId?: string;
  postPermalink?: string;
  promise: ReturnType<typeof resolvePostPromise>;
  socialSelling: ReturnType<typeof buildSocialSellingTurn>['state'];
  interactions: LeadInteraction[];
  sales: ReturnType<typeof buildSocialSellingTurn>['sales'];
  promiseLabel: string;
  lastInbound: string;
  lastOutbound: string;
  shouldNotifyOwner: boolean;
  ownerSummary: string;
}

interface ChatracePreparedReply {
  response: ChatraceReplyResponse;
  commit: ChatraceCommit;
  expectedContextUpdatedAt?: string;
}

interface ChatraceClaimResult {
  claimed: boolean;
  cached?: ChatracePreparedReply;
}

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});
const sqs = new SQSClient({});
const tableName = process.env.DYNAMODB_TABLE?.trim() || '';
const storeAccount = process.env.STORE_ACCOUNT?.trim() || 'saraiva-os';
const plannerBucket = process.env.PLANNER_S3_BUCKET?.trim() || 'app-dino-coworking-clinic-880690593918';
const plannerPrefixBase = process.env.PLANNER_S3_PREFIX?.trim() || 'instagram/saraiva-os';
const plannerPublicBase = process.env.PLANNER_PUBLIC_BASE?.trim() || `https://${plannerBucket}.s3.amazonaws.com`;
const plannerDefaultSlots = ['09:00', '12:00', '15:00', '18:00'];
const websiteGuideBucket = process.env.WEBSITE_GUIDE_S3_BUCKET?.trim() || plannerBucket;
const websiteGuideKey = process.env.WEBSITE_GUIDE_S3_KEY?.trim()
  || 'products/sites-chatgpt/apostila-sites-chatgpt-v1.pdf';
const clientReadyPluginKey = 'instagram/saraiva-os/cliente-pronto-extension-v0.1.0.zip';
const ZERNIO_ABANDONMENT_AUDIO_ACTIVATION_AT = Date.parse('2026-07-31T05:44:53.000Z');

type ScheduledPublishResponse = { ok: boolean; slug: string; mediaId: string };

export async function handler(event?: LambdaEvent): Promise<CycleResponse | ScheduledPublishResponse | LambdaResponse | CalendarSyncSummary | SqsBatchResponse> {
  if (event?.Records?.length) {
    return handleInstagramAutomationRecords(event.Records);
  }
  if (event?.requestContext?.http?.method || event?.httpMethod || event?.queryStringParameters) {
    return handleHttp(event);
  }

  if (event?.action === 'publishCarousel') {
    return publishScheduledCarousel(event);
  }

  if (event?.action === 'publishImage') {
    return publishScheduledImage(event);
  }

  if (event?.action === 'publishVideo') {
    return publishScheduledVideo(event);
  }

  if (event?.action === 'syncCalendarBio' || event?.action === 'syncCalendar') {
    return syncCalendarBio();
  }

  if (event?.action === 'exportSalesLeads') {
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      leads: await exportSalesLeads(100),
    };
  }

  if (event?.action === 'backfillSalesLeads') {
    const count = await backfillSalesLeads();
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      scheduledPublished: 0,
      leads: await exportSalesLeads(100),
      backfilled: count,
    } as CycleResponse & { backfilled: number };
  }

  if (event?.action === 'validateInstagramMessagingAccess') {
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      messagingAccess: await validateInstagramMessagingAccess(),
    };
  }

  if (event?.action === 'exportInstagramEngagementReport') {
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      instagramEngagement: await exportInstagramEngagementReport({
        limit: Number((event as LambdaEvent).limit || 100),
        shortcodes: (event as LambdaEvent).shortcodes || [],
      }),
    };
  }

  if (event?.action === 'exportSecondBrainReport') {
    const { exportSecondBrainMarkdownReport } = await import('./secondBrain/insightsReporter.js');
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      report: await exportSecondBrainMarkdownReport(),
    } as unknown as CycleResponse;
  }

  if (event?.action === 'previewCommentCampaign') {
    const mediaId = String(event.mediaId || '').trim();
    if (!/^\d{10,30}$/.test(mediaId)) {
      throw new Error('mediaId invalido para previewCommentCampaign');
    }
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      commentCampaignPreview: await previewCommentCampaign(mediaId),
    };
  }

  if (event?.action === 'runCommentCampaign') {
    const mediaId = String(event.mediaId || '').trim();
    if (!/^\d{10,30}$/.test(mediaId)) {
      throw new Error('mediaId invalido para runCommentCampaign');
    }
    const requestedLive = event.dryRun === false;
    const execute = requestedLive && !config.behavior.dryRun;
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      commentCampaignRun: await runCommentCampaignBatch({
        mediaId,
        limit: Math.min(Math.max(Number(event.limit || 5), 1), 15),
        execute,
      }),
    };
  }

  if (event?.action === 'pollWebsiteGuidePayments') {
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      websiteGuidePayments: await pollWebsiteGuidePayments(),
    };
  }

  if (event?.action === 'listUnansweredLeads') {
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      reengagement: await buildReengagementSummary({ preview: true, limit: Number((event as LambdaEvent & { limit?: number }).limit || 25) }),
    };
  }

  if (event?.action === 'followUpUnansweredLeads') {
    const requestedLive = (event as LambdaEvent & { dryRun?: boolean }).dryRun === false;
    const blockedBySingleResponder = requestedLive
      && (config.behavior.dryRun || config.behavior.chatraceEnabled);
    const reengagement = await buildReengagementSummary({
      preview: !requestedLive || blockedBySingleResponder,
      limit: Math.min(Number((event as LambdaEvent & { limit?: number }).limit || 5), 10),
    });
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      reengagement: blockedBySingleResponder ? {
        ...reengagement,
        blockedReason: config.behavior.dryRun
          ? 'DRY_RUN=true bloqueia follow-up proativo.'
          : 'Chatrace ativo e configurado como unico emissor do Direct.',
      } : reengagement,
    };
  }

  if (event?.action === 'exportSocialSellingTaskPack') {
    const limit = Number((event as LambdaEvent & { limit?: number }).limit || 100);
    const leads = await exportSalesLeads(Math.max(limit, 100));
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      socialSellingTaskPack: buildSocialSellingTaskPack(leads, limit),
    };
  }

  if (event?.action === 'repairLatestZernioAudio') {
    return repairLatestZernioAudio();
  }

  try {
    const scheduled = await publishDueScheduledPosts();
    const abandonmentAudioFollowUps = await runZernioAbandonmentAudioFollowUps();
    const abandonmentTextFollowUps = await runWebsitePromptTextFollowUps();
    const websiteGuidePayments = await pollWebsiteGuidePayments();
    await runCycle();
    const calendarSync = await syncCalendarAfterCycle(scheduled.length > 0);
    return {
      ok: true,
      finishedAt: new Date().toISOString(),
      scheduledPublished: scheduled.length,
      abandonmentAudioFollowUps,
      abandonmentTextFollowUps,
      websiteGuidePayments,
      ...(calendarSync ? { calendarSync } : {}),
    };
  } catch (error) {
    await notifySystemOnce(
      'fatal-cycle',
      [
        '🚨 Instagram responder falhou no ciclo automatico',
        '',
        `Erro: ${(error as Error).message}`,
      ].join('\n'),
    );
    throw error;
  }
}

async function repairLatestZernioAudio(): Promise<CycleResponse> {
  const finishedAt = new Date().toISOString();
  const mode = process.env.ZERNIO_SEXYFLOW_MODE?.trim() || 'shadow';
  if (mode === 'shadow') return {
    ok: false,
    finishedAt,
    zernioAudioRepair: { repaired: false, reason: 'shadow_mode' },
  };

  const accountId = process.env.ZERNIO_ACCOUNT_ID?.trim();
  if (!accountId) return {
    ok: false,
    finishedAt,
    zernioAudioRepair: { repaired: false, reason: 'account_missing' },
  };
  const credentials = await getZernioCredentials();
  if (credentials.canarySenderIds?.length) {
    process.env.ZERNIO_CANARY_SENDER_IDS = credentials.canarySenderIds.join(',');
  }

  const candidate = (await listLeadContexts(500))
    .filter((context) =>
      isZernioFlowMedia(context.postId)
      && context.instagramFlow?.conversationId
      && context.personalizedOffer?.reasonCode === 'audio_fallback_text'
      && !context.personalizedOffer.audioMessageId
      && isZernioLiveForSender(context.senderId, mode))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (!candidate?.instagramFlow?.conversationId || !candidate.personalizedOffer) {
    return {
      ok: true,
      finishedAt,
      zernioAudioRepair: { repaired: false, reason: 'no_candidate' },
    };
  }

  const existingAudioMessageId = await findRecentZernioAudioMessage({
    apiKey: credentials.apiKey,
    accountId,
    conversationId: candidate.instagramFlow.conversationId,
    since: candidate.personalizedOffer.audioAttempted
      ? candidate.instagramFlow.updatedAt
      : candidate.instagramFlow.startedAt,
  });
  const delivered = existingAudioMessageId
    ? {
        messageId: existingAudioMessageId,
        audioKey: candidate.personalizedOffer.audioKey || '',
      }
    : await deliverStandaloneSaraivaAudio(
        candidate.senderId,
        candidate.instagramFlow.correlationId,
        candidate.personalizedOffer.script,
        async (_recipientId, message) => sendZernioInteractive({
          apiKey: credentials.apiKey,
          accountId,
          conversationId: candidate.instagramFlow!.conversationId!,
          message,
        }),
      );
  const repairedAt = new Date().toISOString();
  await saveLeadContext({
    ...candidate,
    instagramFlow: {
      ...candidate.instagramFlow,
      updatedAt: repairedAt,
    },
    personalizedOffer: {
      ...candidate.personalizedOffer,
      reasonCode: 'audio_sent',
      audioMessageId: delivered.messageId,
      audioKey: delivered.audioKey,
    },
    automationJournal: [
      ...(candidate.automationJournal || []),
      {
        at: repairedAt,
        action: 'repair_audio_transport',
        verifiedFacts: ['zernio_message_id'],
        rule: 'single_latest_canary_audio_fallback',
        result: 'audio_sent',
        reasonCode: 'audio_sent',
      },
    ].slice(-100),
    interactions: [
      ...(candidate.interactions || []),
      { at: repairedAt, direction: 'out', text: '[áudio personalizado corrigido]' },
    ],
  });
  return {
    ok: true,
    finishedAt,
    zernioAudioRepair: {
      repaired: true,
      reasonCode: 'audio_sent',
      messageId: anonymizeForLog(delivered.messageId),
    },
  };
}

async function handleInstagramAutomationRecords(
  records: NonNullable<LambdaEvent['Records']>,
): Promise<SqsBatchResponse> {
  if (process.env.INSTAGRAM_AUTOMATION_ROUTING_ENABLED !== 'true') {
    console.info('Fila Instagram recebida com roteamento desativado', { records: records.length });
    return {
      batchItemFailures: records.map((record) => ({
        itemIdentifier: record.messageId || 'missing-message-id',
      })),
    };
  }
  if (!tableName) throw new Error('instagram_automation_dynamodb_table_missing');
  const expectedQueueArn = process.env.INSTAGRAM_AUTOMATION_QUEUE_ARN?.trim();
  if (!expectedQueueArn) throw new Error('instagram_automation_queue_arn_missing');
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];
  for (const record of records) {
    const itemIdentifier = record.messageId || 'missing-message-id';
    const receiveCount = Number(record.attributes?.ApproximateReceiveCount || 1);
    let commandKey: string | undefined;
    let commandType = 'unknown';
    let eventTag = anonymizeForLog(itemIdentifier);
    try {
      if (
        !record.messageId
        || record.eventSource !== 'aws:sqs'
        || record.eventSourceARN !== expectedQueueArn
      ) {
        throw new Error('instagram_automation_queue_source_invalid');
      }
      const zernioCommand = parseZernioAutomationCommand(record.body || '');
      if (zernioCommand) {
        commandType = `zernio:${zernioCommand.kind}`;
        eventTag = anonymizeForLog(zernioCommand.eventId);
        const credentials = await getZernioCredentials();
        if (credentials.communityLinkSecret) {
          process.env.INSTAGRAM_COMMUNITY_LINK_SECRET = credentials.communityLinkSecret;
        }
        if (credentials.canarySenderIds?.length) {
          process.env.ZERNIO_CANARY_SENDER_IDS = credentials.canarySenderIds.join(',');
        }
        if (zernioCommand.kind === 'comment') {
          await processZernioComment(zernioCommand.inbound, credentials.apiKey);
        } else if (zernioCommand.kind === 'message') {
          await processZernioMessage(zernioCommand.inbound, credentials.apiKey);
        } else if (zernioCommand.kind === 'example_opened') {
          await processZernioExampleOpened(zernioCommand.inbound, credentials.apiKey);
        } else {
          await processZernioLifecycle(zernioCommand.inbound);
        }
        console.info('zernio_automation_outcome', {
          eventId: zernioCommand.eventId,
          kind: zernioCommand.kind,
          status: 'completed',
        });
        continue;
      }
      const command = parseInstagramAutomationCommand(record.body || '');
      commandType = `instagram:${command.action}`;
      eventTag = anonymizeForLog(command.commandId);
      const ageMs = Date.now() - Date.parse(command.occurredAt);
      if (ageMs < -5 * 60_000 || ageMs > 24 * 60 * 60_000) {
        throw new Error('instagram_automation_command_stale');
      }
      commandKey = `automation-command#${command.commandId}`;
      if (!(await markOnce(commandKey))) continue;
      const handled = await handleInstagramAutomationCommand(command, receiveCount < 5);
      const senderId = command.person.instagramScopedId;
      const context = senderId ? await getLeadContext(senderId) : undefined;
      const latestDecision = context?.automationJournal?.at(-1);
      const outcome: InstagramAutomationOutcomeV1 = {
        version: '1',
        commandId: command.commandId,
        correlationId: command.correlationId,
        campaignId: command.campaignId,
        action: command.action,
        stage: context?.instagramFlow?.stage || 'awaiting_request',
        status: handled > 0 ? 'completed' : 'ignored',
        reasonCode: latestDecision?.reasonCode || (handled > 0 ? 'command_completed' : 'duplicate_ignored'),
        metrics: { handled },
        occurredAt: new Date().toISOString(),
      };
      console.info('instagram_automation_outcome', outcome);
    } catch (error) {
      if (commandKey) await clearOnce(commandKey);
      batchItemFailures.push({ itemIdentifier });
      const safeErrorCode = extractSafeErrorCode((error as Error).message);
      console.warn('instagram_automation_command_failed', {
        event: eventTag,
        commandType,
        receiveCount,
        safeErrorCode,
      });
      if (receiveCount >= 5) {
        console.error('Comando Instagram pausado após esgotar tentativas', {
          itemIdentifier: anonymizeForLog(itemIdentifier),
          safeErrorCode,
        });
      }
    }
  }
  return { batchItemFailures };
}

function extractSafeErrorCode(message?: string): string {
  if (!message) return 'unknown_error';
  const match = message.match(/^([a-z0-9_:-]+)/i);
  const code = match ? match[1] : 'internal_error';
  return code.slice(0, 50);
}

async function handleInstagramAutomationCommand(
  command: InstagramAutomationCommandV1,
  rethrowAutomationFailure: boolean,
): Promise<number> {
  const entryId = config.ig.userId || config.ig.pageId || 'instagram-automation';
  if (command.action === 'start_from_comment' && command.comment) {
    return handleWebhookPayload({
      object: 'instagram',
      entry: [{
        id: entryId,
        changes: [{
          field: 'comments',
          value: {
            id: command.comment.id,
            text: command.comment.text,
            from: {
              id: command.person.instagramScopedId,
              username: command.person.username,
            },
            media: { id: command.comment.mediaId },
            correlation_id: command.correlationId,
          },
        }],
      }],
    }, { rethrowAutomationFailure });
  }
  if (command.interaction && command.person.instagramScopedId) {
    return handleWebhookPayload({
      object: 'instagram',
      entry: [{
        id: entryId,
        messaging: [{
          sender: { id: command.person.instagramScopedId },
          message: command.source === 'instagram.quick_reply.received'
            ? {
                mid: command.interaction.id,
                text: command.interaction.text,
                quick_reply: { payload: command.interaction.payload },
              }
            : undefined,
          postback: command.source === 'instagram.postback.received'
            ? {
                mid: command.interaction.id,
                title: command.interaction.text,
                payload: command.interaction.payload,
              }
            : undefined,
        }],
      }],
    }, { rethrowAutomationFailure });
  }
  return 0;
}

async function buildReengagementSummary(options: { preview: boolean; limit: number }): Promise<ReengagementSummary> {
  const leads = await exportSalesLeads(Math.max(options.limit, 100));
  const candidates = findUnansweredLeads(leads, options.limit);
  const summary: ReengagementSummary = {
    preview: options.preview,
    candidates: candidates.map(formatReengagementCandidate),
    sent: 0,
    failed: 0,
    errors: [],
  };

  if (options.preview) return summary;

  const messagingAccess = await validateInstagramMessagingAccess();
  if (!messagingAccess.canReadConversations) {
    return {
      ...summary,
      preview: true,
      blockedReason: messagingAccess.error?.message || 'Instagram Messaging API sem Advanced Access ativo para este app.',
    };
  }

  for (const candidate of candidates) {
    const lockId = `reengagement#${candidate.lead.senderId}#${hashText(candidate.message)}`;
    if (!(await markOnce(lockId))) continue;
    try {
      await sendDirectMessage(candidate.lead.senderId, candidate.message);
      await appendOutboundReengagement(candidate, candidate.message);
      summary.sent++;
    } catch (error) {
      summary.failed++;
      summary.errors.push({ senderId: candidate.lead.senderId, error: (error as Error).message });
      await clearOnce(lockId);
    }
  }

  return summary;
}

async function validateInstagramMessagingAccess(): Promise<InstagramMessagingAccess> {
  const igUserId = config.ig.userId;
  const pageId = config.ig.pageId;
  const conversationsPath = pageId ? `/${pageId}/conversations` : `/${igUserId}/conversations`;
  const [igUser, page, conversations] = await Promise.all([
    graphGetRaw(`/${igUserId}`, { fields: 'id,username' }),
    pageId ? graphGetRaw(`/${pageId}`, { fields: 'id,name,instagram_business_account' }) : Promise.resolve(undefined),
    graphGetRaw(conversationsPath, { platform: 'instagram', limit: '1' }),
  ]);

  const conversationError = conversations?.error as {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
    fbtrace_id?: string;
  } | undefined;
  return {
    ok: Boolean(igUser?.id),
    checkedAt: new Date().toISOString(),
    igUserId,
    igUsername: typeof igUser?.username === 'string' ? igUser.username : undefined,
    pageId,
    pageName: typeof page?.name === 'string' ? page.name : undefined,
    canReadConversations: !conversationError && Array.isArray(conversations?.data),
    error: conversationError ? {
      message: conversationError.message || 'Graph API bloqueou acesso a conversas do Instagram.',
      code: conversationError.code,
      subcode: conversationError.error_subcode,
      type: conversationError.type,
      fbtraceId: conversationError.fbtrace_id,
    } : undefined,
  };
}

async function exportInstagramEngagementReport(input: { limit: number; shortcodes: string[] }): Promise<InstagramEngagementReport> {
  const limit = Math.min(Math.max(input.limit || 100, 1), 300);
  const targetShortcodes = new Set(input.shortcodes.filter(Boolean));
  const media = await listInstagramMedia(limit);
  const enriched: InstagramEngagementMedia[] = [];

  for (const item of media) {
    const insights = await loadMediaInsights(item.id);
    const mediaRow = normalizeEngagementMedia(item, insights);
    enriched.push(mediaRow);
  }
  const contexts = await listLeadContexts(300);

  return {
    checkedAt: new Date().toISOString(),
    igUserId: config.ig.userId,
    fetched: enriched.length,
    targetLinks: enriched.filter((item) => targetShortcodes.has(item.shortcode)),
    topWeighted: sortTop(enriched, (item) => item.score),
    topViews: sortTop(enriched, (item) => item.views),
    topComments: sortTop(enriched, (item) => item.comments),
    topSaved: sortTop(enriched, (item) => item.saved),
    topShares: sortTop(enriched, (item) => item.shares),
    automationJourneys: contexts
      .filter((context) => context.instagramFlow?.id === 'saraiva-prospecting-v1')
      .map((context) => ({
        correlationId: context.instagramFlow!.correlationId,
        username: context.username,
        stage: context.instagramFlow!.stage,
        path: context.instagramFlow!.path,
        verifiedFacts: context.profileFacts,
        script: context.personalizedOffer?.script,
        audioStatus: context.personalizedOffer?.reasonCode,
        decisions: context.automationJournal,
        updatedAt: context.updatedAt,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

interface GraphMediaList {
  data?: GraphMediaItem[];
  paging?: { next?: string };
}

interface GraphMediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

interface GraphInsightList {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number | string }>;
  }>;
}

interface MediaInsightValues {
  values: Record<string, number>;
  error?: string;
}

async function listInstagramMedia(limit: number): Promise<GraphMediaItem[]> {
  const media: GraphMediaItem[] = [];
  let nextUrl: string | undefined;

  while (media.length < limit) {
    const remaining = Math.min(100, limit - media.length);
    const response: GraphMediaList = nextUrl
      ? await graphGetAbsolute<GraphMediaList>(nextUrl)
      : await graphGet<GraphMediaList>(`${config.ig.userId}/media`, {
        fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
        limit: String(remaining),
      });

    media.push(...(response.data || []));
    nextUrl = response.paging?.next;
    if (!nextUrl || !response.data?.length) break;
  }

  return media.slice(0, limit);
}

async function loadMediaInsights(mediaId: string): Promise<MediaInsightValues> {
  try {
    const response = await graphGet<GraphInsightList>(`${mediaId}/insights`, {
      metric: 'views,reach,saved,likes,comments,shares,total_interactions',
    });
    const values: Record<string, number> = {};
    for (const metric of response.data || []) {
      if (!metric.name) continue;
      values[metric.name] = Number(metric.values?.[0]?.value || 0);
    }
    return { values };
  } catch (error) {
    return { values: {}, error: (error as Error).message };
  }
}

function normalizeEngagementMedia(item: GraphMediaItem, insights: MediaInsightValues): InstagramEngagementMedia {
  const views = numberMetric(insights.values.views);
  const reach = numberMetric(insights.values.reach);
  const likes = numberMetric(insights.values.likes, item.like_count);
  const comments = numberMetric(insights.values.comments, item.comments_count);
  const saved = numberMetric(insights.values.saved);
  const shares = numberMetric(insights.values.shares);
  const interactions = numberMetric(insights.values.total_interactions);
  return {
    id: item.id,
    shortcode: extractShortcode(item.permalink || ''),
    permalink: item.permalink,
    timestamp: item.timestamp,
    mediaType: item.media_type,
    product: item.media_product_type,
    views,
    reach,
    likes,
    comments,
    saved,
    shares,
    interactions,
    score: weightedEngagementScore({ views, comments, saved, shares, interactions }),
    caption: compactText(item.caption || '').slice(0, 500),
    insightsError: insights.error,
  };
}

function sortTop(items: InstagramEngagementMedia[], score: (item: InstagramEngagementMedia) => number): InstagramEngagementMedia[] {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, 20);
}

function weightedEngagementScore(input: { views: number; comments: number; saved: number; shares: number; interactions: number }): number {
  return Number((input.comments * 5 + input.saved * 4 + input.shares * 4 + input.interactions * 2 + input.views / 20).toFixed(2));
}

function numberMetric(...values: unknown[]): number {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function extractShortcode(permalink: string): string {
  return permalink.match(/\/p\/([^/]+)/)?.[1] || '';
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function graphGetRaw(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${config.ig.apiVersion}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('access_token', config.ig.accessToken);
  const response = await fetch(url);
  const jsonBody = await response.json() as Record<string, unknown>;
  return jsonBody;
}

function formatReengagementCandidate(candidate: ReengagementCandidate): ReengagementSummary['candidates'][number] {
  return {
    senderId: candidate.lead.senderId,
    username: candidate.lead.username,
    score: candidate.lead.score,
    stage: candidate.lead.stage,
    temperature: candidate.lead.temperature,
    reason: candidate.reason,
    message: candidate.message,
  };
}

async function appendOutboundReengagement(candidate: ReengagementCandidate, message: string): Promise<void> {
  const context = await getLeadContext(candidate.lead.senderId);
  if (!context) return;
  const interactions = [
    ...(context.interactions || []),
    { at: new Date().toISOString(), direction: 'out' as const, text: message },
  ];
  await saveLeadContext({
    senderId: context.senderId,
    commentId: context.commentId,
    username: context.username,
    postId: context.postId,
    postPermalink: context.postPermalink,
    promise: context.promise,
    socialSelling: context.socialSelling,
    instagramFlow: context.instagramFlow,
    profileFacts: context.profileFacts,
    automationJournal: context.automationJournal,
    personalizedOffer: context.personalizedOffer,
    interactions,
  });
}

function hashText(textValue: string): string {
  return createHmac('sha256', process.env.IG_APP_SECRET || 'reengagement')
    .update(textValue)
    .digest('hex')
    .slice(0, 16);
}

async function backfillSalesLeads(): Promise<number> {
  const contexts = await listLeadContexts(300);
  let count = 0;
  for (const context of contexts) {
    const lastInbound = [...(context.interactions || [])].reverse().find((item) => item.direction === 'in')?.text || 'lead veio do Instagram';
    const lastOutbound = [...(context.interactions || [])].reverse().find((item) => item.direction === 'out')?.text || context.promise.privateReply;
    const state = context.socialSelling || buildSocialSellingTurn(lastInbound, context.promise).state;
    const snapshot = buildSalesSnapshot(state, context.promise, lastInbound);
    await saveSalesLead({
      senderId: context.senderId,
      commentId: context.commentId,
      username: context.username,
      postId: context.postId,
      postPermalink: context.postPermalink,
      promiseLabel: context.promise.label,
      snapshot,
      lastInbound,
      lastOutbound,
      interactions: context.interactions,
    });
    count++;
  }
  return count;
}

async function syncCalendarAfterCycle(force: boolean): Promise<CalendarSyncSummary | undefined> {
  const bucketMinutes = Number(process.env.CALENDAR_SYNC_MINUTES || 60);
  const intervalMinutes = Number.isFinite(bucketMinutes) && bucketMinutes > 0 ? bucketMinutes : 60;
  const now = new Date();
  const bucket = Math.floor(now.getTime() / (intervalMinutes * 60 * 1000));

  if (!force && !(await markOnce(`calendar-sync#${intervalMinutes}m#${bucket}`))) {
    return undefined;
  }

  try {
    const summary = await syncCalendarBio();
    console.info('Calendario sincronizado', {
      updated: summary.updated,
      imported: summary.imported,
      errors: summary.errors.length,
      invalidationId: summary.invalidationId,
    });
    return summary;
  } catch (error) {
    if (!force) await clearOnce(`calendar-sync#${intervalMinutes}m#${bucket}`);
    console.warn('Falha ao sincronizar calendario', { error: (error as Error).message });
    await notifySystemOnce(
      'calendar-sync',
      [
        '🚨 Falha ao sincronizar calendario do Instagram',
        '',
        `Erro: ${(error as Error).message}`,
      ].join('\n'),
    );
    return undefined;
  }
}

async function publishDueScheduledPosts(): Promise<string[]> {
  if (!tableName) return [];
  const now = new Date().toISOString();
  const response = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND sk <= :max',
    ExpressionAttributeValues: {
      ':pk': { S: `${storeAccount}#scheduled` },
      ':max': { S: `due#${now}~` },
    },
    Limit: 5,
  }));

  const published: string[] = [];
  for (const item of (response.Items || []) as unknown as ScheduledQueueItem[]) {
    const payloadRaw = item.payload?.S;
    const key = item.sk.S;
    if (!payloadRaw) {
      await deleteScheduledQueueItem(key);
      continue;
    }

    try {
      const payload = JSON.parse(payloadRaw) as LambdaEvent;
      if (payload.action === 'publishImage') {
        const result = await publishScheduledImage(payload);
        published.push(result.slug);
      } else if (payload.action === 'publishCarousel') {
        const result = await publishScheduledCarousel(payload);
        published.push(result.slug);
      } else {
        console.warn('Item agendado ignorado por action invalida', { key, action: payload.action });
      }
      await deleteScheduledQueueItem(key);
    } catch (error) {
      console.error('Falha ao publicar item agendado', {
        key,
        slug: item.slug?.S,
        dueAt: item.dueAt?.S,
        error: (error as Error).message,
      });
      await notifySystemOnce(
        `scheduled-publish-${item.slug?.S || key}`,
        [
          '🚨 Falha ao publicar post agendado do Instagram',
          '',
          `Item: ${item.slug?.S || key}`,
          `Erro: ${(error as Error).message}`,
        ].join('\n'),
      );
    }
  }

  if (published.length) {
    console.info('Posts agendados publicados pela fila', { count: published.length, slugs: published });
  }
  return published;
}

async function deleteScheduledQueueItem(sk: string): Promise<void> {
  if (!tableName) return;
  await dynamo.send(new DeleteItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#scheduled` },
      sk: { S: sk },
    },
  }));
}

async function publishScheduledImage(event: LambdaEvent): Promise<{ ok: boolean; slug: string; mediaId: string }> {
  const slug = event.slug?.trim() || 'image';
  if (!event.imageUrl?.trim()) {
    throw new Error('publishImage precisa de imageUrl.');
  }
  if (!event.caption?.trim()) {
    throw new Error('publishImage precisa de caption.');
  }
  if (!(await markOnce(`publish#${slug}`))) {
    console.info('Publicacao agendada ignorada por idempotencia', { slug });
    return { ok: true, slug, mediaId: 'already-processed' };
  }

  try {
    console.info('Publicando imagem agendada', { slug });
    const container = await graphPost<{ id: string }>(`${config.ig.userId}/media`, {
      image_url: event.imageUrl,
      caption: event.caption,
    });
    await waitMediaContainer(container.id, slug);
    const published = await graphPost<{ id: string }>(`${config.ig.userId}/media_publish`, {
      creation_id: container.id,
    });
    console.info('Imagem publicada', { slug, mediaId: published.id });
    await recordPublishedPost(slug, published.id, event.caption);
    await notifyOwner(
      `post-agendado:${slug}`,
      `Imagem ${slug}`,
      `Publicado no Instagram com mediaId ${published.id}.`,
    );
    return { ok: true, slug, mediaId: published.id };
  } catch (error) {
    await clearOnce(`publish#${slug}`);
    await notifyOwner(
      `post-agendado:${slug}`,
      `Imagem ${slug}`,
      `Falhou antes de confirmar publicacao. Retry liberado. Erro: ${(error as Error).message}`,
    );
    throw error;
  }
}

async function publishScheduledVideo(event: LambdaEvent): Promise<{ ok: boolean; slug: string; mediaId: string }> {
  const slug = event.slug?.trim() || 'reel';
  if (!event.videoUrl?.trim()) {
    throw new Error('publishVideo precisa de videoUrl.');
  }
  if (!event.caption?.trim()) {
    throw new Error('publishVideo precisa de caption.');
  }
  if (!(await markOnce(`publish#${slug}`))) {
    console.info('Publicacao de Reel ignorada por idempotencia', { slug });
    return { ok: true, slug, mediaId: 'already-processed' };
  }

  try {
    console.info('Publicando Reel', { slug });
    const container = await graphPost<{ id: string }>(`${config.ig.userId}/media`, {
      media_type: 'REELS',
      video_url: event.videoUrl,
      caption: event.caption,
      share_to_feed: 'true',
    });
    await waitMediaContainer(container.id, slug);
    const published = await graphPost<{ id: string }>(`${config.ig.userId}/media_publish`, {
      creation_id: container.id,
    });
    console.info('Reel publicado', { slug, mediaId: published.id });
    await recordPublishedPost(slug, published.id, event.caption);
    await notifyOwner(
      `post-reel:${slug}`,
      `Reel ${slug}`,
      `Publicado no Instagram com mediaId ${published.id}.`,
    );
    return { ok: true, slug, mediaId: published.id };
  } catch (error) {
    await clearOnce(`publish#${slug}`);
    await notifyOwner(
      `post-reel:${slug}`,
      `Reel ${slug}`,
      `Falhou antes de confirmar publicacao. Retry liberado. Erro: ${(error as Error).message}`,
    );
    throw error;
  }
}

async function publishScheduledCarousel(event: LambdaEvent): Promise<{ ok: boolean; slug: string; mediaId: string }> {
  const slug = event.slug?.trim() || 'carousel';
  if (!event.urls?.length || event.urls.length < 2) {
    throw new Error('publishCarousel precisa de ao menos 2 URLs.');
  }
  if (!event.caption?.trim()) {
    throw new Error('publishCarousel precisa de caption.');
  }
  if (!(await markOnce(`publish#${slug}`))) {
    console.info('Publicacao agendada ignorada por idempotencia', { slug });
    return { ok: true, slug, mediaId: 'already-processed' };
  }

  try {
    console.info('Publicando carrossel agendado', { slug, images: event.urls.length });
    const children: string[] = [];
    for (const [index, imageUrl] of event.urls.entries()) {
      const child = await graphPost<{ id: string }>(`${config.ig.userId}/media`, {
        image_url: imageUrl,
        is_carousel_item: 'true',
      });
      children.push(child.id);
      console.info('Item de carrossel criado', { slug, index: index + 1, id: child.id });
    }

    const parent = await graphPost<{ id: string }>(`${config.ig.userId}/media`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: event.caption,
    });
    await waitMediaContainer(parent.id, slug);
    const published = await graphPost<{ id: string }>(`${config.ig.userId}/media_publish`, {
      creation_id: parent.id,
    });
    console.info('Carrossel publicado', { slug, mediaId: published.id });
    await recordPublishedPost(slug, published.id, event.caption);
    await notifyOwner(
      `post-agendado:${slug}`,
      `Carrossel ${slug}`,
      `Publicado no Instagram com mediaId ${published.id}.`,
    );
    return { ok: true, slug, mediaId: published.id };
  } catch (error) {
    await clearOnce(`publish#${slug}`);
    await notifyOwner(
      `post-agendado:${slug}`,
      `Carrossel ${slug}`,
      `Falhou antes de confirmar publicacao. Retry liberado. Erro: ${(error as Error).message}`,
    );
    throw error;
  }
}

async function waitMediaContainer(id: string, slug: string): Promise<void> {
  for (let attempt = 0; attempt < 36; attempt++) {
    const status = await graphGet<{ status_code?: string; status?: string }>(
      id,
      { fields: 'status_code,status' },
    );
    if (status.status_code === 'FINISHED' || status.status_code === 'PUBLISHED') return;
    if (status.status_code === 'ERROR') {
      throw new Error(`Container ${slug} falhou: ${JSON.stringify(status)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`Container ${slug} nao ficou pronto dentro do tempo esperado.`);
}

async function graphPost<T>(path: string, body: Record<string, string>): Promise<T> {
  const proof = graphProof();
  const res = await fetch(graphUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...body,
      access_token: config.ig.accessToken,
      ...(proof ? { appsecret_proof: proof } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Graph API: ${JSON.stringify(await res.json())}`);
  return (await res.json()) as T;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(graphUrl(path));
  url.searchParams.set('access_token', config.ig.accessToken);
  const proof = graphProof();
  if (proof) url.searchParams.set('appsecret_proof', proof);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Graph API: ${JSON.stringify(await res.json())}`);
  return (await res.json()) as T;
}

async function graphGetAbsolute<T>(urlValue: string): Promise<T> {
  const res = await fetch(urlValue);
  if (!res.ok) throw new Error(`Graph API: ${JSON.stringify(await res.json())}`);
  return (await res.json()) as T;
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${config.ig.apiVersion}/${path}`;
}

function graphProof(): string | undefined {
  const secret = config.ig.appSecret;
  if (!secret) return undefined;
  return createHmac('sha256', secret).update(config.ig.accessToken).digest('hex');
}

async function handleHttp(event: LambdaEvent): Promise<LambdaResponse> {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.rawPath || event.path || event.requestContext?.http?.path || '';

  if (method === 'OPTIONS') {
    return path.startsWith('/checkout/website-guide') ? storefrontEmpty(204) : empty(204);
  }

  if (path.startsWith('/api/planner')) {
    return handlePlannerHttp(event);
  }

  if (path.startsWith('/checkout/website-guide')) {
    return handleWebsiteGuideStorefrontHttp(event, method, path);
  }

  const trackedInstagramKind = path.match(/^\/instagram\/(example|community|prompt|product)$/)?.[1] as TrackedFlowKind | undefined;
  if (method === 'GET' && trackedInstagramKind) {
    return handleInstagramTrackedRedirect(event, trackedInstagramKind);
  }

  if (method === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.IG_WEBHOOK_VERIFY_TOKEN && challenge) {
      return text(200, challenge);
    }
    return text(403, 'verification failed');
  }

  if (method !== 'POST') return text(405, 'method not allowed');

  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body || '';

  console.info('Webhook POST recebido', {
    bodyBytes: Buffer.byteLength(rawBody),
    headerKeys: Object.keys(event.headers || {}).sort(),
  });

  if (isChatraceRequest(event)) {
    return handleChatraceHttp(event, rawBody);
  }

  if (path.toLowerCase().includes('/woovi')) {
    return handleWooviHttp(event, rawBody);
  }

  if (isZernioWebhookPath(path)) {
    return handleZernioHttp(event, rawBody);
  }

  if (!verifySignature(event.headers || {}, rawBody)) {
    console.warn('Webhook recusado: assinatura invalida ou ausente');
    return text(403, 'invalid signature');
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return text(400, 'invalid json');
  }

  const handled = await handleWebhookPayload(payload);
  if (!config.behavior.dryRun && !config.behavior.chatraceEnabled) {
    await forwardLegacyWebhook(payload, rawBody, event.headers || {});
  } else if (process.env.LEGACY_PAGE_WEBHOOK_FORWARD_URL?.trim()) {
    console.info('Encaminhamento legado bloqueado pela trava de respondente unico', {
      dryRun: config.behavior.dryRun,
      chatraceEnabled: config.behavior.chatraceEnabled,
    });
  }
  console.info('Webhook processado', { handled });
  return json(200, { ok: true, handled });
}

async function handleInstagramTrackedRedirect(
  event: LambdaEvent,
  kind: TrackedFlowKind,
): Promise<LambdaResponse> {
  const params = event.queryStringParameters || {};
  const correlationId = params.correlation?.trim() || '';
  const intent = params.intent === 'ter' || params.intent === 'aprender' ? params.intent : undefined;
  const signature = params.sig?.trim() || '';
  const credentials = await getZernioCredentials();
  if (
    !intent
    || !correlationId
    || !credentials.communityLinkSecret
    || !verifyTrackedFlowSignature(
      kind,
      intent,
      correlationId,
      signature,
      credentials.communityLinkSecret,
    )
  ) {
    return text(403, 'invalid link');
  }
  const tracking = await getInstagramTracking(correlationId);
  if (!tracking || tracking.intent !== intent) return text(404, 'link not found');

  if (kind === 'prompt' || kind === 'product') {
    const context = await getLeadContext(tracking.senderId);
    if (!context?.instagramFlow || context.instagramFlow.correlationId !== correlationId) {
      return text(404, 'flow not found');
    }
    const openedAt = new Date().toISOString();
    const action = kind === 'prompt' ? 'open_free_prompt' : 'open_prompt_generator';
    const result = kind === 'prompt' ? 'free_prompt_opened' : 'prompt_generator_opened';
    await saveLeadContext({
      ...context,
      instagramFlow: {
        ...context.instagramFlow,
        ...(kind === 'prompt' ? { promptOpenedAt: openedAt } : { productOpenedAt: openedAt }),
        updatedAt: openedAt,
      },
      automationJournal: appendAutomationDecision(context.automationJournal, {
        at: openedAt,
        action,
        verifiedFacts: ['signed_correlation', `intent:${intent}`],
        rule: kind === 'prompt'
          ? 'free_prompt_before_product'
          : 'single_product_offer_after_free_prompt',
        result,
        reasonCode: result,
      }),
    });
    if (kind === 'product') {
      return redirect(createStorefrontProductDestinationUrl({
        correlationId,
        intent,
        issuedAt: Math.floor(Date.now() / 1_000),
        secret: credentials.communityLinkSecret,
      }));
    }
    const destinationUrl = new URL('https://prompt.saraiva.ai/prompt-do-video');
    destinationUrl.searchParams.set('correlationId', correlationId);
    destinationUrl.searchParams.set('intent', intent);
    return redirect(destinationUrl.toString());
  }

  if (kind === 'example') {
    const eventId = `example-opened-${correlationId}`;
    if (await markOnce(eventId)) {
      try {
        await enqueueZernioAutomation({
          version: 'zernio-1',
          kind: 'example_opened',
          eventId,
          inbound: {
            senderId: tracking.senderId,
            correlationId,
            intent,
            openedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        await clearOnce(eventId);
        throw error;
      }
    }
    return redirect('https://hello-world-project-235.lovable.app/prospeccao');
  }

  const context = await getLeadContext(tracking.senderId);
  if (context?.instagramFlow?.correlationId === correlationId) {
    const openedAt = context.instagramFlow.communityOpenedAt || new Date().toISOString();
    await saveLeadContext({
      ...context,
      instagramFlow: { ...context.instagramFlow, communityOpenedAt: openedAt, updatedAt: openedAt },
      automationJournal: appendAutomationDecision(
        context.automationJournal,
        {
          at: openedAt,
          action: 'open_community',
          verifiedFacts: ['signed_correlation', `intent:${intent}`],
          rule: 'record_click_before_whatsapp_redirect',
          result: 'whatsapp_community_opened',
          reasonCode: 'whatsapp_community_opened',
        },
      ),
    });
  }
  const destinationUrl = new URL(createCommunityDestinationUrl({
    ...(context?.instagramFlow || tracking.session),
    path: intent === 'ter' ? 'ready' : 'build',
  }));
  destinationUrl.searchParams.set('correlationId', correlationId);
  destinationUrl.searchParams.set('intent', intent);
  return redirect(destinationUrl.toString());
}

interface InstagramTrackingRecord {
  senderId: string;
  intent: 'ter' | 'aprender';
  session: InstagramFlowSession;
}

async function saveInstagramTracking(
  senderId: string,
  session: InstagramFlowSession,
): Promise<void> {
  if (!tableName) throw new Error('instagram_tracking_store_missing');
  const intent = session.path === 'ready' ? 'ter' : 'aprender';
  const record: InstagramTrackingRecord = { senderId, intent, session };
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#instagram-tracking` },
      sk: { S: session.correlationId },
      data: { S: JSON.stringify(record) },
      expiresAt: { N: String(Math.floor(Date.now() / 1_000) + 7 * 24 * 60 * 60) },
    },
  }));
}

async function getInstagramTracking(
  correlationId: string,
): Promise<InstagramTrackingRecord | undefined> {
  if (!tableName) return undefined;
  const result = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#instagram-tracking` },
      sk: { S: correlationId },
    },
    ConsistentRead: true,
  }));
  const raw = result.Item?.data?.S;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as InstagramTrackingRecord;
  } catch {
    return undefined;
  }
}

async function handleZernioHttp(
  event: LambdaEvent,
  rawBody: string,
): Promise<LambdaResponse> {
  const accountId = process.env.ZERNIO_ACCOUNT_ID?.trim();
  if (!accountId) return json(503, { ok: false, error: 'zernio not configured' });

  const credentials = await getZernioCredentials();
  const result = await handleZernioWebhook({
    rawBody,
    signature: header(event.headers || {}, 'x-zernio-signature'),
    webhookSecret: credentials.webhookSecret,
    apiKey: credentials.apiKey,
    accountId,
    markOnce,
    releaseOnce: clearOnce,
    onComment: async (input) => enqueueZernioAutomation({
      version: 'zernio-1',
      kind: 'comment',
      eventId: input.eventId,
      inbound: input,
    }),
    onMessage: async (input) => enqueueZernioAutomation({
      version: 'zernio-1',
      kind: 'message',
      eventId: input.eventId,
      inbound: input,
    }),
    onLifecycle: async (input) => enqueueZernioAutomation({
      version: 'zernio-1',
      kind: 'lifecycle',
      eventId: input.eventId,
      inbound: input,
    }),
  });
  console.info('Webhook Zernio processado', {
    statusCode: result.statusCode,
    handled: result.body.handled,
    duplicate: result.body.duplicate,
    ignored: result.body.ignored,
  });
  return json(result.statusCode, result.body);
}

type ZernioAutomationCommand =
  | {
      version: 'zernio-1';
      kind: 'comment';
      eventId: string;
      inbound: ZernioCommentInboundV1;
    }
  | {
      version: 'zernio-1';
      kind: 'message';
      eventId: string;
      inbound: ZernioMessageInboundV1;
    }
  | {
      version: 'zernio-1';
      kind: 'lifecycle';
      eventId: string;
      inbound: ZernioLifecycleInboundV1;
    }
  | {
      version: 'zernio-1';
      kind: 'example_opened';
      eventId: string;
      inbound: {
        senderId: string;
        correlationId: string;
        intent: 'ter' | 'aprender';
        openedAt: string;
      };
    };

async function enqueueZernioAutomation(
  command: ZernioAutomationCommand,
): Promise<Record<string, unknown>> {
  const queueUrl = process.env.ZERNIO_AUTOMATION_QUEUE_URL?.trim();
  if (!queueUrl) throw new Error('zernio_automation_queue_url_missing');
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(command),
    MessageGroupId: `zernio-${command.inbound.senderId}`.slice(0, 128),
    MessageDeduplicationId: command.eventId.slice(0, 128),
  }));
  return {
    queued: true,
    eventId: command.eventId,
    kind: command.kind,
  };
}

function parseZernioAutomationCommand(raw: string): ZernioAutomationCommand | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const value = parsed as Partial<ZernioAutomationCommand>;
  if (
    value.version !== 'zernio-1'
    || !value.eventId
    || !['comment', 'message', 'lifecycle', 'example_opened'].includes(value.kind || '')
    || !value.inbound
  ) {
    return undefined;
  }
  return value as ZernioAutomationCommand;
}

async function processZernioLifecycle(
  input: ZernioLifecycleInboundV1,
): Promise<void> {
  const context = await getLeadContext(input.senderId);
  if (!context?.instagramFlow || !isZernioFlowMedia(context.postId)) return;
  const failedAbandonmentStage = input.event === 'message.failed'
    && input.messageId === context.instagramFlow.abandonmentAudioMessageId
    ? context.instagramFlow.abandonmentAudioStage
    : undefined;
  const failedWebsiteFollowUp = input.event === 'message.failed'
    && input.messageId === context.instagramFlow.followUpMessageId;
  const updated = applyZernioLifecycleToContext(context, input);
  if (failedAbandonmentStage) {
    await clearOnce(
      `zernio-abandonment-audio#${context.instagramFlow.correlationId}#${failedAbandonmentStage}`,
    );
  }
  if (failedWebsiteFollowUp) {
    await clearOnce(`zernio-website-prompt-follow-up#${context.instagramFlow.correlationId}`);
  }
  await saveLeadContext(updated);
  if (input.event === 'message.failed' && updated.instagramFlow?.stage === 'technical_paused') {
    console.error('zernio_flow_message_failed', {
      stage: context.instagramFlow.stage,
      messageId: anonymizeForLog(input.messageId),
      sender: anonymizeForLog(input.senderId),
      reasonCode: 'technical_alert',
    });
  }
}

export function applyZernioLifecycleToContext(
  context: LeadContext,
  input: ZernioLifecycleInboundV1,
): LeadContext {
  const now = input.occurredAt || new Date().toISOString();
  const session = context.instagramFlow;
  if (!session) return context;
  const failedInitial = input.event === 'message.failed'
    && input.messageId === session.initialMessageId;
  const failedCard = input.event === 'message.failed'
    && input.messageId === context.personalizedOffer?.cardMessageId;
  const failedWebsiteCard = input.event === 'message.failed'
    && (
      input.messageId === session.promptCardMessageId
      || input.messageId === session.productCtaMessageId
    );
  const failedAudio = input.event === 'message.failed'
    && input.messageId === context.personalizedOffer?.audioMessageId;
  const failedAbandonment = input.event === 'message.failed'
    && input.messageId === session.abandonmentAudioMessageId;
  const failedWebsiteFollowUp = input.event === 'message.failed'
    && input.messageId === session.followUpMessageId;
  const criticalFailure = failedInitial || failedCard || failedAudio || failedWebsiteCard;

  return {
    ...context,
    instagramFlow: {
      ...session,
      ...(failedInitial ? { initialMessageId: undefined } : {}),
      ...(failedAbandonment ? {
        abandonmentAudioMessageId: undefined,
        abandonmentAudioSentAt: undefined,
        abandonmentAudioStage: undefined,
      } : {}),
      ...(failedWebsiteFollowUp ? {
        followUpMessageId: undefined,
        followUpSentAt: undefined,
      } : {}),
      ...(failedWebsiteCard ? {
        promptCardMessageId: undefined,
        productCtaMessageId: undefined,
      } : {}),
      ...(criticalFailure ? { stage: 'technical_paused' as const } : {}),
      updatedAt: now,
    },
    personalizedOffer: context.personalizedOffer ? {
      ...context.personalizedOffer,
      ...(failedCard ? { cardMessageId: undefined } : {}),
      ...(failedAudio ? {
        audioMessageId: undefined,
        reasonCode: 'audio_fallback_text' as const,
      } : {}),
    } : undefined,
    automationJournal: [
      ...(context.automationJournal || []),
      {
        at: now,
        action: input.event,
        verifiedFacts: [`message_id:${input.messageId}`],
        rule: criticalFailure
          ? 'failed_flow_effect_pauses_session'
          : 'zernio_message_lifecycle',
        result: criticalFailure ? 'technical_paused' : input.event,
        reasonCode: criticalFailure ? 'technical_alert' : input.event.replace('.', '_'),
      },
    ].slice(-100),
    updatedAt: now,
  };
}

async function processZernioComment(
  input: ZernioCommentInboundV1,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const commentKey = `zernio-comment#${input.commentId}`;

  const flowEntry = createInstagramCommentFlow(input.mediaId, {
    correlationId: createHash('sha256')
      .update(`${input.commentId}:${input.eventId}`)
      .digest('hex')
      .slice(0, 20),
    transport: 'zernio',
  });
  if (!flowEntry) return { ignored: true };

  const promise = resolveKnownMediaPromise(input.mediaId)
    || resolvePostPromise({ commentText: input.text });
  const privateReply = summarizeInteractiveMessage(flowEntry.message);
  const mode = process.env.ZERNIO_SEXYFLOW_MODE?.trim() || 'shadow';
  const existingContext = await getLeadContext(input.senderId);
  let existingFlow = existingContext?.commentId === input.commentId
    ? existingContext.instagramFlow
    : undefined;

  try {
    if (!isZernioLiveForSender(input.senderId, mode)) {
      await persistInitialInstagramFlowContext({
        senderId: input.senderId,
        commentId: input.commentId,
        username: input.username,
        mediaId: input.mediaId,
        commentText: input.text,
        privateReply,
        promise,
        flowEntry,
        privateReplyAccepted: false,
      });
      return {
        shadow: true,
        stage: flowEntry.session.stage,
        senderId: anonymizeForLog(input.senderId),
      };
    }

    const buttons = flowEntry.message.kind === 'quick_replies'
      ? flowEntry.message.quickReplies.map((button) => ({
          type: 'postback' as const,
          title: button.title,
          payload: button.payload,
        }))
      : [];
    if (!existingFlow) {
      await persistInitialInstagramFlowContext({
        senderId: input.senderId,
        commentId: input.commentId,
        username: input.username,
        mediaId: input.mediaId,
        commentText: input.text,
        privateReply,
        promise,
        flowEntry,
        privateReplyAccepted: false,
      });
      existingFlow = flowEntry.session;
    }
    let privateMessageId = existingFlow?.initialMessageId;
    if (!privateMessageId) {
      const privateEffectKey = `zernio-effect#${input.commentId}#private_reply`;
      const privateLease = await acquireEffectLease(privateEffectKey);
      if (!privateLease.acquired) {
        if (privateLease.status === 'completed' && privateLease.externalId) {
          privateMessageId = privateLease.externalId;
        } else {
          throw new Error('zernio_private_reply_in_progress');
        }
      }
      if (privateLease.acquired) {
        try {
          const privateOutcome = await sendZernioPrivateReply({
            apiKey,
            accountId: input.accountId,
            mediaId: input.mediaId,
            commentId: input.commentId,
            message: privateReply,
            buttons,
          });
          privateMessageId = privateOutcome.messageId;
        } catch (error) {
          if (isAlreadyRepliedError(error)) {
            privateMessageId = `zernio-private-reply:${input.commentId}`;
          } else if (isTerminalZernioConversationError(error)) {
            await releaseEffectLease(privateEffectKey, privateLease.owner);
            const pausedAt = new Date().toISOString();
            flowEntry.session = {
              ...flowEntry.session,
              stage: 'technical_paused',
              updatedAt: pausedAt,
            };
            await persistInitialInstagramFlowContext({
              senderId: input.senderId,
              commentId: input.commentId,
              username: input.username,
              mediaId: input.mediaId,
              commentText: input.text,
              privateReply,
              promise,
              flowEntry,
              privateReplyAccepted: false,
            });
            return {
              ignored: true,
              stage: 'technical_paused',
              reasonCode: 'private_thread_unavailable',
            };
          } else {
            if (!isUncertainZernioDeliveryError(error)) {
              await releaseEffectLease(privateEffectKey, privateLease.owner);
            }
            throw error;
          }
        }
        await completeEffectLease(privateEffectKey, privateLease.owner, privateMessageId!);
      }
      flowEntry.session.initialMessageId = privateMessageId;
      await persistInitialInstagramFlowContext({
        senderId: input.senderId,
        commentId: input.commentId,
        username: input.username,
        mediaId: input.mediaId,
        commentText: input.text,
        privateReply,
        promise,
        flowEntry,
        privateReplyAccepted: true,
      });
    } else {
      flowEntry.session = { ...flowEntry.session, ...existingFlow };
    }
    if (existingFlow?.publicReplyId) {
      return {
        stage: existingFlow.stage,
        messageId: privateMessageId,
        publicReplyId: existingFlow.publicReplyId,
        resumed: true,
      };
    }
    const publicEffectKey = `zernio-effect#${input.commentId}#public_reply`;
    const publicLease = await acquireEffectLease(publicEffectKey);
    let publicReplyId: string | undefined;
    if (!publicLease.acquired) {
      if (publicLease.status === 'completed' && publicLease.externalId) {
        publicReplyId = publicLease.externalId;
      } else {
        throw new Error('zernio_public_reply_in_progress');
      }
    }
    if (publicLease.acquired) {
      try {
        publicReplyId = publicLease.expiredLeaseRecovered
          ? await findZernioCommentReply({
              apiKey,
              accountId: input.accountId,
              mediaId: input.mediaId,
              commentId: input.commentId,
              message: flowEntry.publicReply,
            })
          : undefined;
        if (!publicReplyId) {
          const publicOutcome = await replyZernioComment({
            apiKey,
            accountId: input.accountId,
            mediaId: input.mediaId,
            commentId: input.commentId,
            message: flowEntry.publicReply,
          });
          publicReplyId = publicOutcome.replyId;
        }
        await completeEffectLease(publicEffectKey, publicLease.owner, publicReplyId);
      } catch (error) {
        if (!isUncertainZernioDeliveryError(error)) {
          await releaseEffectLease(publicEffectKey, publicLease.owner);
        }
        throw error;
      }
    }
    const context = await getLeadContext(input.senderId);
    if (context?.instagramFlow) {
      await saveLeadContext({
        senderId: context.senderId,
        commentId: context.commentId,
        username: context.username,
        postId: context.postId,
        postPermalink: context.postPermalink,
        promise: context.promise,
        socialSelling: context.socialSelling,
        instagramFlow: {
          ...context.instagramFlow,
          publicReplyId,
        },
        profileFacts: context.profileFacts,
        automationJournal: context.automationJournal,
        personalizedOffer: context.personalizedOffer,
        interactions: context.interactions,
      });
    }
    await markOnce(commentKey);
    return {
      stage: flowEntry.session.stage,
      messageId: privateMessageId,
      publicReplyId,
    };
  } catch (error) {
    console.warn('zernio_comment_delivery_failed', {
      commentId: anonymizeForLog(input.commentId),
      privateReplyPersisted: Boolean(
        (await getLeadContext(input.senderId))?.instagramFlow?.initialMessageId,
      ),
      error: (error as Error).message,
    });
    throw error;
  }
}

async function processZernioMessage(
  input: ZernioMessageInboundV1,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const context = await getLeadContext(input.senderId);
  if (!context || !isZernioFlowMedia(context.postId)) {
    return { ignored: true, reasonCode: 'session_not_found' };
  }
  const activeSession = recoverInstagramFlowSessionForInbound(
    context.postId,
    context.instagramFlow,
    {
      transport: 'zernio',
      conversationId: input.conversationId,
    },
  );
  if (!activeSession) return { ignored: true, reasonCode: 'session_not_found' };
  const canonicalPromise = resolveKnownMediaPromise(context.postId || '') ?? context.promise;
  if (activeSession.optedOutAt) {
    if (!isInstagramFlowResume(input.text)) {
      return { ignored: true, reasonCode: 'opt_out_active' };
    }
    const resumedAt = new Date().toISOString();
    const resumedSession: InstagramFlowSession = {
      ...activeSession,
      stage: activeSession.campaign === 'sites_workshop'
        ? 'awaiting_request'
        : 'awaiting_intent',
      conversationId: input.conversationId,
      optedOutAt: undefined,
      completedAt: undefined,
      communityCtaMessageId: undefined,
      destinationUrl: undefined,
      abandonmentAudioMessageId: undefined,
      abandonmentAudioSentAt: undefined,
      abandonmentAudioStage: undefined,
      updatedAt: resumedAt,
    };
    const resumedMessage = resumeInstagramFlowMessage(resumedSession);
    let messageId: string | undefined;
    if (isZernioLiveForSender(input.senderId)) {
      messageId = await sendZernioInteractive({
        apiKey,
        accountId: input.accountId,
        conversationId: input.conversationId,
        message: resumedMessage,
        reconcileSince: input.occurredAt,
      });
    }
    await saveLeadContext({
      ...context,
      username: input.username || context.username,
      promise: canonicalPromise,
      instagramFlow: resumedSession,
      personalizedOffer: undefined,
      socialSelling: context.socialSelling ? {
        ...context.socialSelling,
        stage: 'opened',
        lastIntent: 'requalify',
        updatedAt: resumedAt,
      } : context.socialSelling,
      automationJournal: appendAutomationDecision(context.automationJournal, {
        at: resumedAt,
        action: 'resume_automation',
        verifiedFacts: ['explicit_resume_intent'],
        rule: 'only_unambiguous_resume_reopens_opt_out',
        result: 'flow_resumed',
        reasonCode: 'flow_resumed',
      }),
      interactions: [
        ...(context.interactions || []),
        { at: resumedAt, direction: 'in', text: input.text },
        ...(messageId ? [{
          at: resumedAt,
          direction: 'out' as const,
          text: summarizeInteractiveMessage(resumedMessage),
        }] : []),
      ],
    });
    return {
      stage: resumedSession.stage,
      reasonCode: 'flow_resumed',
      ...(messageId ? { messageId } : { shadow: true }),
    };
  }
  if (isInstagramFlowOptOut(input.text)) {
    const stoppedAt = new Date().toISOString();
    const stoppedSession: InstagramFlowSession = {
      ...activeSession,
      stage: 'completed',
      conversationId: input.conversationId,
      completedAt: stoppedAt,
      optedOutAt: stoppedAt,
      updatedAt: stoppedAt,
    };
    let messageId: string | undefined;
    if (isZernioLiveForSender(input.senderId)) {
      messageId = await sendZernioInteractive({
        apiKey,
        accountId: input.accountId,
        conversationId: input.conversationId,
        message: { kind: 'text', text: 'Certo. Não vou continuar por aqui.' },
        reconcileSince: input.occurredAt,
      });
    }
    await saveLeadContext({
      ...context,
      username: input.username || context.username,
      promise: canonicalPromise,
      instagramFlow: stoppedSession,
      socialSelling: {
        ...(context.socialSelling || {
          score: 0,
          turns: 0,
        }),
        stage: 'disqualified',
        lastIntent: 'disqualify',
        updatedAt: stoppedAt,
      },
      automationJournal: appendAutomationDecision(context.automationJournal, {
        at: stoppedAt,
        action: 'stop_automation',
        verifiedFacts: ['explicit_opt_out'],
        rule: 'opt_out_stops_all_follow_up',
        result: 'flow_stopped',
        reasonCode: 'opt_out_received',
      }),
      interactions: [
        ...(context.interactions || []),
        { at: stoppedAt, direction: 'in', text: input.text },
        ...(messageId ? [{
          at: stoppedAt,
          direction: 'out' as const,
          text: 'Certo. Não vou continuar por aqui.',
        }] : []),
      ],
    });
    return {
      stage: stoppedSession.stage,
      reasonCode: 'opt_out_received',
      ...(messageId ? { messageId } : { shadow: true }),
    };
  }
  const profileBrief = buildSafeProfileBrief({
    id: input.senderId,
    name: input.senderName,
    username: input.username,
    accountType: 'BUSINESS',
  });
  const currentSession = {
    ...activeSession,
    transport: 'zernio' as const,
    conversationId: input.conversationId,
  };
  const flowInput = { payload: input.payload, text: input.text };
  const flowOptions = {
      firstName: profileBrief.firstName,
      username: profileBrief.username,
      profileFacts: profileBrief.facts,
  };
  let generativeSource: 'bedrock' | 'fallback' | undefined;
  let generativeFallbackReason: string | undefined;
  const flowStep: InstagramFlowStep | undefined = shouldAdvanceInstagramFlow(currentSession, flowInput)
    ? advanceInstagramFlow(currentSession, flowInput, flowOptions)
    : await (async () => {
        const conversational = await generateConversationalFlowReply({
          inboundText: input.text || input.payload,
          session: currentSession,
          interactions: context.interactions,
        });
        generativeSource = conversational.source;
        generativeFallbackReason = conversational.fallbackReason;
        return {
          session: { ...currentSession, updatedAt: new Date().toISOString() },
          message: conversational.message,
          event: 'conversation_recovered',
          reasonCode: conversational.source === 'bedrock'
            ? 'generative_reply_with_flow_resume'
            : 'deterministic_reply_with_flow_resume',
          offer: undefined,
          messages: undefined,
        };
      })();
  if (!flowStep) return { ignored: true, reasonCode: 'invalid_flow_state' };
  if (generativeSource) {
    console.info('zernio_conversational_reply', {
      stage: currentSession.stage,
      source: generativeSource,
      fallbackReason: generativeFallbackReason,
      sender: anonymizeForLog(input.senderId),
      reasonCode: flowStep.reasonCode,
    });
  }

  const sendInteractive = async (
    _recipientId: string,
    message: Parameters<typeof sendZernioInteractive>[0]['message'],
  ): Promise<string> => sendZernioInteractive({
    apiKey,
    accountId: input.accountId,
    conversationId: input.conversationId,
    message,
    reconcileSince: input.occurredAt,
  });
  const baseContext = {
    senderId: context.senderId,
    commentId: context.commentId,
    username: input.username || context.username,
    postId: context.postId,
    postPermalink: context.postPermalink,
    promise: canonicalPromise,
    socialSelling: context.socialSelling,
    profileFacts: profileBrief.facts.length ? profileBrief.facts : context.profileFacts,
    automationJournal: context.automationJournal,
    interactions: [
      ...(context.interactions || []),
      { at: new Date().toISOString(), direction: 'in' as const, text: input.text },
    ],
  };

  if (!isZernioLiveForSender(input.senderId)) {
    await saveLeadContext({
      ...baseContext,
      instagramFlow: flowStep.session,
      personalizedOffer: context.personalizedOffer,
    });
    return { shadow: true, stage: flowStep.session.stage };
  }

  const flowMessages = flowStep.messages?.length ? flowStep.messages : [flowStep.message];
  if (flowStep.session.campaign === 'sites_workshop' && flowStep.messages?.length) {
    if (!process.env.INSTAGRAM_COMMUNITY_LINK_SECRET?.trim()) {
      throw new Error('instagram_link_secret_missing');
    }
    await saveInstagramTracking(input.senderId, flowStep.session);
  }

  if (flowStep.offer) {
    if (!process.env.INSTAGRAM_COMMUNITY_LINK_SECRET?.trim()) {
      throw new Error('instagram_link_secret_missing');
    }
    await saveInstagramTracking(input.senderId, flowStep.session);
    const personalizedOffer = await deliverPersonalizedOffer(
      input.senderId,
      flowStep.session,
      flowStep.offer.textFallback,
      flowStep.offer.card,
      {
        existing: context.personalizedOffer,
        sendInteractive,
        onProgress: async (progress) => {
          await saveLeadContext({
            ...baseContext,
            instagramFlow: flowStep.session,
            personalizedOffer: { ...progress },
          });
        },
      },
    );
    const persistedSession = {
      ...flowStep.session,
      updatedAt: new Date().toISOString(),
    };
    const offeredAt = new Date().toISOString();
    const acquisitionDecision: AutomationDecision = flowStep.session.campaign === 'sites_workshop'
      ? {
          at: offeredAt,
          action: 'confirm_site_creation',
          verifiedFacts: ['payload:FLOW:SITES:OPEN'],
          rule: 'explicit_button_payload_only',
          result: 'site_creation_confirmed',
          reasonCode: 'opt_in_received',
        }
      : {
          at: offeredAt,
          action: 'capture_goal',
          verifiedFacts: [`intent:${flowStep.offer.path === 'ready' ? 'ter' : 'aprender'}`],
          rule: 'user_supplied_goal_only',
          result: 'goal_captured',
          reasonCode: 'goal_captured',
        };
    await saveLeadContext({
      ...baseContext,
      instagramFlow: persistedSession,
      automationJournal: [
        ...appendAutomationDecision(baseContext.automationJournal, acquisitionDecision),
        {
          at: offeredAt,
          action: flowStep.offer.kind === 'community' ? 'offer_whatsapp_community' : 'offer_example',
          verifiedFacts: [
            `intent:${flowStep.offer.path === 'ready' ? 'ter' : 'aprender'}`,
            flowStep.offer.kind === 'community'
              ? 'whatsapp_community_is_primary_destination'
              : 'lovable_is_example_only',
          ],
          rule: flowStep.offer.kind === 'community'
            ? 'direct_whatsapp_community_cta'
            : 'example_before_community',
          result: flowStep.offer.kind === 'community' ? 'community_cta_sent' : 'example_offered',
          reasonCode: flowStep.offer.kind === 'community' ? 'community_cta_sent' : 'example_offered',
        },
      ].slice(-40),
      personalizedOffer,
      interactions: [
        ...baseContext.interactions,
        {
          at: new Date().toISOString(),
          direction: 'out' as const,
          text: `${personalizedOffer.script}\n${summarizeInteractiveMessage(flowStep.offer.card)}`,
        },
      ],
    });
    return {
      stage: persistedSession.stage,
      reasonCode: personalizedOffer.reasonCode,
      cardMessageId: personalizedOffer.cardMessageId,
    };
  }

  const messageIds: string[] = [];
  for (const message of flowMessages) {
    messageIds.push(await sendInteractive(input.senderId, message));
  }
  const messageId = messageIds.at(-1) || '';
  const outboundMessages = flowMessages.map((message) => summarizeInteractiveMessage(message));
  const persistedFlowSession = flowStep.session.campaign === 'sites_workshop' && messageIds.length === 4
    ? {
        ...flowStep.session,
        promptCardMessageId: messageIds[1],
        productCtaMessageId: messageIds[3],
      }
    : flowStep.session;
  await saveLeadContext({
    ...baseContext,
    instagramFlow: persistedFlowSession,
    automationJournal: appendAutomationDecision(baseContext.automationJournal, {
      at: new Date().toISOString(),
      action: flowStep.event,
      verifiedFacts: flowStep.session.path
        ? [`intent:${flowStep.session.path === 'ready' ? 'ter' : 'aprender'}`]
        : [],
      rule: decisionRuleFor(flowStep.reasonCode),
      result: flowStep.event,
      reasonCode: flowStep.reasonCode,
    }),
    personalizedOffer: context.personalizedOffer,
    interactions: [
      ...baseContext.interactions,
      ...outboundMessages.map((text) => ({
        at: new Date().toISOString(),
        direction: 'out' as const,
        text,
      })),
    ],
  });
  return {
    stage: persistedFlowSession.stage,
    messageId,
    ...(messageIds.length > 1 ? { messageIds } : {}),
    reasonCode: flowStep.reasonCode,
    ...(generativeSource ? { generativeSource } : {}),
  };
}

async function processZernioExampleOpened(
  input: {
    senderId: string;
    correlationId: string;
    intent: 'ter' | 'aprender';
    openedAt: string;
  },
  apiKey: string,
): Promise<Record<string, unknown>> {
  const context = await getLeadContext(input.senderId);
  const session = context?.instagramFlow;
  if (!context || !session || session.correlationId !== input.correlationId) {
    return { ignored: true, reasonCode: 'session_not_found' };
  }
  const expectedIntent = session.path === 'ready' ? 'ter' : 'aprender';
  if (input.intent !== expectedIntent) {
    return { ignored: true, reasonCode: 'intent_mismatch' };
  }
  if (session.communityCtaMessageId) {
    return {
      duplicate: true,
      stage: session.stage,
      messageId: session.communityCtaMessageId,
    };
  }
  if (!session.conversationId) throw new Error('zernio_conversation_missing');
  const accountId = process.env.ZERNIO_ACCOUNT_ID?.trim();
  if (!accountId) throw new Error('zernio_account_id_missing');
  const card = createCommunityCtaCard(session);
  const messageId = await sendZernioInteractive({
    apiKey,
    accountId,
    conversationId: session.conversationId,
    message: card,
  });
  const updatedAt = new Date().toISOString();
  await saveLeadContext({
    ...context,
    instagramFlow: {
      ...session,
      stage: 'offering_community',
      exampleOpenedAt: input.openedAt,
      communityCtaMessageId: messageId,
      updatedAt,
    },
    automationJournal: [
      ...appendAutomationDecision(context.automationJournal, {
        at: input.openedAt,
        action: 'open_example',
        verifiedFacts: ['signed_correlation', `intent:${input.intent}`],
        rule: 'record_click_before_redirect',
        result: 'example_opened',
        reasonCode: 'example_opened',
      }),
      {
        at: updatedAt,
        action: 'offer_community',
        verifiedFacts: [`intent:${input.intent}`],
        rule: 'community_cta_after_example_click',
        result: 'community_cta_sent',
        reasonCode: 'community_cta_sent',
      },
    ].slice(-40),
    interactions: [
      ...(context.interactions || []),
      {
        at: updatedAt,
        direction: 'out',
        text: summarizeInteractiveMessage(card),
      },
    ],
  });
  return { stage: 'offering_community', messageId, reasonCode: 'community_cta_sent' };
}

async function runZernioAbandonmentAudioFollowUps(): Promise<AbandonmentAudioFollowUpSummary> {
  const summary: AbandonmentAudioFollowUpSummary = {
    checked: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
  };
  const mode = process.env.ZERNIO_SEXYFLOW_MODE?.trim() || 'shadow';
  const accountId = process.env.ZERNIO_ACCOUNT_ID?.trim();
  if (mode === 'shadow' || !accountId) return summary;

  const credentials = await getZernioCredentials();
  if (credentials.canarySenderIds?.length) {
    process.env.ZERNIO_CANARY_SENDER_IDS = credentials.canarySenderIds.join(',');
  }
  const waitMinutes = Math.max(
    1,
    Number(process.env.ZERNIO_ABANDONMENT_AUDIO_DELAY_MINUTES || 5),
  );
  const limit = Math.min(
    10,
    Math.max(1, Number(process.env.ZERNIO_ABANDONMENT_AUDIO_PER_CYCLE || 3)),
  );
  const contexts = await listLeadContexts(500);
  summary.checked = contexts.length;

  for (const context of contexts) {
    if (summary.sent >= limit) break;
    if (!isZernioFlowMedia(context.postId)) continue;
    if (!isZernioLiveForSender(context.senderId, mode)) continue;
    if (
      Date.parse(context.instagramFlow?.startedAt || '')
      < ZERNIO_ABANDONMENT_AUDIO_ACTIVATION_AT
    ) continue;
    const candidate = buildAbandonmentAudioCandidate(context, {
      waitMs: waitMinutes * 60 * 1_000,
    });
    if (!candidate) continue;
    summary.eligible++;

    const stage = candidate.context.instagramFlow!.stage;
    const correlationId = candidate.context.instagramFlow!.correlationId;
    const lockId = `zernio-abandonment-audio#${correlationId}#${stage}`;
    if (!(await markOnce(lockId))) continue;

    try {
      const latest = await getLeadContext(context.senderId);
      if (
        !latest?.instagramFlow
        || latest.updatedAt !== context.updatedAt
        || latest.instagramFlow.stage !== stage
      ) {
        await clearOnce(lockId);
        continue;
      }
      const conversationId = latest.instagramFlow.conversationId!;
      const delivered = await deliverStandaloneSaraivaAudio(
        latest.senderId,
        correlationId,
        candidate.script,
        async (_recipientId, message) => sendZernioInteractive({
          apiKey: credentials.apiKey,
          accountId,
          conversationId,
          message,
          reconcileSince: latest.updatedAt,
        }),
      );
      const sentAt = new Date().toISOString();
      await saveLeadContext({
        senderId: latest.senderId,
        commentId: latest.commentId,
        username: latest.username,
        postId: latest.postId,
        postPermalink: latest.postPermalink,
        promise: latest.promise,
        socialSelling: latest.socialSelling,
        instagramFlow: {
          ...latest.instagramFlow,
          abandonmentAudioSentAt: sentAt,
          abandonmentAudioStage: stage,
          abandonmentAudioMessageId: delivered.messageId,
          updatedAt: sentAt,
        },
        profileFacts: latest.profileFacts,
        automationJournal: [
          ...(latest.automationJournal || []),
          {
            at: sentAt,
            action: 'send_abandonment_audio',
            verifiedFacts: [`stage:${stage}`],
            rule: `five_minutes_without_reply_once_per_stage`,
            result: 'audio_sent',
            reasonCode: 'abandonment_audio_sent',
          },
        ].slice(-100),
        personalizedOffer: latest.personalizedOffer,
        interactions: [
          ...(latest.interactions || []),
          { at: sentAt, direction: 'out', text: '[áudio de retomada]' },
        ],
      });
      summary.sent++;
      console.info('zernio_abandonment_audio_sent', {
        stage,
        sender: anonymizeForLog(latest.senderId),
        messageId: anonymizeForLog(delivered.messageId),
      });
    } catch (error) {
      summary.failed++;
      await clearOnce(lockId);
      console.warn('zernio_abandonment_audio_failed', {
        stage,
        sender: anonymizeForLog(context.senderId),
        error: (error as Error).message,
      });
    }
  }
  return summary;
}

async function runWebsitePromptTextFollowUps(): Promise<AbandonmentAudioFollowUpSummary> {
  const summary: AbandonmentAudioFollowUpSummary = { checked: 0, eligible: 0, sent: 0, failed: 0 };
  const mode = process.env.ZERNIO_SEXYFLOW_MODE?.trim() || 'shadow';
  const accountId = process.env.ZERNIO_ACCOUNT_ID?.trim();
  if (mode === 'shadow' || !accountId) return summary;

  const credentials = await getZernioCredentials();
  if (credentials.canarySenderIds?.length) {
    process.env.ZERNIO_CANARY_SENDER_IDS = credentials.canarySenderIds.join(',');
  }
  const waitMinutes = Math.max(
    5,
    Number(process.env.ZERNIO_WEBSITE_PROMPT_FOLLOW_UP_DELAY_MINUTES || 60),
  );
  const limit = Math.min(
    10,
    Math.max(1, Number(process.env.ZERNIO_WEBSITE_PROMPT_FOLLOW_UP_PER_CYCLE || 3)),
  );
  const contexts = await listLeadContexts(500);
  summary.checked = contexts.length;

  for (const context of contexts) {
    if (summary.sent >= limit) break;
    if (!isZernioLiveForSender(context.senderId, mode)) continue;
    const candidate = buildWebsitePromptFollowUpCandidate(context, {
      waitMs: waitMinutes * 60 * 1_000,
    });
    if (!candidate) continue;
    summary.eligible++;

    const session = candidate.context.instagramFlow!;
    const lockId = `zernio-website-prompt-follow-up#${session.correlationId}`;
    if (!(await markOnce(lockId))) continue;
    try {
      const latest = await getLeadContext(context.senderId);
      if (
        !latest?.instagramFlow
        || latest.updatedAt !== context.updatedAt
        || latest.instagramFlow.stage !== 'offering_product'
        || latest.instagramFlow.productOpenedAt
        || latest.instagramFlow.followUpSentAt
      ) {
        await clearOnce(lockId);
        continue;
      }
      const messageId = await sendZernioInteractive({
        apiKey: credentials.apiKey,
        accountId,
        conversationId: latest.instagramFlow.conversationId!,
        message: { kind: 'text', text: candidate.message },
        reconcileSince: latest.updatedAt,
      });
      const sentAt = new Date().toISOString();
      await saveLeadContext({
        ...latest,
        instagramFlow: {
          ...latest.instagramFlow,
          followUpSentAt: sentAt,
          followUpMessageId: messageId,
          updatedAt: sentAt,
        },
        automationJournal: [
          ...(latest.automationJournal || []),
          {
            at: sentAt,
            action: 'send_website_prompt_follow_up',
            verifiedFacts: ['free_prompt_delivered', `intent:${latest.instagramFlow.path === 'build' ? 'sell_sites' : 'own_business'}`],
            rule: 'one_short_follow_up_without_pressure',
            result: 'follow_up_sent',
            reasonCode: 'website_prompt_follow_up_sent',
          },
        ].slice(-100),
        interactions: [
          ...(latest.interactions || []),
          { at: sentAt, direction: 'out', text: candidate.message },
        ],
      });
      summary.sent++;
      console.info('zernio_website_prompt_follow_up_sent', {
        sender: anonymizeForLog(latest.senderId),
        messageId: anonymizeForLog(messageId),
        reasonCode: 'website_prompt_follow_up_sent',
      });
    } catch (error) {
      summary.failed++;
      await clearOnce(lockId);
      console.warn('zernio_website_prompt_follow_up_failed', {
        sender: anonymizeForLog(context.senderId),
        safeErrorCode: extractSafeErrorCode((error as Error).message),
      });
    }
  }
  return summary;
}

export function isZernioLiveForSender(
  senderId: string,
  mode = process.env.ZERNIO_SEXYFLOW_MODE?.trim() || 'shadow',
): boolean {
  if (mode === 'live') return true;
  if (mode !== 'canary') return false;
  return (process.env.ZERNIO_CANARY_SENDER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(senderId);
}

function anonymizeForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

async function handlePlannerHttp(event: LambdaEvent): Promise<LambdaResponse> {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = event.rawPath || event.path || event.requestContext?.http?.path || '';
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body || '';
  const payload = rawBody.trim() ? parseJsonBody(rawBody) : {};

  if (!verifyPlannerPin(event, payload)) {
    return json(403, { ok: false, error: 'invalid planner pin' });
  }

  if (method === 'GET' && path.endsWith('/state')) {
    const queue = await listPlannerQueue();
    return json(200, {
      ok: true,
      queue,
      nextSlots: nextFreePlannerSlots(8, queue.map((item) => item.dueAt)),
    });
  }

  if (method === 'POST' && path.endsWith('/prepare')) {
    const body = payload as { slug?: string; files?: PlannerUploadFile[]; mode?: string; startAfter?: string; slots?: string[] };
    const slug = slugify(body.slug || `upload-${new Date().toISOString().slice(0, 10)}`);
    const files = Array.isArray(body.files) ? body.files.slice(0, 40) : [];
    if (!files.length) return json(400, { ok: false, error: 'files required' });

    const queue = await listPlannerQueue();
    const upload = await Promise.all(files.map((file, index) => createPlannerUpload(slug, file, index + 1)));
    return json(200, {
      ok: true,
      slug,
      mode: body.mode || 'carousel',
      upload,
      nextSlots: nextFreePlannerSlots(body.mode === 'photos' ? files.length : 1, queue.map((item) => item.dueAt), {
        startAfter: body.startAfter,
        slots: body.slots,
      }),
      draftCaption: draftPlannerCaption(slug),
    });
  }

  if (method === 'POST' && path.endsWith('/schedule')) {
    const result = await schedulePlannerPayload(payload as PlannerScheduleRequest);
    return json(200, { ok: true, ...result });
  }

  return json(404, { ok: false, error: 'planner route not found' });
}

function parseJsonBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

function verifyPlannerPin(event: LambdaEvent, payload: unknown): boolean {
  const expected = process.env.PLANNER_PIN?.trim();
  if (!expected) return false;
  const received = header(event.headers || {}, 'x-saraiva-planner-pin')
    || event.queryStringParameters?.pin
    || firstString(valueAt(payload, ['pin']));
  return received === expected;
}

async function listPlannerQueue(): Promise<Array<{ slug: string; dueAt: string; localTime: string; action: string; urlCount: number }>> {
  if (!tableName) return [];
  const response = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `${storeAccount}#scheduled` },
    },
  }));

  return (response.Items || []).map((item) => {
    let parsed: { action?: string; urls?: string[]; imageUrl?: string } = {};
    try {
      parsed = JSON.parse(item.payload?.S || '{}') as typeof parsed;
    } catch {
      parsed = {};
    }
    return {
      slug: item.slug?.S || '',
      dueAt: item.dueAt?.S || '',
      localTime: item.localTime?.S || '',
      action: parsed.action || '',
      urlCount: Array.isArray(parsed.urls) ? parsed.urls.length : (parsed.imageUrl ? 1 : 0),
    };
  }).filter((item) => item.slug && item.dueAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

async function createPlannerUpload(slug: string, file: PlannerUploadFile, index: number): Promise<{ name: string; key: string; url: string; uploadUrl: string; contentType: string }> {
  const contentType = normalizeImageContentType(file.contentType || file.name || '');
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  const key = `${plannerPrefixBase}/${slug}/upload-${String(index).padStart(2, '0')}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: plannerBucket,
    Key: key,
    ContentType: contentType,
  });
  return {
    name: file.name || `upload-${index}.${extension}`,
    key,
    url: `${plannerPublicBase}/${key}`,
    uploadUrl: await getSignedUrl(s3, command, { expiresIn: 900 }),
    contentType,
  };
}

function normalizeImageContentType(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('png') || lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

async function schedulePlannerPayload(request: PlannerScheduleRequest): Promise<{ scheduled: Array<{ slug: string; localTime: string; dueAt: string; action: string }> }> {
  if (!tableName) throw new Error('DYNAMODB_TABLE ausente.');
  const mode = request.mode || 'carousel';
  const slug = slugify(request.slug || `post-${Date.now()}`);
  const urls = Array.isArray(request.urls) ? request.urls.filter(Boolean) : [];
  if (mode === 'carousel' && (urls.length < 2 || urls.length > 10)) {
    throw new Error('Carrossel precisa de 2 a 10 URLs.');
  }
  if (mode === 'photos' && !urls.length) {
    throw new Error('Photos precisa de pelo menos 1 URL.');
  }

  const queue = await listPlannerQueue();
  const slots = nextFreePlannerSlots(mode === 'photos' ? urls.length : 1, queue.map((item) => item.dueAt), {
    startAfter: request.startAfter,
    slots: request.slots,
  });

  const captions = Array.isArray(request.captions) ? request.captions : [];
  const jobs = mode === 'photos'
    ? urls.map((url, index) => {
      const postSlug = `${slug}-foto-${String(index + 1).padStart(2, '0')}`;
      return {
        slug: postSlug,
        dueAt: slots[index].dueAt,
        localTime: slots[index].localTime,
        payload: {
          action: 'publishImage',
          slug: postSlug,
          imageUrl: url,
          caption: captions[index] || request.caption || draftPlannerCaption(postSlug),
        },
      };
    })
    : [{
      slug,
      dueAt: slots[0].dueAt,
      localTime: slots[0].localTime,
      payload: {
        action: 'publishCarousel',
        slug,
        urls,
        caption: request.caption || captions[0] || draftPlannerCaption(slug),
      },
    }];

  for (const job of jobs) {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#scheduled` },
        sk: { S: `due#${job.dueAt}~${job.slug}` },
        dueAt: { S: job.dueAt },
        slug: { S: job.slug },
        localTime: { S: job.localTime },
        ...(request.folder ? { folder: { S: request.folder } } : {}),
        payload: { S: JSON.stringify(job.payload) },
        createdAt: { S: new Date().toISOString() },
      },
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    }));
  }

  return {
    scheduled: jobs.map((job) => ({
      slug: job.slug,
      localTime: job.localTime,
      dueAt: job.dueAt,
      action: job.payload.action,
    })),
  };
}

function nextFreePlannerSlots(
  count: number,
  existingDueAts: string[],
  options: { startAfter?: string; slots?: string[] } = {},
): Array<{ dueAt: string; localTime: string }> {
  const selected: Array<{ dueAt: string; localTime: string }> = [];
  const occupied = new Set(existingDueAts);
  const startAfter = options.startAfter ? new Date(options.startAfter) : new Date();
  const slots = options.slots?.length ? options.slots : plannerDefaultSlots;
  const startYmd = localDateYmd(startAfter);

  for (let dayOffset = 0; dayOffset < 60 && selected.length < count; dayOffset++) {
    const ymd = addUtcDays(startYmd, dayOffset);
    for (const slot of slots) {
      const dueAt = localSaoPauloSlotToUtc(ymd, slot);
      if (new Date(dueAt) <= startAfter) continue;
      if (occupied.has(dueAt)) continue;
      occupied.add(dueAt);
      selected.push({ dueAt, localTime: `${ymd} ${slot} -03` });
      if (selected.length >= count) break;
    }
  }
  return selected;
}

function localDateYmd(date: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addUtcDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0)).toISOString().slice(0, 10);
}

function localSaoPauloSlotToUtc(ymd: string, slot: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = slot.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0)).toISOString();
}

function draftPlannerCaption(slug: string): string {
  const title = slug.replace(/-/g, ' ');
  return `${title}\n\nA ideia aqui e transformar conteudo em direcao clara: menos ruido, mais contexto e uma proxima acao simples.\n\nMe chama no direct.`;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `post-${Date.now()}`;
}

async function handleChatraceHttp(event: LambdaEvent, rawBody: string): Promise<LambdaResponse> {
  if (!config.behavior.chatraceEnabled) {
    console.info('Webhook Chatrace desativado');
    return text(503, 'chatrace responder disabled');
  }

  if (!tableName) {
    console.warn('Webhook Chatrace recusado: DYNAMODB_TABLE ausente para idempotencia');
    return text(503, 'chatrace idempotency unavailable');
  }

  if (!verifyChatraceSecret(event.headers || {})) {
    console.warn('Webhook Chatrace recusado: segredo invalido ou ausente');
    return text(403, 'invalid chatrace secret');
  }

  const payload = parseRequestPayload(rawBody, event.headers || {});

  const inbound = parseChatraceInbound(payload);
  if (!inbound.senderId || !inbound.text || !inbound.requestId) {
    return json(400, {
      ok: false,
      error: 'missing senderId, text or requestId',
      expected: ['subscriber_id', 'last_input', 'request_id'],
    });
  }

  const syntheticValidation = verifyChatraceValidation(event.headers || {});
  if (config.behavior.dryRun && !syntheticValidation) {
    console.info('Webhook Chatrace bloqueado por DRY_RUN=true', {
      senderId: inbound.senderId,
      flowId: inbound.flowId,
    });
    return text(503, 'chatrace dry-run');
  }

  const expectedAccount = process.env.CHATRACE_ACCOUNT_USERNAME?.trim().replace(/^@/, '').toLowerCase();
  const expectedFlowId = process.env.CHATRACE_FLOW_ID?.trim();
  if (!expectedAccount || !expectedFlowId) {
    console.warn('Webhook Chatrace recusado: alvo nao configurado');
    return text(503, 'chatrace target unavailable');
  }
  if (inbound.accountUsername.replace(/^@/, '').toLowerCase() !== expectedAccount || inbound.flowId !== expectedFlowId) {
    console.warn('Webhook Chatrace recusado: conta ou fluxo fora do alvo', {
      accountUsername: inbound.accountUsername,
      flowId: inbound.flowId,
    });
    return text(403, 'chatrace account or flow mismatch');
  }

  const requestKey = chatraceRequestKey(inbound);
  const cached = await loadChatracePreparedReply(requestKey);
  if (cached) {
    console.info('Chatrace retry atendido pelo cache idempotente', {
      senderId: cached.commit.senderId,
      requestKey,
      stage: cached.response.lead.stage,
    });
    return json(200, cached.response);
  }

  const leaseOwner = randomUUID();
  const claim = await waitForChatraceRequestClaim(requestKey, leaseOwner);
  if (claim.cached) return json(200, claim.cached.response);
  if (!claim.claimed) {
    console.info('Chatrace request permaneceu em processamento apos espera', { requestKey });
    return temporaryChatraceBusy('request already processing', inbound.requestId);
  }

  const senderLockKey = chatraceSenderLockKey(inbound);
  if (!(await waitForChatraceSenderLock(senderLockKey, leaseOwner))) {
    await clearChatraceRequest(requestKey, leaseOwner);
    console.info('Chatrace sender permaneceu em processamento apos espera', {
      senderId: inbound.senderId,
      requestKey,
    });
    return temporaryChatraceBusy('sender already processing', inbound.requestId);
  }

  try {
    const prepared = await prepareChatraceReply(inbound, requestKey, syntheticValidation);
    await completeChatraceRequestAtomically(
      requestKey,
      senderLockKey,
      leaseOwner,
      prepared,
      syntheticValidation,
    );
    console.info('Chatrace reply gerado', {
      senderId: inbound.senderId,
      username: inbound.username,
      requestKey,
      stage: prepared.response.lead.stage,
      score: prepared.response.lead.score,
      shouldEscalate: prepared.response.lead.shouldEscalate,
    });

    if (prepared.commit.shouldNotifyOwner) {
      try {
        if (await markOnce(`chatrace-owner#${requestKey}`)) {
          await notifyOwnerSafely(
            prepared.commit.senderId,
            prepared.commit.lastInbound,
            prepared.commit.lastOutbound,
            prepared.commit.ownerSummary,
          );
        }
      } catch (notificationError) {
        console.warn('Resposta Chatrace concluida, mas a notificacao do dono falhou', {
          senderId: prepared.commit.senderId,
          requestKey,
          error: (notificationError as Error).message,
        });
      }
    }

    return json(200, prepared.response);
  } catch (error) {
    await Promise.allSettled([
      clearChatraceRequest(requestKey, leaseOwner),
      releaseChatraceSenderLock(senderLockKey, leaseOwner),
    ]);
    console.warn('Falha temporaria no respondedor Chatrace', {
      senderId: inbound.senderId,
      requestKey,
      error: (error as Error).message,
    });
    return json(503, { ok: false, error: 'temporary chatrace responder failure' });
  }
}

async function prepareChatraceReply(
  inbound: ChatraceInbound,
  requestKey: string,
  syntheticValidation: boolean,
): Promise<ChatracePreparedReply> {
  const senderCandidates = chatraceContextCandidates(inbound.senderId);
  let senderId = chatraceFallbackSenderId(inbound.senderId);
  let context: LeadContext | undefined;
  for (const candidate of senderCandidates) {
    context = await getLeadContext(candidate);
    if (context) {
      senderId = candidate;
      break;
    }
  }
  const promise = resolveKnownMediaPromise(context?.postId || '')
    ?? context?.promise
    ?? resolvePostPromise({ commentText: inbound.text });
  const turn = buildSocialSellingTurn(inbound.text, promise, context?.socialSelling);
  const generated = await generateSocialSalesReply(inbound.text, promise, turn, context);
  const commerce = await resolveCommerceReply(
    senderId,
    inbound.text,
    turn,
    generated.reply,
  );
  const reply = commerce.reply;
  const interactions = appendLeadInteractions(context, inbound.text, reply);
  const response: ChatraceReplyResponse = {
    ok: true,
    reply,
    message: reply,
    text: reply,
    resposta_comentario_gpt: reply,
    'respostacomentário_gpt': reply,
    lead: {
      senderId,
      username: inbound.username,
      stage: turn.state.stage,
      score: turn.state.score,
      temperature: turn.sales.temperature,
      nextAction: turn.sales.nextAction,
      shouldEscalate: turn.shouldEscalate,
    },
    customFields: {
      saraiva_sender_id: senderId,
      saraiva_stage: turn.state.stage,
      saraiva_score: turn.state.score,
      saraiva_temperature: turn.sales.temperature,
      saraiva_next_action: turn.sales.nextAction,
      saraiva_should_escalate: turn.shouldEscalate,
      saraiva_offer: turn.sales.offerLabel,
      saraiva_promise: promise.label,
      saraiva_comment_linked: Boolean(context?.commentId),
      saraiva_post_linked: Boolean(context?.postId),
      saraiva_validation_only: syntheticValidation,
      saraiva_reply_source: commerce.source,
      saraiva_reply_fallback_reason: generated.fallbackReason || '',
      saraiva_reply_validation_issue: generated.validationIssue || '',
      saraiva_request_id: inbound.requestId,
      saraiva_request_key: requestKey,
      saraiva_delivery_status: 'delegated_to_chatrace',
    },
    ownerSummary: turn.ownerSummary,
  };

  return {
    response,
    expectedContextUpdatedAt: context?.updatedAt,
    commit: {
      senderId,
      commentId: inbound.commentId || context?.commentId,
      username: inbound.username || context?.username,
      postId: inbound.postId || context?.postId,
      postPermalink: inbound.postPermalink || context?.postPermalink,
      promise,
      socialSelling: turn.state,
      interactions,
      sales: turn.sales,
      promiseLabel: promise.label,
      lastInbound: inbound.text,
      lastOutbound: reply,
      shouldNotifyOwner: !syntheticValidation && (turn.shouldNotifyOwner || turn.shouldEscalate),
      ownerSummary: turn.ownerSummary,
    },
  };
}

function chatraceRequestKey(inbound: ChatraceInbound): string {
  const digest = createHash('sha256')
    .update([
      inbound.accountUsername.replace(/^@/, '').toLowerCase(),
      inbound.flowId,
      inbound.senderId,
      inbound.requestId,
    ].join('|'))
    .digest('hex');
  return `request#${digest}`;
}

function chatraceSenderLockKey(inbound: ChatraceInbound): string {
  const digest = createHash('sha256')
    .update([
      inbound.accountUsername.replace(/^@/, '').toLowerCase(),
      inbound.flowId,
      inbound.senderId,
    ].join('|'))
    .digest('hex');
  return `sender#${digest}`;
}

async function claimChatraceRequest(requestKey: string, leaseOwner: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1_000);
  try {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#chatrace-requests` },
        sk: { S: requestKey },
        status: { S: 'processing' },
        leaseOwner: { S: leaseOwner },
        leaseUntil: { N: String(now + 15) },
        updatedAt: { S: new Date().toISOString() },
        expiresAt: { N: String(now + 48 * 60 * 60) },
      },
      ConditionExpression: [
        'attribute_not_exists(pk)',
        'OR (#status = :processing AND (attribute_not_exists(#leaseUntil) OR #leaseUntil < :now))',
      ].join(' '),
      ExpressionAttributeNames: {
        '#status': 'status',
        '#leaseUntil': 'leaseUntil',
      },
      ExpressionAttributeValues: {
        ':processing': { S: 'processing' },
        ':now': { N: String(now) },
      },
    }));
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

async function waitForChatraceRequestClaim(
  requestKey: string,
  leaseOwner: string,
): Promise<ChatraceClaimResult> {
  const deadline = Date.now() + 18_000;
  do {
    const cached = await loadChatracePreparedReply(requestKey);
    if (cached) return { claimed: false, cached };
    if (await claimChatraceRequest(requestKey, leaseOwner)) return { claimed: true };
    await waitForChatraceLease(300);
  } while (Date.now() < deadline);
  return { claimed: false };
}

async function acquireChatraceSenderLock(senderLockKey: string, leaseOwner: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1_000);
  try {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#chatrace-sender-locks` },
        sk: { S: senderLockKey },
        leaseOwner: { S: leaseOwner },
        leaseUntil: { N: String(now + 15) },
        updatedAt: { S: new Date().toISOString() },
        expiresAt: { N: String(now + 5 * 60) },
      },
      ConditionExpression: [
        'attribute_not_exists(pk)',
        'OR attribute_not_exists(#leaseUntil)',
        'OR #leaseUntil < :now',
      ].join(' '),
      ExpressionAttributeNames: { '#leaseUntil': 'leaseUntil' },
      ExpressionAttributeValues: { ':now': { N: String(now) } },
    }));
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

async function waitForChatraceSenderLock(senderLockKey: string, leaseOwner: string): Promise<boolean> {
  const deadline = Date.now() + 18_000;
  do {
    if (await acquireChatraceSenderLock(senderLockKey, leaseOwner)) return true;
    await waitForChatraceLease(300);
  } while (Date.now() < deadline);
  return false;
}

function waitForChatraceLease(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadChatracePreparedReply(requestKey: string): Promise<ChatracePreparedReply | undefined> {
  const result = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#chatrace-requests` },
      sk: { S: requestKey },
    },
    ConsistentRead: true,
  }));
  if (result.Item?.status?.S !== 'complete' || !result.Item.data?.S) return undefined;
  try {
    const parsed = JSON.parse(result.Item.data.S) as ChatracePreparedReply;
    if (!parsed?.response?.reply || !parsed?.commit?.senderId) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function completeChatraceRequestAtomically(
  requestKey: string,
  senderLockKey: string,
  leaseOwner: string,
  prepared: ChatracePreparedReply,
  syntheticValidation: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const nowEpoch = Math.floor(Date.now() / 1_000);
  const commit = prepared.commit;
  const transactItems: NonNullable<TransactWriteItemsCommandInput['TransactItems']> = [{
    Put: {
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#chatrace-requests` },
        sk: { S: requestKey },
        status: { S: 'complete' },
        leaseOwner: { S: leaseOwner },
        updatedAt: { S: now },
        expiresAt: { N: String(nowEpoch + 48 * 60 * 60) },
        data: { S: JSON.stringify(prepared) },
      },
      ConditionExpression: '#status = :processing AND #leaseOwner = :leaseOwner',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#leaseOwner': 'leaseOwner',
      },
      ExpressionAttributeValues: {
        ':processing': { S: 'processing' },
        ':leaseOwner': { S: leaseOwner },
      },
    },
  }];

  if (!syntheticValidation) {
    const contextData = {
      senderId: commit.senderId,
      commentId: commit.commentId,
      username: commit.username,
      postId: commit.postId,
      postPermalink: commit.postPermalink,
      promise: commit.promise,
      socialSelling: commit.socialSelling,
      interactions: commit.interactions,
    };
    const salesRecord = {
      senderId: commit.senderId,
      commentId: commit.commentId,
      username: commit.username,
      postId: commit.postId,
      postPermalink: commit.postPermalink,
      promiseLabel: commit.promiseLabel,
      snapshot: commit.sales,
      lastInbound: commit.lastInbound,
      lastOutbound: commit.lastOutbound,
      interactions: commit.interactions,
      updatedAt: now,
    };
    const contextPut: NonNullable<TransactWriteItemsCommandInput['TransactItems']>[number] = {
      Put: {
        TableName: tableName,
        Item: {
          pk: { S: `${storeAccount}#lead-context` },
          sk: { S: commit.senderId },
          updatedAt: { S: now },
          data: { S: JSON.stringify(contextData) },
        },
        ConditionExpression: prepared.expectedContextUpdatedAt
          ? '#updatedAt = :expectedUpdatedAt'
          : 'attribute_not_exists(pk)',
        ...(prepared.expectedContextUpdatedAt ? {
          ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: {
            ':expectedUpdatedAt': { S: prepared.expectedContextUpdatedAt },
          },
        } : {}),
      },
    };
    transactItems.push(contextPut, {
      Put: {
        TableName: tableName,
        Item: {
          pk: { S: `${storeAccount}#sales-leads` },
          sk: { S: commit.senderId },
          updatedAt: { S: now },
          score: { N: String(commit.sales.score) },
          stage: { S: commit.sales.stage },
          temperature: { S: commit.sales.temperature },
          icpFit: { S: commit.sales.icpFit },
          offer: { S: commit.sales.offer },
          promiseLabel: { S: commit.promiseLabel },
          nextAction: { S: commit.sales.nextAction },
          crmTitle: { S: commit.sales.crmTitle },
          crmNote: { S: commit.sales.crmNote },
          data: { S: JSON.stringify(salesRecord) },
        },
      },
    });
  }

  transactItems.push({
    Delete: {
      TableName: tableName,
      Key: {
        pk: { S: `${storeAccount}#chatrace-sender-locks` },
        sk: { S: senderLockKey },
      },
      ConditionExpression: '#leaseOwner = :leaseOwner',
      ExpressionAttributeNames: { '#leaseOwner': 'leaseOwner' },
      ExpressionAttributeValues: { ':leaseOwner': { S: leaseOwner } },
    },
  });

  await dynamo.send(new TransactWriteItemsCommand({
    ClientRequestToken: leaseOwner,
    TransactItems: transactItems,
  }));
}

async function clearChatraceRequest(requestKey: string, leaseOwner: string): Promise<void> {
  try {
    await dynamo.send(new DeleteItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: `${storeAccount}#chatrace-requests` },
        sk: { S: requestKey },
      },
      ConditionExpression: '#status = :processing AND #leaseOwner = :leaseOwner',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#leaseOwner': 'leaseOwner',
      },
      ExpressionAttributeValues: {
        ':processing': { S: 'processing' },
        ':leaseOwner': { S: leaseOwner },
      },
    }));
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }
}

async function releaseChatraceSenderLock(senderLockKey: string, leaseOwner: string): Promise<void> {
  try {
    await dynamo.send(new DeleteItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: `${storeAccount}#chatrace-sender-locks` },
        sk: { S: senderLockKey },
      },
      ConditionExpression: '#leaseOwner = :leaseOwner',
      ExpressionAttributeNames: { '#leaseOwner': 'leaseOwner' },
      ExpressionAttributeValues: { ':leaseOwner': { S: leaseOwner } },
    }));
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }
}

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: string }).name === 'ConditionalCheckFailedException';
}

function temporaryChatraceBusy(error: string, requestId: string): LambdaResponse {
  const response = json(503, { ok: false, error, requestId });
  response.headers = { ...(response.headers || {}), 'retry-after': '1' };
  return response;
}

async function generateSocialSalesReply(
  inboundText: string,
  promise: ReturnType<typeof resolvePostPromise>,
  turn: ReturnType<typeof buildSocialSellingTurn>,
  context?: LeadContext,
): Promise<BedrockSalesReplyResult> {
  const optedOut = turn.state.stage === 'disqualified' || turn.state.lastIntent === 'disqualify';
  const requiresHuman = turn.shouldEscalate || turn.sales.humanApprovalRequired;
  const requiresDeterministicReply = optedOut || requiresHuman;
  const officialPrice = turn.sales.priceCents
    ? `R$${(turn.sales.priceCents / 100).toFixed(2).replace('.', ',')}`
    : undefined;
  const trustedOfferFacts = [
    `Oferta vinculada ao post: ${turn.sales.offerLabel}.`,
    officialPrice ? `Preco oficial: ${officialPrice}.` : undefined,
    turn.sales.checkoutUrl ? `Checkout oficial: ${turn.sales.checkoutUrl}` : undefined,
  ].filter(Boolean);
  const result = await generateBedrockSalesReply({
    message: inboundText,
    promise: {
      kind: promise.kind,
      label: promise.label,
      trustedContext: [
        ...trustedOfferFacts,
        promise.publicReply,
        promise.privateReply,
      ].join('\n'),
    },
    state: turn.state,
    summary: summarizeLeadInteractions(context?.interactions),
    fallbackReply: turn.reply,
    allowedPrices: officialPrice ? [officialPrice] : [],
    allowedLinks: turn.sales.checkoutUrl ? [turn.sales.checkoutUrl] : [],
  }, {
    enabled: requiresDeterministicReply ? false : undefined,
  });

  console.info('Resposta comercial preparada', {
    source: result.source,
    fallbackReason: result.fallbackReason,
    validationIssue: result.validationIssue,
    stage: turn.state.stage,
    score: turn.state.score,
    requiresHuman,
    optedOut,
  });
  return result;
}

function summarizeLeadInteractions(interactions?: LeadInteraction[]): string {
  return (interactions || [])
    .slice(-6)
    .map((item) => `${item.direction === 'in' ? 'seguidor' : 'saraiva.ai'}: ${item.text}`)
    .join('\n')
    .slice(0, 1_500);
}

function appendAutomationDecision(
  current: AutomationDecision[] | undefined,
  decision: AutomationDecision,
): AutomationDecision[] {
  return [...(current || []), decision].slice(-40);
}

function decisionRuleFor(reasonCode: string): string {
  const rules: Record<string, string> = {
    opt_in_received: 'profile_only_after_voluntary_click',
    name_confirmation_required: 'ask_instead_of_infer',
    name_confirmed: 'user_supplied_name',
    intent_selected: 'exact_payload_selects_intent',
    goal_captured: 'user_supplied_goal_only',
    example_offered: 'example_before_community',
    example_opened: 'record_click_before_redirect',
    community_cta_sent: 'direct_whatsapp_community_cta',
    community_opened: 'record_click_before_redirect',
    whatsapp_community_opened: 'record_click_before_whatsapp_redirect',
    free_prompt_before_product: 'free_prompt_before_single_product_offer',
    intent_selection_required: 'one_intent_choice_before_free_delivery',
    product_cta_already_sent: 'do_not_duplicate_product_offer',
    path_selected: 'exact_payload_selects_offer',
    audio_sent: 'verified_facts_only',
    audio_fallback_text: 'audio_failure_must_not_block_offer',
    technical_alert: 'internal_alert_only',
  };
  return rules[reasonCode] || 'deterministic_state_machine';
}

async function handleWebhookPayload(
  payload: unknown,
  options: { rethrowAutomationFailure?: boolean } = {},
): Promise<number> {
  const entries = asArray((payload as { entry?: unknown })?.entry);
  const objectType = (payload as { object?: unknown })?.object;
  let handled = 0;
  let seen = 0;

  if (!config.behavior.webhookEnabled) {
    console.info('Webhook do respondedor desativado', { entries: entries.length });
    return 0;
  }

  if (config.behavior.dryRun) {
    console.info('Webhook em dry-run; nenhum Direct ou comentario sera enviado', {
      entries: entries.length,
      dmEnabled: config.behavior.dmWebhookEnabled,
      commentEnabled: config.behavior.commentWebhookEnabled,
    });
    return 0;
  }

  const targetIds = [config.ig.userId, config.ig.pageId].filter(Boolean);

  for (const entry of entries) {
    const entryId = (entry as { id?: unknown })?.id;
    if (!isTargetWebhookEntry(objectType, entryId, targetIds)) {
      console.info('Webhook ignorado: conta fora do alvo', {
        objectType: typeof objectType === 'string' ? objectType : undefined,
        entryId: typeof entryId === 'string' ? entryId : undefined,
        targetIds,
      });
      continue;
    }

    const primaryMessaging = asArray((entry as { messaging?: unknown })?.messaging);
    const standbyMessaging = asArray((entry as { standby?: unknown })?.standby);
    const nativeDmActive = config.behavior.dmWebhookEnabled && !config.behavior.chatraceEnabled;
    const messaging = nativeDmActive
      ? [
          ...primaryMessaging,
          ...(config.behavior.standbyMessagingEnabled ? standbyMessaging : []),
        ]
      : [];
    const rawChanges = asArray((entry as { changes?: unknown })?.changes);
    const changes = config.behavior.commentWebhookEnabled ? rawChanges : [];

    if (!nativeDmActive && (primaryMessaging.length > 0 || standbyMessaging.length > 0)) {
      console.info('Mensagens Direct ignoradas pela trava de respondente unico', {
        primary: primaryMessaging.length,
        standby: standbyMessaging.length,
        dmWebhookEnabled: config.behavior.dmWebhookEnabled,
        chatraceEnabled: config.behavior.chatraceEnabled,
      });
    }
    if (!config.behavior.standbyMessagingEnabled && standbyMessaging.length > 0) {
      console.info('Mensagens standby ignoradas; habilite WEBHOOK_STANDBY_ENABLED somente sem outro respondente', {
        standby: standbyMessaging.length,
      });
    }
    if (!config.behavior.commentWebhookEnabled && rawChanges.length > 0) {
      console.info('Mudancas de comentario ignoradas porque WEBHOOK_COMMENT_ENABLED=false', {
        fields: rawChanges.map((change) => (change as { field?: string })?.field).filter(Boolean),
      });
    }
    if (changes.length > 0) {
      console.info('Webhook changes recebido', {
        fields: changes.map((change) => (change as { field?: string })?.field).filter(Boolean),
        valueKeys: changes.map((change) => {
          const value = (change as { value?: unknown })?.value;
          return value && typeof value === 'object' ? Object.keys(value as Record<string, unknown>) : [];
        }),
      });
    }

    for (const item of messaging) {
      seen++;
      const message = (item as { message?: { mid?: string; text?: string; is_echo?: boolean; quick_reply?: { payload?: string } } }).message;
      const postback = (item as { postback?: { title?: string; payload?: string } }).postback;
      const referral = (item as { referral?: { ref?: string } }).referral;
      const senderId = (item as { sender?: { id?: string } }).sender?.id;
      const inboundPayload = message?.quick_reply?.payload || postback?.payload || referral?.ref || '';
      const inboundText = message?.text || postback?.title || inboundPayload || '';
      if (!senderId || !inboundText.trim() || message?.is_echo) {
        console.info('Webhook item ignorado', {
          hasSender: Boolean(senderId),
          hasText: Boolean(inboundText.trim()),
          isEcho: Boolean(message?.is_echo),
          keys: Object.keys(item as Record<string, unknown>),
        });
        continue;
      }
      const eventKey = dmWebhookEventKey(item, senderId, inboundText);

      try {
        const context = await getLeadContext(senderId);
        if (
          config.behavior.commentCampaignMediaIds.length > 0
          && (!context?.postId || !config.behavior.commentCampaignMediaIds.includes(context.postId))
        ) {
          console.info('Direct ignorado porque o remetente nao pertence a campanha ativa', {
            senderId,
            hasContext: Boolean(context),
            postId: context?.postId,
          });
          continue;
        }
        if (!(await markOnce(eventKey))) continue;

        let profileBrief: ReturnType<typeof buildSafeProfileBrief> | undefined;
        if (
          context?.instagramFlow?.stage === 'awaiting_request'
          && inboundPayload === 'FLOW:SARAIVA:OPEN'
          && process.env.INSTAGRAM_PROFILE_ENRICHMENT_ENABLED === 'true'
        ) {
          try {
            profileBrief = buildSafeProfileBrief(await getInstagramUserProfile(senderId));
            if (process.env.INSTAGRAM_PERSONALIZATION_ENABLED !== 'true') {
              profileBrief = { ...profileBrief, facts: [] };
            }
          } catch (profileError) {
            console.warn('Perfil oficial indisponivel; o fluxo pedira o nome', {
              senderId,
              eventKey,
              error: (profileError as Error).message,
            });
          }
        }
        const flowStep = context?.instagramFlow
          ? advanceInstagramFlow(context.instagramFlow, {
              payload: inboundPayload,
              text: inboundText,
            }, {
              firstName: profileBrief?.firstName,
              username: profileBrief?.username,
              profileFacts: profileBrief?.facts,
            })
          : undefined;
        if (flowStep && context) {
          let personalizedOffer: LeadContext['personalizedOffer'];
          let persistedSession = flowStep.session;
          const flowMessages = flowStep.messages?.length ? flowStep.messages : [flowStep.message];
          let outboundText = flowMessages.map((message) => summarizeInteractiveMessage(message)).join('\n\n');
          const promise = resolveKnownMediaPromise(context.postId || '')
            ?? context.promise;
          const turn = buildSocialSellingTurn(inboundText, promise, context.socialSelling);

          if (flowStep.offer) {
            personalizedOffer = await deliverPersonalizedOffer(
              senderId,
              flowStep.session,
              flowStep.offer.textFallback,
              flowStep.offer.card,
              {
                existing: context.personalizedOffer,
                onProgress: async (progress) => {
                  await saveLeadContext({
                    senderId,
                    commentId: context.commentId,
                    username: profileBrief?.username || context.username,
                    postId: context.postId,
                    postPermalink: context.postPermalink,
                    promise,
                    socialSelling: turn.state,
                    // Mantém awaiting_path até o card ser confirmado; o retry
                    // reaproveita áudio/texto e conclui somente o efeito faltante.
                    instagramFlow: context.instagramFlow,
                    profileFacts: profileBrief?.facts
                      || flowStep.session.profileFacts
                      || context.profileFacts,
                    automationJournal: context.automationJournal,
                    personalizedOffer: progress,
                    interactions: context.interactions,
                  });
                },
              },
            );
            persistedSession = {
              ...flowStep.session,
              stage: 'completed',
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            };
            outboundText = `${personalizedOffer.script}\n${summarizeInteractiveMessage(flowStep.offer.card)}`;
          } else {
            if (flowStep.session.campaign === 'sites_workshop' && flowStep.messages?.length) {
              if (!process.env.INSTAGRAM_COMMUNITY_LINK_SECRET?.trim()) {
                throw new Error('instagram_link_secret_missing');
              }
              await saveInstagramTracking(senderId, flowStep.session);
            }
            // Checkpoint antes do efeito externo: se o envio falhar, o retry
            // parte do estágio novo e repete somente a mensagem necessária.
            await saveLeadContext({
              senderId,
              commentId: context.commentId,
              username: profileBrief?.username || context.username,
              postId: context.postId,
              postPermalink: context.postPermalink,
              promise,
              socialSelling: turn.state,
              instagramFlow: flowStep.session,
              profileFacts: profileBrief?.facts
                || flowStep.session.profileFacts
                || context.profileFacts,
              automationJournal: context.automationJournal,
              personalizedOffer: context.personalizedOffer,
              interactions: context.interactions,
            });
            const sentMessageIds: string[] = [];
            for (const message of flowMessages) {
              sentMessageIds.push(await sendDirectInteractive(senderId, message));
            }
            if (flowStep.session.campaign === 'sites_workshop' && sentMessageIds.length === 4) {
              persistedSession = {
                ...flowStep.session,
                promptCardMessageId: sentMessageIds[1],
                productCtaMessageId: sentMessageIds[3],
              };
            }
          }
          const interactions = appendLeadInteractions(context, inboundText, outboundText);
          handled++;

          try {
            const profileFacts = profileBrief?.facts
              || flowStep.session.profileFacts
              || context.profileFacts
              || [];
            const automationJournal = appendAutomationDecision(
              context.automationJournal,
              {
                at: new Date().toISOString(),
                action: flowStep.event,
                verifiedFacts: profileFacts.map((fact) => `${fact.field}:${fact.value}`),
                rule: decisionRuleFor(flowStep.reasonCode),
                result: personalizedOffer?.reasonCode || flowStep.session.stage,
                reasonCode: personalizedOffer?.reasonCode || flowStep.reasonCode,
              },
            );
            await saveLeadContext({
              senderId,
              commentId: context.commentId,
              username: profileBrief?.username || context.username,
              postId: context.postId,
              postPermalink: context.postPermalink,
              promise,
              socialSelling: turn.state,
              instagramFlow: persistedSession,
              profileFacts,
              automationJournal,
              personalizedOffer: personalizedOffer || context.personalizedOffer,
              interactions,
            });
            await saveSalesLead({
              senderId,
              commentId: context.commentId,
              username: context.username,
              postId: context.postId,
              postPermalink: context.postPermalink,
              promiseLabel: promise.label,
              snapshot: turn.sales,
              lastInbound: inboundText,
              lastOutbound: outboundText,
              interactions,
            });
          } catch (persistenceError) {
            console.warn('Etapa do fluxo enviada, mas a persistencia falhou', {
              senderId,
              eventKey,
              flowEvent: flowStep.event,
              error: (persistenceError as Error).message,
            });
            await notifyOwnerSafely(
              senderId,
              inboundText,
              `Etapa enviada, mas o CRM falhou ao persistir:\n\n${outboundText}`,
              turn.ownerSummary,
            );
            throw persistenceError;
          }

          console.info('Fluxo de botoes do Instagram avancou', {
            senderId,
            eventKey,
            flowId: persistedSession.id,
            flowStage: persistedSession.stage,
            flowEvent: flowStep.event,
            path: persistedSession.path,
            reasonCode: personalizedOffer?.reasonCode || flowStep.reasonCode,
          });
          continue;
        }

        const promise = resolveKnownMediaPromise(context?.postId || '')
          ?? context?.promise
          ?? resolvePostPromise({ commentText: inboundText });
        const turn = buildSocialSellingTurn(inboundText, promise, context?.socialSelling);
        let reply: string;
        let replySource: 'bedrock_or_fallback' | 'woovi' | 'prompt_correction';
        let fallbackReason: string | undefined;
        if (needsWebsitePromptCorrection(context)) {
          reply = promise.privateReply;
          replySource = 'prompt_correction';
        } else {
          const generated = await generateSocialSalesReply(inboundText, promise, turn, context);
          const commerce = await resolveCommerceReply(
            senderId,
            inboundText,
            turn,
            generated.reply,
          );
          reply = commerce.reply;
          replySource = commerce.source;
          fallbackReason = generated.fallbackReason;
        }
        const interactions = appendLeadInteractions(context, inboundText, reply);

        await sendDirectMessage(senderId, reply);
        handled++;

        try {
          await saveLeadContext({
            senderId,
            commentId: context?.commentId,
            username: context?.username,
            postId: context?.postId,
            postPermalink: context?.postPermalink,
            promise,
            socialSelling: turn.state,
            instagramFlow: context?.instagramFlow,
            profileFacts: context?.profileFacts,
            automationJournal: context?.automationJournal,
            personalizedOffer: context?.personalizedOffer,
            interactions,
          });
          await saveSalesLead({
            senderId,
            commentId: context?.commentId,
            username: context?.username,
            postId: context?.postId,
            postPermalink: context?.postPermalink,
            promiseLabel: promise.label,
            snapshot: turn.sales,
            lastInbound: inboundText,
            lastOutbound: reply,
            interactions,
          });
        } catch (persistenceError) {
          console.warn('Direct enviado, mas a persistencia comercial falhou', {
            senderId,
            eventKey,
            error: (persistenceError as Error).message,
          });
          await notifyOwnerSafely(
            senderId,
            inboundText,
            `Resposta enviada, mas o CRM falhou ao persistir:\n\n${reply}`,
            turn.ownerSummary,
          );
        }

        if (turn.shouldNotifyOwner || turn.shouldEscalate) {
          await notifyOwnerSafely(senderId, inboundText, reply, turn.ownerSummary);
        }
        console.info('Direct respondido', {
          senderId,
          eventKey,
          hasContext: Boolean(context),
          promise: promise.label,
          stage: turn.state.stage,
          score: turn.state.score,
          escalate: turn.shouldEscalate,
          replySource,
          fallbackReason,
        });
      } catch (error) {
        const reason = (error as Error).message;
        await clearOnce(eventKey);
        console.warn('Falha ao responder direct', {
          senderId,
          eventKey,
          reason,
        });
        if (options.rethrowAutomationFailure) throw error;
        const failedContext = await getLeadContext(senderId);
        let durablePause = false;
        if (failedContext?.instagramFlow) {
          const paused = pauseInstagramFlow(failedContext.instagramFlow);
          try {
            await saveLeadContext({
              senderId: failedContext.senderId,
              commentId: failedContext.commentId,
              username: failedContext.username,
              postId: failedContext.postId,
              postPermalink: failedContext.postPermalink,
              promise: failedContext.promise,
              socialSelling: failedContext.socialSelling,
              instagramFlow: paused.session,
              profileFacts: failedContext.profileFacts,
              personalizedOffer: failedContext.personalizedOffer,
              automationJournal: appendAutomationDecision(
                failedContext.automationJournal,
                {
                  at: new Date().toISOString(),
                  action: paused.event,
                  verifiedFacts: [],
                  rule: decisionRuleFor(paused.reasonCode),
                  result: paused.session.stage,
                  reasonCode: paused.reasonCode,
                },
              ),
              interactions: failedContext.interactions,
            });
            durablePause = true;
            await sendDirectInteractive(senderId, paused.message);
          } catch (retryError) {
            console.warn('Nao foi possivel exibir o botao de retry', {
              senderId,
              error: (retryError as Error).message,
            });
          }
        }
        const fallbackTurn = buildSocialSellingTurn(inboundText, resolvePostPromise({ commentText: inboundText }));
        await notifyOwnerSafely(
          senderId,
          inboundText,
          [
            'BLOQUEADO PELA META, enviar manualmente:',
            '',
            fallbackTurn.reply,
            '',
            `Erro: ${reason}`,
          ].join('\n'),
          fallbackTurn.ownerSummary,
        );
        if (!durablePause) throw error;
      }
    }

    for (const change of changes) {
      const handledComment = await handleCommentWebhookChange(
        change,
        options.rethrowAutomationFailure,
      );
      handled += handledComment;
    }
  }

  if (seen === 0) {
    console.info('Webhook sem itens de mensagem', {
      entries: entries.length,
      object: (payload as { object?: string })?.object,
    });
  }

  return handled;
}

export function needsWebsitePromptCorrection(context?: LeadContext): boolean {
  if (context?.promise.kind !== 'website_prompt') return false;
  if (context.instagramFlow?.promptDeliveredAt) return false;
  return !(context.interactions || []).some(
    (interaction) => interaction.direction === 'out'
      && (
        interaction.text.includes('Aqui esta o prompt que usei')
        || interaction.text.includes('"Crie um site completo')
        || interaction.text.includes('Prompt usado no vídeo')
      ),
  );
}

async function handleCommentWebhookChange(
  change: unknown,
  rethrowAutomationFailure = false,
): Promise<number> {
  const field = (change as { field?: string })?.field || '';
  const value = (change as { value?: unknown })?.value as {
    id?: string;
    text?: string;
    parent_id?: string;
    from?: { id?: string; username?: string };
    media?: { id?: string };
    correlation_id?: string;
  } | undefined;

  if (!value?.id || !value.text?.trim() || !value.media?.id) return 0;
  if (value.parent_id) return 0;
  if (!['comments', 'live_comments'].includes(field)) return 0;

  if (
    config.behavior.commentCampaignMediaIds.length > 0
    && !config.behavior.commentCampaignMediaIds.includes(value.media.id)
  ) {
    console.info('Comentario ignorado porque a midia nao esta na campanha ativa', {
      commentId: value.id,
      mediaId: value.media.id,
    });
    return 0;
  }

  if (isMediaDisabled({ id: value.media.id })) {
    console.info('Comentario ignorado porque o post esta desativado para automacao', {
      commentId: value.id,
      mediaId: value.media.id,
      username: value.from?.username,
    });
    return 0;
  }

  const commentId = value.id;
  if (!(await markOnce(`comment-webhook#${commentId}`))) return 0;

  try {
    const store = await loadStore();
    const contexts = await loadPublishedMediaContextsById();
    const mediaContext = contexts.get(value.media.id);
    const promise = resolveKnownMediaPromise(value.media.id) ?? mediaContext?.promise ?? resolvePostPromise({
      postCaption: mediaContext?.caption,
      commentText: value.text,
    });
    const campaignCopy = resolveCommentCampaignCopy(promise, commentId);
    const flowEntry = createInstagramCommentFlow(value.media.id, {
      correlationId: value.correlation_id,
    });
    const publicReply = flowEntry?.publicReply || campaignCopy.publicReply;
    const privateReply = flowEntry
      ? summarizeInteractiveMessage(flowEntry.message)
      : campaignCopy.privateReply;
    const shouldInbox = matchesCampaignText(value.text, value.media.id);
    if (!shouldInbox) {
      return 0;
    }

    if (!store.hasPrivateReply(commentId)) {
      try {
        const senderId = flowEntry
          ? await sendPrivateReplyInteractive(commentId, flowEntry.message)
          : await sendPrivateReply(commentId, campaignCopy.privateReply);
        await persistInitialInstagramFlowContext({
          senderId,
          commentId,
          username: value.from?.username,
          mediaId: value.media.id,
          commentText: value.text,
          privateReply,
          promise,
          flowEntry,
          privateReplyAccepted: true,
        });
        await store.markPrivateReply(commentId);
        console.info('Inbox enviado via webhook de comentario', {
          commentId,
          mediaId: value.media.id,
          username: value.from?.username,
          promise: promise.label,
          variant: campaignCopy.variant,
          flowId: flowEntry?.session.id,
          flowStage: flowEntry?.session.stage,
        });
      } catch (error) {
        if (!isAlreadyRepliedError(error)) throw error;
        const senderId = value.from?.id;
        if (!senderId) throw new Error('private_reply_recipient_unknown');
        await persistInitialInstagramFlowContext({
          senderId,
          commentId,
          username: value.from?.username,
          mediaId: value.media.id,
          commentText: value.text,
          privateReply,
          promise,
          flowEntry,
          privateReplyAccepted: true,
        });
        await store.markPrivateReply(commentId);
      }
    }

    if (!store.hasPublicReply(commentId)) {
      const expectedSenderId = value.from?.id;
      if (!expectedSenderId) throw new Error('private_reply_context_sender_missing');
      const savedContext = await getLeadContext(expectedSenderId);
      if (!savedContext || savedContext.commentId !== commentId) {
        throw new Error('private_reply_context_missing');
      }
      try {
        await replyToComment(commentId, publicReply);
        await store.markPublicReply(commentId);
        console.info('Comentario respondido via webhook depois da confirmacao da DM', {
          commentId,
          mediaId: value.media.id,
          username: value.from?.username,
          promise: promise.label,
          variant: campaignCopy.variant,
        });
      } catch (error) {
        if (!isAlreadyRepliedError(error)) throw error;
        await store.markPublicReply(commentId);
      }
    }

    return 1;
  } catch (error) {
    await clearOnce(`comment-webhook#${commentId}`);
    console.warn('Falha ao processar comentario via webhook', {
      commentId,
      mediaId: value.media.id,
      username: value.from?.username,
      error: (error as Error).message,
    });
    if (rethrowAutomationFailure) throw error;
    await notifySystemOnce(
      `instagram-sexyflow-${commentId}`,
      [
        'Falha tecnica no SexyFlow Instagram',
        `Comentario: ${commentId}`,
        `Midia: ${value.media.id}`,
        `Erro seguro: ${(error as Error).message.slice(0, 180)}`,
      ].join('\n'),
    );
    return 0;
  }
}

async function persistInitialInstagramFlowContext(input: {
  senderId: string;
  commentId: string;
  username?: string;
  mediaId: string;
  commentText: string;
  privateReply: string;
  promise: ReturnType<typeof resolvePostPromise>;
  flowEntry?: ReturnType<typeof createInstagramCommentFlow>;
  privateReplyAccepted?: boolean;
}): Promise<void> {
  const initialTurn = buildSocialSellingTurn(
    input.commentText || 'comentou no post',
    input.promise,
  );
  const now = new Date().toISOString();
  const interactions: LeadInteraction[] = [
    { at: now, direction: 'in', text: input.commentText || 'comentario no post' },
    { at: now, direction: 'out', text: input.privateReply },
  ];
  await saveLeadContext({
    senderId: input.senderId,
    commentId: input.commentId,
    username: input.username,
    postId: input.mediaId,
    promise: input.promise,
    socialSelling: initialTurn.state,
    instagramFlow: input.flowEntry?.session,
    automationJournal: input.flowEntry ? [{
      at: now,
      action: input.flowEntry.event,
      verifiedFacts: [`media_id:${input.mediaId}`, 'keyword:SARAIVA'],
      rule: 'exact_media_and_keyword',
      result: input.privateReplyAccepted ? 'private_reply_accepted' : 'private_reply_pending',
      reasonCode: input.flowEntry.reasonCode,
    }] : undefined,
    interactions,
  });
  await saveSalesLead({
    senderId: input.senderId,
    commentId: input.commentId,
    username: input.username,
    postId: input.mediaId,
    promiseLabel: input.promise.label,
    snapshot: initialTurn.sales,
    lastInbound: input.commentText || 'comentario no post',
    lastOutbound: input.privateReply,
    interactions,
  });
}

function matchesCampaignText(text: string, mediaId?: string): boolean {
  return mediaId
    ? matchesMediaCampaignTrigger(mediaId, text, config.behavior.triggerWords)
    : matchesCampaignTrigger(text, config.behavior.triggerWords);
}

function isZernioFlowMedia(mediaId?: string): boolean {
  return mediaId === PROSPECTING_FLOW_MEDIA_ID
    || mediaId === WEBSITE_PROMPT_MEDIA_ID;
}

async function resolveCommerceReply(
  senderId: string,
  inboundText: string,
  turn: ReturnType<typeof buildSocialSellingTurn>,
  fallbackReply: string,
): Promise<{ reply: string; source: 'bedrock_or_fallback' | 'woovi' }> {
  if (
    !['website_guide', 'website_automation'].includes(turn.sales.offer)
    || !isWebsiteGuideCheckoutIntent(inboundText)
  ) {
    return { reply: fallbackReply, source: 'bedrock_or_fallback' };
  }
  const orderId = await websiteGuideOrderIdForSender(senderId);
  const correlationId = websiteGuideCorrelationId(senderId, new Date(), orderId);
  const charge = await createWebsiteGuideCharge({
    appId: process.env.WOOVI_APP_ID || '',
    senderId,
    orderId,
    redirectUrl: `${(process.env.WEBSITE_GUIDE_STOREFRONT_URL || 'https://loja.saraiva.ai').replace(/\/+$/, '')}/obrigado?pedido=${encodeURIComponent(correlationId)}`,
    baseUrl: process.env.WOOVI_BASE_URL,
  });
  await saveWebsiteGuidePayment(senderId, charge);
  await putWebsiteGuideCheckoutIntent({
    senderId,
    orderId,
    correlationId: charge.correlationId,
    updatedAt: new Date().toISOString(),
  });
  return {
    reply: buildWebsiteGuideCheckoutReply(charge),
    source: 'woovi',
  };
}

async function saveWebsiteGuidePayment(
  senderId: string,
  charge: WooviCharge,
  options: {
    lead?: WebsiteGuideLeadProfile;
    upgradedFrom?: string;
  } = {},
): Promise<void> {
  if (!tableName) throw new Error('payment_store_unavailable');
  const existing = await getWebsiteGuidePayment(charge.correlationId);
  const record: WebsiteGuidePaymentRecord = {
    ...existing,
    correlationId: charge.correlationId,
    senderId,
    value: charge.value,
    status: charge.status,
    paymentLinkUrl: charge.paymentLinkUrl,
    createdAt: existing?.createdAt || new Date().toISOString(),
    accessType: existing?.accessType || 'paid',
    generationLimit: existing?.generationLimit || WEBSITE_GUIDE_GENERATION_LIMIT,
    ...(options.lead ? { lead: options.lead } : {}),
    ...(options.upgradedFrom ? { upgradedFrom: options.upgradedFrom } : {}),
    transactionId: charge.transactionId || existing?.transactionId,
  };
  await putWebsiteGuidePayment(record);
}

export function normalizeWebsiteGuideLead(
  payload: Record<string, unknown>,
  now = new Date(),
): WebsiteGuideLeadProfile {
  const name = cleanWebsiteGuideLeadText(payload.name, 100);
  const email = cleanWebsiteGuideLeadText(payload.email, 180).toLowerCase();
  const whatsapp = String(payload.whatsapp || '').replace(/\D/g, '').slice(0, 15);
  const city = cleanWebsiteGuideLeadText(payload.city, 120);
  const source = cleanWebsiteGuideLeadText(payload.source, 80) || 'storefront';
  if (name.length < 2) throw new Error('informe seu nome');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('informe um email valido');
  if (whatsapp.length < 10 || whatsapp.length > 15) {
    throw new Error('informe um WhatsApp valido com DDD');
  }
  if (payload.acceptedTerms !== true) {
    throw new Error('aceite os termos e a politica de privacidade');
  }
  return {
    name,
    email,
    whatsapp,
    ...(city ? { city } : {}),
    marketingConsent: payload.marketingConsent === true,
    termsAcceptedAt: now.toISOString(),
    source,
    ...(cleanWebsiteGuideLeadText(payload.utmSource, 100)
      ? { utmSource: cleanWebsiteGuideLeadText(payload.utmSource, 100) }
      : {}),
    ...(cleanWebsiteGuideLeadText(payload.utmMedium, 100)
      ? { utmMedium: cleanWebsiteGuideLeadText(payload.utmMedium, 100) }
      : {}),
    ...(cleanWebsiteGuideLeadText(payload.utmCampaign, 120)
      ? { utmCampaign: cleanWebsiteGuideLeadText(payload.utmCampaign, 120) }
      : {}),
    ...(cleanWebsiteGuideLeadText(payload.referrer, 300)
      ? { referrer: cleanWebsiteGuideLeadText(payload.referrer, 300) }
      : {}),
  };
}

function cleanWebsiteGuideLeadText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

async function handleWebsiteGuideFreeAccess(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (method !== 'POST') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  if (!tableName) {
    return storefrontJson(503, { ok: false, error: 'cadastro temporariamente indisponivel' });
  }
  let lead: WebsiteGuideLeadProfile;
  try {
    lead = normalizeWebsiteGuideLead(parseWebsiteGuideBody(event));
  } catch (error) {
    return storefrontJson(400, { ok: false, error: (error as Error).message });
  }

  try {
    const { record, duplicate } = await createOrReuseWebsiteGuideFreeAccess(lead);
    const storefrontUrl = websiteGuideStorefrontUrl();
    return storefrontJson(200, {
      ok: true,
      duplicate,
      order: record.correlationId,
      redirectUrl: `${storefrontUrl}/obrigado?pedido=${encodeURIComponent(record.correlationId)}&acesso=gratis`,
    });
  } catch (error) {
    console.warn('Falha ao liberar acesso gratuito Cliente Pronto', {
      error: (error as Error).message,
    });
    return storefrontJson(502, {
      ok: false,
      error: 'nao foi possivel liberar o teste agora; tente novamente',
    });
  }
}

async function handleWebsiteGuideLeadCheckout(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (method !== 'POST') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  const payload = parseWebsiteGuideBody(event);
  let lead: WebsiteGuideLeadProfile;
  try {
    lead = normalizeWebsiteGuideLead(payload);
  } catch (error) {
    return storefrontJson(400, { ok: false, error: (error as Error).message });
  }
  const session = cleanWebsiteGuideLeadText(payload.session, 80).toLowerCase();
  const purchase = cleanWebsiteGuideLeadText(payload.purchase, 80).toLowerCase();
  if (!/^[a-z0-9-]{16,80}$/.test(session)) {
    return storefrontJson(400, { ok: false, error: 'sessao invalida' });
  }
  if (!/^[a-f0-9-]{16,80}$/.test(purchase)) {
    return storefrontJson(400, { ok: false, error: 'compra invalida' });
  }
  try {
    const senderId = `store:${session}`;
    const correlationId = websiteGuideCorrelationId(senderId, new Date(), purchase);
    const existing = await getWebsiteGuidePayment(correlationId);
    if (existing?.paymentLinkUrl && existing.status.toUpperCase() !== 'COMPLETED') {
      return storefrontJson(200, { ok: true, checkoutUrl: existing.paymentLinkUrl });
    }
    if (hasWebsiteGuideAccess(existing)) {
      return storefrontJson(200, {
        ok: true,
        checkoutUrl: `${websiteGuideStorefrontUrl()}/obrigado?pedido=${encodeURIComponent(correlationId)}`,
      });
    }
    const charge = await createWebsiteGuideCharge({
      appId: process.env.WOOVI_APP_ID || '',
      senderId,
      orderId: purchase,
      redirectUrl: `${websiteGuideStorefrontUrl()}/obrigado?pedido=${encodeURIComponent(correlationId)}`,
      baseUrl: process.env.WOOVI_BASE_URL,
    });
    await saveWebsiteGuidePayment(senderId, charge, { lead });
    return storefrontJson(200, { ok: true, checkoutUrl: charge.paymentLinkUrl });
  } catch (error) {
    console.warn('Falha ao abrir checkout identificado do Cliente Pronto', {
      error: (error as Error).message,
    });
    return storefrontJson(502, {
      ok: false,
      error: 'nao foi possivel abrir o Pix agora; tente novamente',
    });
  }
}

async function handleWebsiteGuideUpgrade(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (method !== 'POST') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  const payload = parseWebsiteGuideBody(event);
  const freeOrder = cleanWebsiteGuideLeadText(payload.pedido, 80);
  const purchase = cleanWebsiteGuideLeadText(payload.purchase, 80).toLowerCase();
  if (!/^ig-sites-free-[a-f0-9]{24}$/.test(freeOrder)) {
    return storefrontJson(400, { ok: false, error: 'acesso gratuito invalido' });
  }
  if (!/^[a-f0-9-]{16,80}$/.test(purchase)) {
    return storefrontJson(400, { ok: false, error: 'compra invalida' });
  }
  const freeRecord = await getWebsiteGuidePayment(freeOrder);
  if (!freeRecord || freeRecord.accessType !== 'free' || !hasWebsiteGuideAccess(freeRecord)) {
    return storefrontJson(404, { ok: false, error: 'acesso gratuito nao encontrado' });
  }
  try {
    const senderId = `upgrade:${freeOrder}`;
    const correlationId = websiteGuideCorrelationId(senderId, new Date(), purchase);
    const existing = await getWebsiteGuidePayment(correlationId);
    if (existing?.paymentLinkUrl && existing.status.toUpperCase() !== 'COMPLETED') {
      return storefrontJson(200, { ok: true, checkoutUrl: existing.paymentLinkUrl });
    }
    if (hasWebsiteGuideAccess(existing)) {
      return storefrontJson(200, {
        ok: true,
        checkoutUrl: `${websiteGuideStorefrontUrl()}/obrigado?pedido=${encodeURIComponent(correlationId)}`,
      });
    }
    const charge = await createWebsiteGuideCharge({
      appId: process.env.WOOVI_APP_ID || '',
      senderId,
      orderId: purchase,
      redirectUrl: `${websiteGuideStorefrontUrl()}/obrigado?pedido=${encodeURIComponent(correlationId)}`,
      baseUrl: process.env.WOOVI_BASE_URL,
    });
    await saveWebsiteGuidePayment(senderId, charge, {
      lead: freeRecord.lead,
      upgradedFrom: freeOrder,
    });
    return storefrontJson(200, { ok: true, checkoutUrl: charge.paymentLinkUrl });
  } catch (error) {
    console.warn('Falha ao abrir upgrade do Cliente Pronto', {
      freeOrder,
      error: (error as Error).message,
    });
    return storefrontJson(502, {
      ok: false,
      error: 'nao foi possivel abrir o upgrade agora; tente novamente',
    });
  }
}

function parseWebsiteGuideBody(event: LambdaEvent): Record<string, unknown> {
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body || '';
  const parsed = parseJsonBody(rawBody);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function websiteGuideStorefrontUrl(): string {
  return (process.env.WEBSITE_GUIDE_STOREFRONT_URL || 'https://loja.saraiva.ai')
    .replace(/\/+$/, '');
}

async function createOrReuseWebsiteGuideFreeAccess(
  lead: WebsiteGuideLeadProfile,
): Promise<{ record: WebsiteGuidePaymentRecord; duplicate: boolean }> {
  const existing = await findWebsiteGuideFreeAccess(lead);
  if (existing) return { record: existing, duplicate: true };

  const now = new Date().toISOString();
  const correlationId = `ig-sites-free-${createHash('sha256')
    .update(`${randomUUID()}:${lead.email}:${lead.whatsapp}`)
    .digest('hex')
    .slice(0, 24)}`;
  const record: WebsiteGuidePaymentRecord = {
    correlationId,
    senderId: `lead:${websiteGuideIdentityHash(`${lead.email}:${lead.whatsapp}`)}`,
    value: 0,
    status: 'COMPLETED',
    paymentLinkUrl: '',
    createdAt: now,
    accessType: 'free',
    accessGrantedAt: now,
    generationLimit: WEBSITE_GUIDE_FREE_GENERATION_LIMIT,
    generationCount: 0,
    lead,
  };
  const identityRecord = JSON.stringify({ correlationId, createdAt: now });
  try {
    await dynamo.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              pk: { S: `${storeAccount}#website-guide-free-identities` },
              sk: { S: `email#${websiteGuideIdentityHash(lead.email)}` },
              data: { S: identityRecord },
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              pk: { S: `${storeAccount}#website-guide-free-identities` },
              sk: { S: `phone#${websiteGuideIdentityHash(lead.whatsapp)}` },
              data: { S: identityRecord },
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: websiteGuidePaymentItem(record),
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ],
    }));
    return { record, duplicate: false };
  } catch (error) {
    const duplicate = await findWebsiteGuideFreeAccess(lead);
    if (duplicate) return { record: duplicate, duplicate: true };
    throw error;
  }
}

async function findWebsiteGuideFreeAccess(
  lead: Pick<WebsiteGuideLeadProfile, 'email' | 'whatsapp'>,
): Promise<WebsiteGuidePaymentRecord | undefined> {
  for (const sk of [
    `email#${websiteGuideIdentityHash(lead.email)}`,
    `phone#${websiteGuideIdentityHash(lead.whatsapp)}`,
  ]) {
    const response = await dynamo.send(new GetItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: `${storeAccount}#website-guide-free-identities` },
        sk: { S: sk },
      },
      ConsistentRead: true,
    }));
    const raw = response.Item?.data?.S;
    if (!raw) continue;
    try {
      const correlationId = (JSON.parse(raw) as { correlationId?: string }).correlationId;
      if (correlationId) {
        const record = await getWebsiteGuidePayment(correlationId);
        if (record) return record;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function websiteGuideIdentityHash(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 40);
}

async function handleWebsiteGuideStorefrontHttp(
  event: LambdaEvent,
  method: string,
  path: string,
): Promise<LambdaResponse> {
  if (path.endsWith('/free')) {
    return handleWebsiteGuideFreeAccess(event, method);
  }
  if (path.endsWith('/lead-checkout')) {
    return handleWebsiteGuideLeadCheckout(event, method);
  }
  if (path.endsWith('/upgrade')) {
    return handleWebsiteGuideUpgrade(event, method);
  }
  if (path.endsWith('/admin/orders/action')) {
    return handleWebsiteGuideAdminAction(event, method);
  }
  if (path.endsWith('/admin/orders')) {
    return handleWebsiteGuideAdminOrders(event, method);
  }
  if (path.endsWith('/subscription/status')) {
    return handleAgencySubscriptionStatus(event, method);
  }
  if (path.endsWith('/subscription')) {
    return handleAgencySubscriptionCheckout(event, method);
  }
  if (path.endsWith('/generate')) {
    return handleWebsiteGuideAutomation(event, method);
  }
  if (method !== 'GET') return storefrontJson(405, { ok: false, error: 'method not allowed' });
  const params = event.queryStringParameters || {};

  if (path.endsWith('/status')) {
    const correlationId = String(params.pedido || '').trim();
    if (!isWebsiteAccessCorrelationId(correlationId)) {
      return storefrontJson(400, { ok: false, error: 'pedido invalido' });
    }
    let record = await getWebsiteGuidePayment(correlationId);
    if (!record) return storefrontJson(404, { ok: false, error: 'pedido nao encontrado' });
    if (record.accessType !== 'free' && record.status.toUpperCase() !== 'COMPLETED') {
      record = await refreshWebsiteGuidePayment(record);
    }
    if (!hasWebsiteGuideAccess(record)) {
      return storefrontJson(200, {
        ok: true,
        paid: false,
        accessGranted: false,
        status: record.status,
      });
    }
    return storefrontJson(200, {
      ok: true,
      paid: Boolean(record.paidAt),
      accessGranted: true,
      accessType: record.accessType || 'paid',
      status: record.status,
      downloadUrl: await createWebsiteGuideDownloadUrl(),
      pluginUrl: await createClientReadyPluginDownloadUrl(),
      usage: websiteGuideUsage(record),
      expiresInSeconds: 7 * 24 * 60 * 60,
      ...(record.automation?.status === 'COMPLETED'
        && record.automation.prompt
        && record.automation.business
        ? {
            automation: {
              prompt: record.automation.prompt,
              business: record.automation.business,
              kit: record.automation.kit || buildClientReadyKit(record.automation.business),
            },
          }
        : {}),
    });
  }

  const session = String(params.session || '').trim().toLowerCase();
  const purchase = String(params.purchase || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{16,80}$/.test(session)) {
    return storefrontJson(400, { ok: false, error: 'sessao invalida' });
  }
  if (!/^[a-f0-9-]{16,80}$/.test(purchase)) {
    return storefrontJson(400, { ok: false, error: 'compra invalida' });
  }
  const senderId = `store:${session}`;
  const correlationId = websiteGuideCorrelationId(senderId, new Date(), purchase);
  const storefrontUrl = (process.env.WEBSITE_GUIDE_STOREFRONT_URL || 'https://loja.saraiva.ai')
    .replace(/\/+$/, '');
  const existing = await getWebsiteGuidePayment(correlationId);
  if (existing?.paymentLinkUrl && existing.status.toUpperCase() !== 'COMPLETED') {
    return redirect(existing.paymentLinkUrl);
  }
  if (existing?.status.toUpperCase() === 'COMPLETED') {
    return redirect(`${storefrontUrl}/obrigado?pedido=${encodeURIComponent(correlationId)}`);
  }

  const charge = await createWebsiteGuideCharge({
    appId: process.env.WOOVI_APP_ID || '',
    senderId,
    orderId: purchase,
    redirectUrl: `${storefrontUrl}/obrigado?pedido=${encodeURIComponent(correlationId)}`,
    baseUrl: process.env.WOOVI_BASE_URL,
  });
  await saveWebsiteGuidePayment(senderId, charge);
  return redirect(charge.paymentLinkUrl);
}

async function handleWebsiteGuideAdminOrders(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (!isWebsiteGuideAdminAuthorized(event)) {
    return storefrontJson(401, { ok: false, error: 'unauthorized' });
  }
  if (method !== 'GET') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  const requestedLimit = Number(event.queryStringParameters?.limit || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.trunc(requestedLimit), 250))
    : 100;
  const orders = await listWebsiteGuideAdminOrders(limit);
  return storefrontJson(200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    orders,
  });
}

async function handleWebsiteGuideAdminAction(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (!isWebsiteGuideAdminAuthorized(event)) {
    return storefrontJson(401, { ok: false, error: 'unauthorized' });
  }
  if (method !== 'POST') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body || '';
  const payload = parseJsonBody(rawBody) as {
    pedido?: unknown;
    action?: unknown;
  };
  const correlationId = typeof payload.pedido === 'string' ? payload.pedido.trim() : '';
  const action = typeof payload.action === 'string' ? payload.action.trim() : '';
  if (!/^ig-sites-guide-\d{6}-[a-f0-9]{20}$/.test(correlationId)) {
    return storefrontJson(400, { ok: false, error: 'pedido invalido' });
  }
  const record = await getWebsiteGuidePayment(correlationId);
  if (!record) {
    return storefrontJson(404, { ok: false, error: 'pedido nao encontrado' });
  }

  if (action === 'refresh_payment') {
    const updated = await refreshWebsiteGuidePayment(record);
    return storefrontJson(200, {
      ok: true,
      order: websiteGuideAdminOrder(updated),
    });
  }

  if (action === 'reset_automation') {
    if (record.status.toUpperCase() !== 'COMPLETED' || !record.paidAt) {
      return storefrontJson(409, {
        ok: false,
        error: 'somente pedido pago pode receber novo uso',
      });
    }
    const resetAt = new Date().toISOString();
    const history = [
      ...(record.automationHistory || []),
      ...(record.automation
        ? [{
            status: record.automation.status,
            businessName: record.automation.business?.name,
            businessInput: record.automation.businessInput,
            generatedAt: record.automation.generatedAt,
            resetAt,
          }]
        : []),
    ].slice(-10);
    const { automation: _previousAutomation, ...recordWithoutAutomation } = record;
    const reset: WebsiteGuidePaymentRecord = {
      ...recordWithoutAutomation,
      automationHistory: history,
    };
    await putWebsiteGuidePayment(reset);
    return storefrontJson(200, {
      ok: true,
      order: websiteGuideAdminOrder(reset),
    });
  }

  return storefrontJson(400, { ok: false, error: 'acao invalida' });
}

function isWebsiteGuideAdminAuthorized(event: LambdaEvent): boolean {
  const authorization = header(event.headers || {}, 'authorization')?.trim() || '';
  const received = authorization.replace(/^Bearer\s+/i, '');
  const expected = process.env.WEBSITE_GUIDE_ADMIN_TOKEN?.trim()
    || process.env.WOOVI_WEBHOOK_AUTH?.trim();
  return secureStringEquals(received, expected);
}

async function handleAgencySubscriptionCheckout(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (method !== 'POST') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  return storefrontJson(410, {
    ok: false,
    error: 'esta assinatura nao aceita novas adesoes',
  });
}

async function handleAgencySubscriptionStatus(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (method !== 'GET') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  const correlationId = String(event.queryStringParameters?.pedido || '').trim();
  if (!/^ig-sites-sub-[a-f0-9]{24}$/.test(correlationId)) {
    return storefrontJson(400, { ok: false, error: 'assinatura invalida' });
  }
  const existing = await getAgencySubscriptionRecord(correlationId);
  if (!existing) {
    return storefrontJson(404, { ok: false, error: 'assinatura nao encontrada' });
  }

  let subscription: AgencySubscription;
  try {
    subscription = await getAgencySubscription({
      appId: process.env.WOOVI_APP_ID || '',
      correlationId,
      baseUrl: process.env.WOOVI_BASE_URL,
    });
  } catch (error) {
    console.warn('Falha temporaria ao consultar assinatura Woovi', {
      correlationId,
      error: (error as Error).message,
    });
    return storefrontJson(200, {
      ok: true,
      active: Boolean(existing.approvedAt),
      paid: Boolean(existing.approvedAt),
      status: existing.status,
      pixRecurringStatus: existing.pixRecurringStatus,
    });
  }

  const active = isAgencySubscriptionActive(subscription);
  const updated: AgencySubscriptionRecord = {
    ...existing,
    globalId: subscription.globalId,
    value: subscription.value,
    status: subscription.status,
    pixRecurringStatus: subscription.pixRecurringStatus,
    paymentLinkUrl: subscription.paymentLinkUrl,
    ...(active ? { approvedAt: existing.approvedAt || new Date().toISOString() } : {}),
  };
  await putAgencySubscriptionRecord(updated);

  if (active) {
    const access = await getWebsiteGuidePayment(correlationId);
    if (!access?.paidAt) {
      await putWebsiteGuidePayment({
        correlationId,
        senderId: `subscription:${existing.sessionId}`,
        value: AGENCY_SUBSCRIPTION_VALUE_CENTS,
        status: 'COMPLETED',
        paymentLinkUrl: subscription.paymentLinkUrl,
        createdAt: existing.createdAt,
        paidAt: updated.approvedAt || new Date().toISOString(),
      });
    }
  }

  return storefrontJson(200, {
    ok: true,
    active,
    paid: active,
    status: updated.status,
    pixRecurringStatus: updated.pixRecurringStatus,
    ...(active
      ? {
          downloadUrl: await createWebsiteGuideDownloadUrl(),
          pluginUrl: await createClientReadyPluginDownloadUrl(),
          expiresInSeconds: 7 * 24 * 60 * 60,
        }
      : {}),
  });
}

async function handleWebsiteGuideAutomation(
  event: LambdaEvent,
  method: string,
): Promise<LambdaResponse> {
  if (method !== 'POST') {
    return storefrontJson(405, { ok: false, error: 'method not allowed' });
  }
  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body || '';
  const payload = parseJsonBody(rawBody) as {
    pedido?: unknown;
    business?: unknown;
    location?: unknown;
  };
  const correlationId = typeof payload.pedido === 'string' ? payload.pedido.trim() : '';
  if (!isWebsiteAccessCorrelationId(correlationId)) {
    return storefrontJson(400, { ok: false, error: 'pedido invalido' });
  }
  let record = await getWebsiteGuidePayment(correlationId);
  if (!record) return storefrontJson(404, { ok: false, error: 'pedido nao encontrado' });
  if (record.accessType !== 'free' && record.status.toUpperCase() !== 'COMPLETED') {
    record = await refreshWebsiteGuidePayment(record);
  }
  if (!hasWebsiteGuideAccess(record)) {
    return storefrontJson(402, { ok: false, error: 'acesso ainda nao liberado' });
  }

  const business = typeof payload.business === 'string'
    ? payload.business.replace(/\s+/g, ' ').trim().slice(0, 500)
    : '';
  const location = typeof payload.location === 'string'
    ? payload.location.replace(/\s+/g, ' ').trim().slice(0, 160)
    : '';
  if (business.length < 3) {
    return storefrontJson(400, { ok: false, error: 'informe o negocio ou link do Google Maps' });
  }
  const inputHash = createHash('sha256')
    .update(JSON.stringify({ business, location }))
    .digest('hex');
  if (
    record.automation?.status === 'COMPLETED'
    && record.automation.inputHash === inputHash
    && record.automation.prompt
    && record.automation.business
  ) {
    return storefrontJson(200, {
      ok: true,
      cached: true,
      prompt: record.automation.prompt,
      business: record.automation.business,
      kit: record.automation.kit || buildClientReadyKit(record.automation.business),
      usage: websiteGuideUsage(record),
    });
  }
  const usage = websiteGuideUsage(record);
  if (record.automation?.status === 'COMPLETED') {
    if (usage.remaining <= 0) {
      return storefrontJson(409, {
        ok: false,
        error: usage.limit === 1
          ? 'a prospeccao gratuita deste acesso ja foi utilizada'
          : `as ${usage.limit} prospeccoes deste pedido ja foram utilizadas`,
        usage,
      });
    }
  }
  if (
    record.automation?.status === 'RUNNING'
    && record.automation.inputHash === inputHash
    && !isWebsiteGuideAutomationLeaseExpired(record.automation)
  ) {
    return storefrontJson(409, {
      ok: false,
      error: 'a automacao deste negocio ja esta em andamento',
    });
  }

  const startedAt = new Date();
  const previousAutomation = record.automation;
  const running: WebsiteGuidePaymentRecord = {
    ...record,
    generationCount: usage.used,
    ...(previousAutomation?.status === 'COMPLETED'
      ? {
          automationHistory: [
            ...(record.automationHistory || []),
            {
              status: previousAutomation.status,
              businessName: previousAutomation.business?.name,
              businessInput: previousAutomation.businessInput,
              generatedAt: previousAutomation.generatedAt,
              resetAt: startedAt.toISOString(),
            },
          ],
        }
      : {}),
    automation: {
      status: 'RUNNING',
      inputHash,
      businessInput: business,
      startedAt: startedAt.toISOString(),
      lockExpiresAt: new Date(startedAt.getTime() + 10 * 60_000).toISOString(),
      ...(location ? { locationInput: location } : {}),
    },
  };
  const acquired = await putWebsiteGuideAutomationState(running, {
    acquire: true,
    expectedPreviousInputHash: previousAutomation?.status === 'COMPLETED'
      ? previousAutomation.inputHash
      : undefined,
  });
  if (!acquired) {
    const current = await getWebsiteGuidePayment(correlationId);
    if (
      current?.automation?.status === 'COMPLETED'
      && current.automation.inputHash === inputHash
      && current.automation.prompt
      && current.automation.business
    ) {
      return storefrontJson(200, {
        ok: true,
        cached: true,
        prompt: current.automation.prompt,
        business: current.automation.business,
        kit: current.automation.kit || buildClientReadyKit(current.automation.business),
        usage: websiteGuideUsage(current),
      });
    }
    return storefrontJson(409, {
      ok: false,
      error: current?.automation?.status === 'COMPLETED'
        ? 'outra prospeccao foi concluida; atualize e tente novamente'
        : 'a automacao deste pedido ja esta em andamento',
      usage: current ? websiteGuideUsage(current) : usage,
    });
  }
  try {
    const apifyToken = await getApifyToken();
    const lookup = await lookupBusinessWithApify({
      token: apifyToken,
      business,
      location,
      baseUrl: process.env.APIFY_BASE_URL,
    });
    const businessData = businessPromptData(lookup.place);
    const prompt = buildReadySitePrompt(businessData);
    const kit = buildClientReadyKit(businessData);
    const completed: WebsiteGuidePaymentRecord = {
      ...running,
      generationCount: usage.used + 1,
      automation: {
        ...running.automation!,
        status: 'COMPLETED',
        business: businessData,
        prompt,
        kit,
        generatedAt: new Date().toISOString(),
      },
    };
    const saved = await putWebsiteGuideAutomationState(completed, {
      expectedRunningInputHash: inputHash,
    });
    if (!saved) {
      return storefrontJson(409, {
        ok: false,
        error: 'o estado deste pedido mudou durante a geracao',
      });
    }
    await notifyOwnerSafely(
      record.senderId,
      'Dossie Cliente Pronto concluido',
      `${businessData.name}: dados coletados no Apify e pacote comercial pronto entregue.`,
      `Produto entregue: ${WEBSITE_GUIDE_PRODUCT}.`,
    );
    return storefrontJson(200, {
      ok: true,
      cached: false,
      prompt,
      business: businessData,
      kit,
      usage: websiteGuideUsage(completed),
    });
  } catch (error) {
    const code = (error as Error).message;
    await putWebsiteGuideAutomationState({
      ...running,
      automation: {
        ...running.automation!,
        status: 'FAILED',
        error: code,
      },
    }, {
      expectedRunningInputHash: inputHash,
    });
    console.warn('Falha na automacao Apify do prompt', {
      correlationId,
      error: code,
    });
    return storefrontJson(
      code === 'apify_business_not_found' ? 422 : 502,
      {
        ok: false,
        error: code === 'apify_business_not_found'
          ? 'nao encontramos esse negocio; confira o link ou informe nome e cidade'
          : 'a coleta demorou mais que o esperado; tente novamente',
      },
    );
  }
}

export function websiteGuideUsage(record: {
  generationCount?: number;
  generationLimit?: number;
  automation?: { status: string };
  automationHistory?: Array<{ status: string }>;
}): { used: number; limit: number; remaining: number } {
  const limit = Number.isInteger(record.generationLimit)
    ? Math.max(1, Math.min(WEBSITE_GUIDE_GENERATION_LIMIT, Number(record.generationLimit)))
    : WEBSITE_GUIDE_GENERATION_LIMIT;
  const inferred = (record.automationHistory || [])
    .filter((item) => item.status === 'COMPLETED').length
    + (record.automation?.status === 'COMPLETED' ? 1 : 0);
  const used = Math.max(
    0,
    Math.min(
      limit,
      Number.isInteger(record.generationCount)
        ? Number(record.generationCount)
        : inferred,
    ),
  );
  return {
    used,
    limit,
    remaining: limit - used,
  };
}

function isWebsiteAccessCorrelationId(correlationId: string): boolean {
  return /^ig-sites-guide-\d{6}-[a-f0-9]{20}$/.test(correlationId)
    || /^ig-sites-sub-[a-f0-9]{24}$/.test(correlationId)
    || /^ig-sites-free-[a-f0-9]{24}$/.test(correlationId);
}

function hasWebsiteGuideAccess(
  record?: Pick<
    WebsiteGuidePaymentRecord,
    'status' | 'paidAt' | 'accessGrantedAt' | 'accessType'
  >,
): boolean {
  if (!record || record.status.toUpperCase() !== 'COMPLETED') return false;
  return Boolean(record.paidAt || record.accessGrantedAt || record.accessType === 'subscription');
}

export function isWebsiteGuideAutomationLeaseExpired(
  automation: { status: string; lockExpiresAt?: string },
  now = new Date(),
): boolean {
  if (automation.status !== 'RUNNING') return false;
  if (!automation.lockExpiresAt) return true;
  const expiresAt = Date.parse(automation.lockExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

async function refreshWebsiteGuidePayment(
  record: WebsiteGuidePaymentRecord,
): Promise<WebsiteGuidePaymentRecord> {
  try {
    const charge = await getWebsiteGuideCharge({
      appId: process.env.WOOVI_APP_ID || '',
      correlationId: record.correlationId,
      baseUrl: process.env.WOOVI_BASE_URL,
    });
    return reconcileWebsiteGuideCharge(record, charge);
  } catch (error) {
    console.warn('Falha temporaria ao consultar cobranca Woovi', {
      correlationId: record.correlationId,
      error: (error as Error).message,
    });
    return record;
  }
}

async function pollWebsiteGuidePayments(limit = 25): Promise<WebsiteGuidePaymentPollSummary> {
  if (!tableName || !process.env.WOOVI_APP_ID?.trim()) {
    return { checked: 0, completed: 0, failed: 0 };
  }
  const requested = Math.max(1, Math.min(limit, 50));
  const records: WebsiteGuidePaymentRecord[] = [];
  let exclusiveStartKey: QueryCommandInput['ExclusiveStartKey'];
  do {
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `${storeAccount}#website-guide-payments` },
      },
      ConsistentRead: true,
      Limit: 50,
      ExclusiveStartKey: exclusiveStartKey,
    }));
    for (const item of response.Items || []) {
      const raw = item.data?.S;
      if (!raw) continue;
      try {
        const record = JSON.parse(raw) as WebsiteGuidePaymentRecord;
        if (!['COMPLETED', 'EXPIRED'].includes(record.status.toUpperCase())) {
          records.push(record);
        }
      } catch {
        continue;
      }
      if (records.length >= requested) break;
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey && records.length < requested);
  let completed = 0;
  let failed = 0;
  for (const record of records) {
    try {
      const charge = await getWebsiteGuideCharge({
        appId: process.env.WOOVI_APP_ID,
        correlationId: record.correlationId,
        baseUrl: process.env.WOOVI_BASE_URL,
      });
      const updated = await reconcileWebsiteGuideCharge(record, charge);
      if (updated.status.toUpperCase() === 'COMPLETED') completed++;
    } catch (error) {
      failed++;
      console.warn('Falha ao reconciliar pagamento Woovi', {
        correlationId: record.correlationId,
        error: (error as Error).message,
      });
    }
  }
  return { checked: records.length, completed, failed };
}

async function listWebsiteGuideAdminOrders(limit: number): Promise<WebsiteGuideAdminOrder[]> {
  if (!tableName) return [];
  const records: WebsiteGuidePaymentRecord[] = [];
  let exclusiveStartKey: QueryCommandInput['ExclusiveStartKey'];
  do {
    const response = await dynamo.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `${storeAccount}#website-guide-payments` },
      },
      ConsistentRead: true,
      Limit: Math.min(100, Math.max(limit, 25)),
      ExclusiveStartKey: exclusiveStartKey,
    }));
    for (const item of response.Items || []) {
      const raw = item.data?.S;
      if (!raw) continue;
      try {
        records.push(JSON.parse(raw) as WebsiteGuidePaymentRecord);
      } catch {
        continue;
      }
      if (records.length >= limit) break;
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey && records.length < limit);

  return records
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit)
    .map(websiteGuideAdminOrder);
}

function websiteGuideAdminOrder(record: WebsiteGuidePaymentRecord): WebsiteGuideAdminOrder {
  const usage = websiteGuideUsage(record);
  return {
    correlationId: record.correlationId,
    value: record.value,
    status: record.status,
    accessType: record.accessType
      || (record.senderId.startsWith('subscription:') ? 'subscription' : 'paid'),
    createdAt: record.createdAt,
    accessGrantedAt: record.accessGrantedAt,
    paidAt: record.paidAt,
    deliveredAt: record.deliveredAt,
    lead: record.lead,
    upgradedFrom: record.upgradedFrom,
    automationStatus: record.automation?.status || 'NOT_STARTED',
    businessName: record.automation?.business?.name,
    businessInput: record.automation?.businessInput,
    locationInput: record.automation?.locationInput,
    generatedAt: record.automation?.generatedAt,
    error: record.automation?.error,
    resetCount: record.automationHistory?.length || 0,
    generationCount: usage.used,
    generationLimit: usage.limit,
    generationRemaining: usage.remaining,
  };
}

async function reconcileWebsiteGuideCharge(
  record: WebsiteGuidePaymentRecord,
  charge: WooviChargeStatus,
): Promise<WebsiteGuidePaymentRecord> {
  if (charge.status.toUpperCase() !== 'COMPLETED') {
    if (charge.status !== record.status) {
      const updated = { ...record, status: charge.status };
      await putWebsiteGuidePayment(updated);
      return updated;
    }
    return record;
  }
  return completeWebsiteGuidePayment(record, {
    transactionId: charge.transactionId,
    paidAt: charge.paidAt,
  });
}

async function getWebsiteGuidePayment(
  correlationId: string,
): Promise<WebsiteGuidePaymentRecord | undefined> {
  if (!tableName) return undefined;
  const response = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#website-guide-payments` },
      sk: { S: correlationId },
    },
    ConsistentRead: true,
  }));
  const raw = response.Item?.data?.S;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as WebsiteGuidePaymentRecord;
  } catch {
    return undefined;
  }
}

async function websiteGuideOrderIdForSender(senderId: string): Promise<string> {
  const intent = await getWebsiteGuideCheckoutIntent(senderId);
  if (intent) {
    let payment = await getWebsiteGuidePayment(intent.correlationId);
    if (payment && shouldReuseWebsiteGuideCheckoutIntent(payment.status)) {
      payment = await refreshWebsiteGuidePayment(payment);
    }
    if (payment && shouldReuseWebsiteGuideCheckoutIntent(payment.status)) {
      return intent.orderId;
    }
  }
  return randomUUID();
}

export function shouldReuseWebsiteGuideCheckoutIntent(status: string): boolean {
  return !['COMPLETED', 'EXPIRED'].includes(status.toUpperCase());
}

export function websiteGuideAutomationConditionNames(
  acquire: boolean,
): Record<string, string> {
  return acquire
    ? {
        '#automationStatus': 'automationStatus',
        '#automationLockExpiresAt': 'automationLockExpiresAt',
        '#automationInputHash': 'automationInputHash',
      }
    : {
        '#automationStatus': 'automationStatus',
        '#automationInputHash': 'automationInputHash',
      };
}

async function getWebsiteGuideCheckoutIntent(
  senderId: string,
): Promise<WebsiteGuideCheckoutIntent | undefined> {
  if (!tableName) return undefined;
  const senderKey = createHash('sha256').update(senderId).digest('hex').slice(0, 32);
  const response = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#website-guide-checkout-intents` },
      sk: { S: senderKey },
    },
    ConsistentRead: true,
  }));
  const raw = response.Item?.data?.S;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as WebsiteGuideCheckoutIntent;
  } catch {
    return undefined;
  }
}

async function putWebsiteGuideCheckoutIntent(
  intent: WebsiteGuideCheckoutIntent,
): Promise<void> {
  const senderKey = createHash('sha256').update(intent.senderId).digest('hex').slice(0, 32);
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#website-guide-checkout-intents` },
      sk: { S: senderKey },
      updatedAt: { S: intent.updatedAt },
      data: { S: JSON.stringify(intent) },
    },
  }));
}

async function putWebsiteGuidePayment(record: WebsiteGuidePaymentRecord): Promise<void> {
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: websiteGuidePaymentItem(record),
  }));
}

function websiteGuidePaymentItem(record: WebsiteGuidePaymentRecord): Record<string, AttributeValue> {
  return {
    pk: { S: `${storeAccount}#website-guide-payments` },
    sk: { S: record.correlationId },
    status: { S: record.status },
    senderId: { S: record.senderId },
    updatedAt: { S: new Date().toISOString() },
    data: { S: JSON.stringify(record) },
  };
}

async function putWebsiteGuideAutomationState(
  record: WebsiteGuidePaymentRecord,
  condition: {
    acquire?: boolean;
    expectedRunningInputHash?: string;
    expectedPreviousInputHash?: string;
  },
): Promise<boolean> {
  const automation = record.automation;
  if (!automation) throw new Error('automation_state_missing');
  const expressionNames = websiteGuideAutomationConditionNames(Boolean(condition.acquire));
  const expressionValues: Record<string, AttributeValue> = condition.acquire
    ? {
        ':failed': { S: 'FAILED' },
        ':running': { S: 'RUNNING' },
        ':completed': { S: 'COMPLETED' },
        ':now': { S: new Date().toISOString() },
        ':previousInputHash': { S: condition.expectedPreviousInputHash || '' },
      }
    : {
        ':running': { S: 'RUNNING' },
        ':inputHash': { S: condition.expectedRunningInputHash || '' },
      };
  try {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#website-guide-payments` },
        sk: { S: record.correlationId },
        status: { S: record.status },
        senderId: { S: record.senderId },
        automationStatus: { S: automation.status },
        automationInputHash: { S: automation.inputHash },
        ...(record.generationCount !== undefined
          ? { automationGenerationCount: { N: String(record.generationCount) } }
          : {}),
        ...(automation.lockExpiresAt
          ? { automationLockExpiresAt: { S: automation.lockExpiresAt } }
          : {}),
        updatedAt: { S: new Date().toISOString() },
        data: { S: JSON.stringify(record) },
      },
      ConditionExpression: condition.acquire
        ? [
            'attribute_not_exists(#automationStatus)',
            '#automationStatus = :failed',
            '(#automationStatus = :running AND (attribute_not_exists(#automationLockExpiresAt) OR #automationLockExpiresAt < :now))',
            '(#automationStatus = :completed AND #automationInputHash = :previousInputHash)',
          ].join(' OR ')
        : '#automationStatus = :running AND #automationInputHash = :inputHash',
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }));
    return true;
  } catch (error) {
    if (isConditionalFailure(error)) return false;
    throw error;
  }
}

async function getAgencySubscriptionRecord(
  correlationId: string,
): Promise<AgencySubscriptionRecord | undefined> {
  if (!tableName) return undefined;
  const response = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#agency-subscriptions` },
      sk: { S: correlationId },
    },
    ConsistentRead: true,
  }));
  const raw = response.Item?.data?.S;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as AgencySubscriptionRecord;
  } catch {
    return undefined;
  }
}

async function putAgencySubscriptionRecord(record: AgencySubscriptionRecord): Promise<void> {
  if (!tableName) throw new Error('payment_store_unavailable');
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#agency-subscriptions` },
      sk: { S: record.correlationId },
      status: { S: record.status },
      updatedAt: { S: new Date().toISOString() },
      data: { S: JSON.stringify(record) },
    },
  }));
}

async function handleWooviHttp(
  event: LambdaEvent,
  rawBody: string,
): Promise<LambdaResponse> {
  const headers = event.headers || {};
  const authorized = verifyWooviWebhook({
    rawBody,
    signature: header(headers, 'x-openpix-signature'),
    hmacSecret: process.env.WOOVI_WEBHOOK_HMAC_SECRET,
    authorization: header(headers, 'authorization')
      || event.queryStringParameters?.authorization
      || event.queryStringParameters?.auth,
    expectedAuthorization: process.env.WOOVI_WEBHOOK_AUTH,
  });
  if (!authorized) {
    console.warn('Webhook Woovi recusado: autenticacao invalida');
    return json(401, { ok: false });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json(400, { ok: false, error: 'invalid json' });
  }
  const payment = parseCompletedGuidePayment(payload);
  if (!payment) {
    return json(200, { ok: true, handled: false });
  }
  const record = await getWebsiteGuidePayment(payment.correlationId);
  if (!record || !isSupportedWebsiteGuideValue(record.value)) {
    console.warn('Pagamento Woovi sem pedido local correspondente', {
      correlationId: payment.correlationId,
    });
    return json(200, { ok: true, handled: false });
  }
  if (record.deliveredAt || (record.senderId.startsWith('store:') && record.paidAt)) {
    return json(200, { ok: true, handled: true, duplicate: true });
  }

  await completeWebsiteGuidePayment(record, {
    transactionId: payment.transactionId,
    paidAt: payment.paidAt,
  });
  return json(200, {
    ok: true,
    handled: true,
    duplicate: false,
    channel: record.senderId.startsWith('store:') ? 'storefront' : 'instagram',
  });
}

async function completeWebsiteGuidePayment(
  record: WebsiteGuidePaymentRecord,
  payment: { transactionId?: string; paidAt?: string },
): Promise<WebsiteGuidePaymentRecord> {
  if (record.deliveredAt || (record.senderId.startsWith('store:') && record.paidAt)) {
    return record;
  }
  const completed: WebsiteGuidePaymentRecord = {
    ...record,
    status: 'COMPLETED',
    transactionId: payment.transactionId || record.transactionId,
    paidAt: payment.paidAt || record.paidAt || new Date().toISOString(),
  };

  if (record.senderId.startsWith('store:')) {
    await putWebsiteGuidePayment(completed);
    await notifyOwnerSafely(
      record.senderId,
      'Pagamento Woovi confirmado na loja',
      'Download liberado automaticamente na pagina de obrigado.',
      `Venda confirmada: ${WEBSITE_GUIDE_PRODUCT} por ${formatBrl(record.value)}.`,
    );
    return completed;
  }

  const [downloadUrl, pluginUrl] = await Promise.all([
    createWebsiteGuideDownloadUrl(),
    createClientReadyPluginDownloadUrl(),
  ]);
  const storefrontUrl = (process.env.WEBSITE_GUIDE_STOREFRONT_URL || 'https://loja.saraiva.ai')
    .replace(/\/+$/, '');
  const deliveryMessage = [
    'Pagamento confirmado. ✅',
    '',
    'Sua Extensao Cliente Pronto esta liberada aqui:',
    `${storefrontUrl}/obrigado?pedido=${encodeURIComponent(record.correlationId)}`,
    '',
    'Download direto da extensao:',
    pluginUrl,
    '',
    'Instale no Chrome, abra uma empresa no Google Maps e use o seu WhatsApp Web ja conectado. Revise a mensagem antes de enviar.',
    '',
    'A compra inclui 10 prospeccoes completas. Abra uma empresa no Maps, gere o material, revise a abordagem e repita com as proximas oportunidades.',
    '',
    'Bonus — apostila pratica em PDF:',
    downloadUrl,
    '',
    'Os links ficam disponiveis por 7 dias.',
  ].join('\n');
  await sendDirectMessage(record.senderId, deliveryMessage);
  completed.deliveredAt = new Date().toISOString();
  await putWebsiteGuidePayment(completed);
  const context = await getLeadContext(record.senderId);
  if (context) {
    await saveLeadContext({
      senderId: context.senderId,
      commentId: context.commentId,
      username: context.username,
      postId: context.postId,
      postPermalink: context.postPermalink,
      promise: context.promise,
      socialSelling: context.socialSelling,
      instagramFlow: context.instagramFlow,
      profileFacts: context.profileFacts,
      automationJournal: context.automationJournal,
      personalizedOffer: context.personalizedOffer,
      interactions: [
        ...(context.interactions || []),
        { at: completed.deliveredAt, direction: 'out', text: deliveryMessage },
      ],
    });
  }
  await notifyOwnerSafely(
    record.senderId,
    'Pagamento Woovi confirmado',
    'Apostila entregue automaticamente no Direct.',
    `Venda confirmada: ${WEBSITE_GUIDE_PRODUCT} por ${formatBrl(record.value)}.`,
  );
  return completed;
}

function formatBrl(valueCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueCents / 100);
}

async function createWebsiteGuideDownloadUrl(): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: websiteGuideBucket,
      Key: websiteGuideKey,
      ResponseContentDisposition: 'attachment; filename="apostila-sites-chatgpt.pdf"',
      ResponseContentType: 'application/pdf',
    }),
    { expiresIn: 7 * 24 * 60 * 60 },
  );
}

async function createClientReadyPluginDownloadUrl(): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: websiteGuideBucket,
      Key: clientReadyPluginKey,
      ResponseContentDisposition: 'attachment; filename="cliente-pronto-chrome-v0.1.0.zip"',
      ResponseContentType: 'application/zip',
    }),
    { expiresIn: 7 * 24 * 60 * 60 },
  );
}

async function previewCommentCampaign(mediaId: string): Promise<CommentCampaignPreview> {
  const [media, comments, ownUsername, store] = await Promise.all([
    getMediaById(mediaId),
    getComments(mediaId),
    resolveUserId().then(getAccountUsername),
    loadStore(),
  ]);
  const promise = resolveKnownMediaPromise(mediaId) ?? resolvePostPromise({
    postCaption: media.caption,
  });
  const rows = comments.map((comment) => {
    const hasOwnPublicReply = Boolean(comment.replies?.data?.some(
      (reply) => reply.username?.toLowerCase() === ownUsername.toLowerCase(),
    ));
    const matched = matchesCampaignText(comment.text, mediaId);
    const campaignCopy = resolveCommentCampaignCopy(promise, comment.id);
    return {
      commentId: comment.id,
      username: comment.username,
      text: comment.text,
      timestamp: comment.timestamp,
      matched,
      hasOwnPublicReply,
      privateMarked: store.hasPrivateReply(comment.id),
      variant: matched ? campaignCopy.variant : undefined,
    };
  });
  const matched = rows.filter((row) => row.matched);
  const rotationDistribution = new Map<string, number>();
  const rotationExamples = new Map<string, string>();
  for (const row of matched) {
    if (!row.variant) continue;
    rotationDistribution.set(row.variant, (rotationDistribution.get(row.variant) || 0) + 1);
    if (!rotationExamples.has(row.variant)) {
      rotationExamples.set(
        row.variant,
        resolveCommentCampaignCopy(promise, row.commentId).publicReply,
      );
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    accountUsername: ownUsername,
    media: {
      id: media.id,
      permalink: media.permalink,
      caption: media.caption,
    },
    promise,
    replyRotation: {
      variants: promise.kind === 'sites_whatsapp_workshop' ? websiteCampaignVariantCount() : 1,
      distribution: [...rotationDistribution.entries()]
        .map(([variant, commentCount]) => ({ variant, comments: commentCount }))
        .sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true })),
      examples: [...rotationExamples.entries()]
        .map(([variant, publicReply]) => ({ variant, publicReply }))
        .sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true })),
    },
    totals: {
      comments: rows.length,
      matched: matched.length,
      ownPublicReply: matched.filter((row) => row.hasOwnPublicReply).length,
      privateMarked: matched.filter((row) => row.privateMarked).length,
      eligibleForRecovery: matched.filter(
        (row) => !row.hasOwnPublicReply && !row.privateMarked,
      ).length,
    },
    comments: rows,
  };
}

async function runCommentCampaignBatch(input: {
  mediaId: string;
  limit: number;
  execute: boolean;
}): Promise<CommentCampaignRunSummary> {
  if (
    config.behavior.commentCampaignMediaIds.length > 0
    && !config.behavior.commentCampaignMediaIds.includes(input.mediaId)
  ) {
    throw new Error('mediaId fora da campanha configurada');
  }

  const [comments, ownUsername, store] = await Promise.all([
    getComments(input.mediaId),
    resolveUserId().then(getAccountUsername),
    loadStore(),
  ]);
  const candidates = comments.filter((comment) => {
    if (!comment.text?.trim() || comment.username?.toLowerCase() === ownUsername.toLowerCase()) {
      return false;
    }
    if (!matchesCampaignText(comment.text, input.mediaId)) return false;
    const hasOwnPublicReply = Boolean(comment.replies?.data?.some(
      (reply) => reply.username?.toLowerCase() === ownUsername.toLowerCase(),
    ));
    return !hasOwnPublicReply && !store.hasPrivateReply(comment.id);
  });

  const uniqueFollowers = new Set<string>();
  const selected = candidates.filter((comment) => {
    const username = comment.username?.trim().toLowerCase();
    if (!username) return true;
    if (uniqueFollowers.has(username)) return false;
    uniqueFollowers.add(username);
    return true;
  }).slice(0, input.limit);

  const variants: Record<string, number> = {};
  let handled = 0;
  for (const comment of selected) {
    const promise = resolveKnownMediaPromise(input.mediaId) ?? resolvePostPromise({
      commentText: comment.text,
    });
    const copy = resolveCommentCampaignCopy(promise, comment.id);
    variants[copy.variant] = (variants[copy.variant] || 0) + 1;
    if (!input.execute) continue;

    handled += await handleCommentWebhookChange({
      field: 'comments',
      value: {
        id: comment.id,
        text: comment.text,
        from: { username: comment.username },
        media: { id: input.mediaId },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, config.behavior.replyDelayMs));
  }

  return {
    mode: input.execute ? 'execute' : 'dry-run',
    mediaId: input.mediaId,
    attempted: selected.length,
    handled,
    remainingEligible: Math.max(0, candidates.length - selected.length),
    variants,
  };
}

function isAlreadyRepliedError(error: unknown): boolean {
  const message = (error as Error).message || '';
  return message.includes('2534023')
    || message.toLowerCase().includes('already has a reply')
    || message.toLowerCase().includes('private reply already')
    || /private[_\s-]*reply.*already|already.*private[_\s-]*reply/i.test(message)
    || message.toLowerCase().includes('already sent')
    || message.toLowerCase().includes('ja tem uma resposta')
    || message.toLowerCase().includes('já tem uma resposta');
}

function isUncertainZernioDeliveryError(error: unknown): boolean {
  const name = (error as { name?: string }).name || '';
  const message = ((error as Error).message || '').toLowerCase();
  return name === 'AbortError'
    || name === 'TimeoutError'
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('fetch failed')
    || message.includes('network');
}

function dmWebhookEventKey(item: unknown, senderId: string, inboundText: string): string {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const message = record.message && typeof record.message === 'object'
    ? record.message as Record<string, unknown>
    : {};
  const stableId = firstString(message.mid, record.mid);
  if (stableId) return `dm#${stableId}`;

  const digest = createHash('sha256')
    .update([
      senderId,
      firstString(record.timestamp, record.time),
      inboundText.trim(),
      Object.keys(record).sort().join(','),
    ].join('|'))
    .digest('hex')
    .slice(0, 32);
  return `dm#fallback#${digest}`;
}

async function markOnce(id: string): Promise<boolean> {
  if (!tableName) return true;
  try {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#webhook` },
        sk: { S: id },
        updatedAt: { S: new Date().toISOString() },
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

interface EffectLease {
  acquired: boolean;
  owner?: string;
  expiredLeaseRecovered?: boolean;
  status?: 'leased' | 'completed';
  externalId?: string;
}

async function acquireEffectLease(id: string, leaseSeconds = 90): Promise<EffectLease> {
  if (!tableName) return { acquired: true, owner: randomUUID() };
  const owner = randomUUID();
  const now = Math.floor(Date.now() / 1_000);
  const previous = await getEffectLease(id);
  try {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `${storeAccount}#webhook` },
        sk: { S: id },
        status: { S: 'leased' },
        owner: { S: owner },
        leaseUntil: { N: String(now + leaseSeconds) },
        updatedAt: { S: new Date().toISOString() },
        expiresAt: { N: String(now + 7 * 24 * 60 * 60) },
      },
      ConditionExpression: 'attribute_not_exists(pk) OR (#status = :leased AND leaseUntil < :now)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':leased': { S: 'leased' },
        ':now': { N: String(now) },
      },
    }));
    return {
      acquired: true,
      owner,
      expiredLeaseRecovered: previous?.status === 'leased' && Number(previous.leaseUntil || 0) < now,
    };
  } catch (error) {
    if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
    const existing = await getEffectLease(id);
    return {
      acquired: false,
      status: existing?.status,
      externalId: existing?.externalId,
    };
  }
}

async function getEffectLease(id: string): Promise<{
  status?: 'leased' | 'completed';
  leaseUntil?: number;
  externalId?: string;
} | undefined> {
  if (!tableName) return undefined;
  const result = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#webhook` },
      sk: { S: id },
    },
    ConsistentRead: true,
  }));
  if (!result.Item) return undefined;
  return {
    status: result.Item.status?.S as 'leased' | 'completed' | undefined,
    leaseUntil: Number(result.Item.leaseUntil?.N || 0),
    externalId: result.Item.externalId?.S,
  };
}

async function completeEffectLease(id: string, owner: string | undefined, externalId: string): Promise<void> {
  if (!tableName) return;
  const now = Math.floor(Date.now() / 1_000);
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: `${storeAccount}#webhook` },
      sk: { S: id },
      status: { S: 'completed' },
      externalId: { S: externalId },
      updatedAt: { S: new Date().toISOString() },
      expiresAt: { N: String(now + 7 * 24 * 60 * 60) },
    },
    ...(owner ? {
      ConditionExpression: '#owner = :owner',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':owner': { S: owner } },
    } : {}),
  }));
}

async function releaseEffectLease(id: string, owner?: string): Promise<void> {
  if (!tableName) return;
  await dynamo.send(new DeleteItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#webhook` },
      sk: { S: id },
    },
    ...(owner ? {
      ConditionExpression: '#owner = :owner',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':owner': { S: owner } },
    } : {}),
  }));
}

async function clearOnce(id: string): Promise<void> {
  if (!tableName) return;
  await dynamo.send(new DeleteItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: `${storeAccount}#webhook` },
      sk: { S: id },
    },
  }));
}

async function recordPublishedPost(slug: string, mediaId: string, caption?: string): Promise<void> {
  if (!tableName) return;
  await savePublishedMediaContext({
    slug,
    mediaId,
    caption,
    promise: resolvePostPromise({ postCaption: caption }),
  });
}

function appendLeadInteractions(context: LeadContext | undefined, inbound: string, outbound: string): LeadInteraction[] {
  const now = new Date().toISOString();
  return [
    ...(context?.interactions || []),
    { at: now, direction: 'in' as const, text: inbound },
    { at: now, direction: 'out' as const, text: outbound },
  ].slice(-12);
}

async function notifyOwner(senderId: string, inbound: string, outbound: string, socialSummary?: string): Promise<void> {
  await sendOwnerWhatsApp([
    '🔥 Lead respondeu no Instagram',
    '',
    `Pessoa: ${senderId}`,
    ...(socialSummary ? ['', socialSummary] : []),
    '',
    `Mensagem: ${inbound}`,
    '',
    `Resposta enviada: ${outbound}`,
  ].join('\n'));
}

async function notifyOwnerSafely(
  senderId: string,
  inbound: string,
  outbound: string,
  socialSummary?: string,
): Promise<void> {
  try {
    await notifyOwner(senderId, inbound, outbound, socialSummary);
  } catch (error) {
    console.warn('Falha ao notificar dono sobre lead do Instagram', {
      senderId,
      error: (error as Error).message,
    });
  }
}

async function notifySystemOnce(kind: string, message: string): Promise<void> {
  const hourBucket = new Date().toISOString().slice(0, 13);
  try {
    if (!(await markOnce(`alert#${kind}#${hourBucket}`))) return;
  } catch {
    // Se a propria idempotencia falhar, ainda vale tentar avisar o dono.
  }
  await sendOwnerWhatsApp(message);
}

async function sendOwnerWhatsApp(textBody: string): Promise<void> {
  const server = process.env.UAZ_SERVER?.trim();
  const token = process.env.UAZ_TOKEN?.trim();
  const owner = process.env.OWNER_NUMBER?.trim();
  if (!server || !token || !owner) return;

  try {
    await fetch(`${server.replace(/\/$/, '')}/send/text`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        token,
      },
      body: JSON.stringify({ number: owner, text: textBody }),
    });
  } catch (error) {
    console.warn('Falha ao avisar WhatsApp:', (error as Error).message);
  }
}

async function forwardLegacyWebhook(
  payload: unknown,
  rawBody: string,
  headers: Record<string, string | undefined>,
): Promise<void> {
  const forwardUrl = process.env.LEGACY_PAGE_WEBHOOK_FORWARD_URL?.trim();
  if (!forwardUrl || (payload as { object?: string })?.object !== 'page') return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(forwardUrl, {
      method: 'POST',
      headers: {
        'content-type': header(headers, 'content-type') || 'application/json',
        ...(header(headers, 'x-hub-signature') ? { 'x-hub-signature': header(headers, 'x-hub-signature') || '' } : {}),
        ...(header(headers, 'x-hub-signature-256') ? { 'x-hub-signature-256': header(headers, 'x-hub-signature-256') || '' } : {}),
      },
      body: rawBody,
      signal: controller.signal,
    });
    console.info('Webhook legado encaminhado', { status: res.status });
  } catch (error) {
    console.warn('Falha ao encaminhar webhook legado:', (error as Error).message);
  } finally {
    clearTimeout(timeout);
  }
}

function isChatraceRequest(event: LambdaEvent): boolean {
  const path = event.rawPath || event.path || event.requestContext?.http?.path || '';
  return path.toLowerCase().includes('/chatrace');
}

function verifyChatraceSecret(
  headers: Record<string, string | undefined>,
): boolean {
  const expected = process.env.CHATRACE_WEBHOOK_SECRET?.trim();
  const received = header(headers, 'x-saraiva-webhook-secret')
    || header(headers, 'x-chatrace-secret');
  return secureStringEquals(received, expected);
}

function verifyChatraceValidation(
  headers: Record<string, string | undefined>,
): boolean {
  return isAuthorizedSyntheticValidation(headers, process.env.CHATRACE_VALIDATION_SECRET);
}

function secureStringEquals(received?: string, expected?: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseRequestPayload(rawBody: string, headers: Record<string, string | undefined>): unknown {
  if (!rawBody.trim()) return {};
  const contentType = (header(headers, 'content-type') || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
  if (contentType.includes('multipart/form-data')) {
    return { text: rawBody };
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
}

function parseChatraceInbound(payload: unknown): ChatraceInbound {
  return {
    senderId: firstString(
      valueAt(payload, ['sender', 'id']),
      valueAt(payload, ['senderId']),
      valueAt(payload, ['subscriber_id']),
      valueAt(payload, ['subscriberId']),
      valueAt(payload, ['user_id']),
      valueAt(payload, ['userId']),
      valueAt(payload, ['contact', 'id']),
      valueAt(payload, ['id']),
    ),
    username: firstString(
      valueAt(payload, ['sender', 'username']),
      valueAt(payload, ['username']),
      valueAt(payload, ['ig_username']),
      valueAt(payload, ['contact', 'username']),
      valueAt(payload, ['contact', 'name']),
      valueAt(payload, ['first_name']),
    ),
    text: firstString(
      valueAt(payload, ['message', 'text']),
      valueAt(payload, ['message']),
      valueAt(payload, ['text']),
      valueAt(payload, ['input']),
      valueAt(payload, ['last_input']),
      valueAt(payload, ['custom_fields', 'message']),
    ),
    postId: firstString(
      valueAt(payload, ['post_id']),
      valueAt(payload, ['postId']),
      valueAt(payload, ['media', 'id']),
      valueAt(payload, ['custom_fields', 'post_id']),
    ),
    commentId: firstString(
      valueAt(payload, ['comment_id']),
      valueAt(payload, ['commentId']),
      valueAt(payload, ['custom_fields', 'comment_id']),
    ),
    postPermalink: firstString(
      valueAt(payload, ['post_permalink']),
      valueAt(payload, ['postPermalink']),
      valueAt(payload, ['custom_fields', 'post_permalink']),
    ),
    requestId: firstString(
      valueAt(payload, ['request_id']),
      valueAt(payload, ['requestId']),
      valueAt(payload, ['message_id']),
      valueAt(payload, ['messageId']),
      valueAt(payload, ['event_id']),
      valueAt(payload, ['eventId']),
      valueAt(payload, ['last_interaction']),
    ),
    accountUsername: firstString(
      valueAt(payload, ['account_username']),
      valueAt(payload, ['accountUsername']),
      valueAt(payload, ['custom_fields', 'account_username']),
    ),
    flowId: firstString(
      valueAt(payload, ['flow_id']),
      valueAt(payload, ['flowId']),
      valueAt(payload, ['custom_fields', 'flow_id']),
    ),
  };
}

function valueAt(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function verifySignature(headers: Record<string, string | undefined>, rawBody: string): boolean {
  const appSecret = process.env.IG_APP_SECRET?.trim();
  if (!appSecret) return false;
  const signature = header(headers, 'x-hub-signature-256');
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(statusCode: number, body: string): LambdaResponse {
  return { statusCode, headers: corsHeaders('text/plain; charset=utf-8'), body };
}

function json(statusCode: number, body: unknown): LambdaResponse {
  return { statusCode, headers: corsHeaders('application/json'), body: JSON.stringify(body) };
}

function empty(statusCode: number): LambdaResponse {
  return { statusCode, headers: corsHeaders('text/plain; charset=utf-8'), body: '' };
}

function storefrontJson(statusCode: number, body: unknown): LambdaResponse {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function storefrontEmpty(statusCode: number): LambdaResponse {
  return {
    statusCode,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
    body: '',
  };
}

function redirect(location: string): LambdaResponse {
  return {
    statusCode: 302,
    headers: {
      location,
      'cache-control': 'no-store',
    },
    body: '',
  };
}

function corsHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    'access-control-allow-origin': 'https://insta.saraiva.ai',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': [
      'content-type',
      'x-saraiva-planner-pin',
      'x-saraiva-webhook-secret',
      'x-chatrace-secret',
      'x-saraiva-validation-mode',
      'x-saraiva-validation-token',
    ].join(','),
  };
}
