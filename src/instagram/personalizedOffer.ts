import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { InstagramFlowSession, InstagramInteractiveMessage } from './automationFlow.js';
import { sendDirectInteractive } from './client.js';
import { saraivaVoiceCacheHash, synthesizeSaraivaVoice } from '../voice/elevenLabsTts.js';

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const DEFAULT_AUDIO_BUCKET = 'respondedor-instagram-audio-880690593918';
const DEFAULT_AUDIO_KMS_KEY_ID = 'alias/saraiva-social-sales-prod-storage';

export interface PersonalizedOfferOutcome {
  reasonCode: 'audio_sent' | 'audio_fallback_text';
  script: string;
  audioMessageId?: string;
  audioAttempted?: boolean;
  textMessageId?: string;
  cardMessageId: string;
  audioKey?: string;
}

export type PersonalizedOfferProgress = Omit<PersonalizedOfferOutcome, 'cardMessageId'> & {
  cardMessageId?: string;
};

export async function deliverStandaloneSaraivaAudio(
  recipientId: string,
  correlationId: string,
  script: string,
  sendInteractive: (
    recipientId: string,
    message: InstagramInteractiveMessage,
  ) => Promise<string>,
): Promise<{ messageId: string; audioKey: string }> {
  await consumeDailyAudioQuota();
  const generated = await synthesizeSaraivaVoice(script);
  const bucket = process.env.INSTAGRAM_AUDIO_BUCKET?.trim() || DEFAULT_AUDIO_BUCKET;
  const kmsKeyId = process.env.INSTAGRAM_AUDIO_KMS_KEY_ID?.trim() || DEFAULT_AUDIO_KMS_KEY_ID;
  const audioKey = `instagram-audio/${generated.cacheHash}.mp3`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: audioKey,
    Body: generated.bytes,
    ContentType: generated.contentType,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: kmsKeyId,
    Expires: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    Metadata: {
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      correlation_id: correlationId,
    },
  }));
  const signedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: audioKey }),
    { expiresIn: 3_600 },
  );
  const messageId = await sendInteractive(recipientId, { kind: 'audio', url: signedUrl });
  return { messageId, audioKey };
}

export async function deliverPersonalizedOffer(
  recipientId: string,
  session: InstagramFlowSession,
  textFallback: string,
  card: InstagramInteractiveMessage & { kind: 'link_card' },
  options: {
    existing?: PersonalizedOfferProgress;
    onProgress?: (progress: PersonalizedOfferProgress) => Promise<void>;
    sendInteractive?: (
      recipientId: string,
      message: InstagramInteractiveMessage,
    ) => Promise<string>;
  } = {},
): Promise<PersonalizedOfferOutcome> {
  const sendInteractive = options.sendInteractive || sendDirectInteractive;
  const script = buildSaraivaAudioScript(session);
  const audioEnabled = process.env.INSTAGRAM_TTS_ENABLED !== 'false'
    && process.env.INSTAGRAM_AUDIO_SEND_ENABLED !== 'false';
  const reusable = options.existing?.script === script ? options.existing : undefined;
  let audioMessageId = reusable?.audioMessageId;
  let audioAttempted = reusable?.audioAttempted;
  let textMessageId = reusable?.textMessageId;
  let audioKey = reusable?.audioKey;
  let reasonCode: PersonalizedOfferOutcome['reasonCode'] =
    reusable?.reasonCode || 'audio_fallback_text';

  if (!audioMessageId && !textMessageId && !audioAttempted && audioEnabled) {
    try {
      const bucket = process.env.INSTAGRAM_AUDIO_BUCKET?.trim() || DEFAULT_AUDIO_BUCKET;
      const kmsKeyId = process.env.INSTAGRAM_AUDIO_KMS_KEY_ID?.trim() || DEFAULT_AUDIO_KMS_KEY_ID;
      audioKey = `instagram-audio/${saraivaVoiceCacheHash(script)}.mp3`;
      audioAttempted = true;
      await options.onProgress?.({
        reasonCode,
        script,
        audioAttempted,
        audioKey,
      });
      await consumeDailyAudioQuota();
      const generated = await synthesizeSaraivaVoice(script);
      if (audioKey !== `instagram-audio/${generated.cacheHash}.mp3`) {
        throw new Error('instagram_audio_cache_hash_mismatch');
      }
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: audioKey,
        Body: generated.bytes,
        ContentType: generated.contentType,
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: kmsKeyId,
        Expires: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        Metadata: {
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
          correlation_id: session.correlationId,
        },
      }));
      const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: audioKey }),
        { expiresIn: 3_600 },
      );
      audioMessageId = await sendInteractive(recipientId, { kind: 'audio', url: signedUrl });
      reasonCode = 'audio_sent';
    } catch (error) {
      console.warn('Audio personalizado indisponivel; usando texto equivalente', {
        correlationId: session.correlationId,
        error: safeTechnicalError(error),
      });
    }
  }

  if (!audioMessageId) {
    textMessageId ||= await sendInteractive(
      recipientId,
      { kind: 'text', text: textFallback },
    );
  }
  await options.onProgress?.({
    reasonCode,
    script,
    audioMessageId,
    audioAttempted,
    textMessageId,
    cardMessageId: reusable?.cardMessageId,
    audioKey,
  });
  const cardMessageId = reusable?.cardMessageId
    || await sendInteractive(recipientId, card);
  await options.onProgress?.({
    reasonCode,
    script,
    audioMessageId,
    audioAttempted,
    textMessageId,
    cardMessageId,
    audioKey,
  });
  return {
    reasonCode,
    script,
    audioMessageId,
    audioAttempted,
    textMessageId,
    cardMessageId,
    audioKey,
  };
}

async function consumeDailyAudioQuota(): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE?.trim();
  if (!tableName) throw new Error('instagram_audio_quota_store_missing');
  const limit = Math.max(1, Number(process.env.INSTAGRAM_TTS_DAILY_LIMIT || 100));
  const day = new Date().toISOString().slice(0, 10);
  await dynamo.send(new UpdateItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: 'saraiva-os#instagram-audio-quota' },
      sk: { S: day },
    },
    UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, expiresAt = :expiresAt',
    ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: {
      ':zero': { N: '0' },
      ':one': { N: '1' },
      ':limit': { N: String(limit) },
      ':expiresAt': { N: String(Math.floor(Date.now() / 1_000) + 3 * 24 * 60 * 60) },
    },
  }));
}

export function buildSaraivaAudioScript(session: InstagramFlowSession): string {
  const name = session.firstName || 'Olha só';
  if (session.campaign === 'sites_workshop') {
    return `${name}, a maioria passa semanas apanhando do WordPress ou pagando caro por um site que não converte ninguém. O que eu vou te mostrar no WhatsApp não é historinha, é o prompt-base e a estrutura exata do @Sites pra colocar um site profissional rodando hoje. Entra no botão e pega o mapa antes que você perca mais clientes pro seu concorrente. Faz sentido pra você?`;
  }
  const fact = session.profileFacts?.find((item) => item.allowedInAudio && item.confidence >= 0.8);
  const verified = fact ? ` E eu vi que ${normalizeFact(fact.value)}.` : '';
  const objective = asSentenceContinuation(session.qualification?.desiredOutcome
    || (session.path === 'ready'
      ? describeReadyObjective(session)
      : session.qualification?.buildGoal || describeBuildLevel(session)));
  if (session.path === 'ready') {
    return `${name}, se você quer ${objective}, continuar num processo lento é um ralo de dinheiro.${verified} No Laboratório Saraiva, eu compartilho as estruturas brutas de IA pra você copiar, adaptar e colocar pra rodar hoje. Clica no botão aqui embaixo e entra direto na plataforma. Faz sentido pra você?`;
  }
  return `${name}, você quer ${objective}. Ficar parado na teoria só vai te fazer perder tempo e dinheiro.${verified} No Laboratório Saraiva, eu mostro os bastidores da construção real pra você adaptar e colocar pra rodar imediatamente. Clica no botão aqui embaixo e entra direto na plataforma. Faz sentido pra você?`;
}

function asSentenceContinuation(value: string): string {
  const trimmed = value.trim();
  return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/u.test(trimmed)
    ? `${trimmed[0].toLocaleLowerCase('pt-BR')}${trimmed.slice(1)}`
    : trimmed;
}

function describeReadyObjective(session: InstagramFlowSession): string {
  if (session.qualification?.goal === 'prospect_clients') return 'prospectar clientes';
  if (session.qualification?.goal === 'organize_process') return 'organizar o processo';
  if (session.qualification?.goal === 'sell_more') return 'vender mais';
  return session.qualification?.business || 'colocar sua prospecção em movimento';
}

function describeBuildLevel(session: InstagramFlowSession): string {
  if (session.qualification?.level === 'starting') return 'começar a criar com inteligência artificial';
  if (session.qualification?.level === 'uses_ai') return 'transformar o uso de inteligência artificial em uma estrutura real';
  if (session.qualification?.level === 'builds_automations') return 'evoluir suas automações';
  return 'aprender a criar estruturas com inteligência artificial';
}

function normalizeFact(value: string): string {
  return value.replace(/[.!?]+$/, '').trim();
}

function safeTechnicalError(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'unknown_error';
  return raw.replace(/sk_[a-zA-Z0-9_-]+/g, '[redacted]').slice(0, 180);
}
