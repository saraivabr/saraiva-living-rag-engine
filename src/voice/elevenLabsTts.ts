import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { createHash } from 'node:crypto';

const DEFAULT_VOICE_ID = 'EPv7HsLESaJ0yuvUQV4I';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_SECRET_ID = 'respondedor-instagram/production/elevenlabs';
const VOICE_PROFILE_VERSION = 'saraiva-natural-v2';
const secrets = new SecretsManagerClient({});
let cachedApiKey: string | undefined;

export interface ElevenLabsAudio {
  bytes: Uint8Array;
  contentType: 'audio/mpeg';
  cacheHash: string;
  voiceId: string;
  modelId: string;
}

export interface ElevenLabsTtsOptions {
  fetchImpl?: typeof fetch;
  apiKeyResolver?: () => Promise<string>;
  voiceId?: string;
  modelId?: string;
}

export async function synthesizeSaraivaVoice(
  script: string,
  options: ElevenLabsTtsOptions = {},
): Promise<ElevenLabsAudio> {
  const normalizedScript = script.replace(/\s+/g, ' ').trim();
  if (!normalizedScript) throw new Error('elevenlabs_empty_script');

  const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
  const modelId = options.modelId || process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL_ID;
  const apiKey = await (options.apiKeyResolver || resolveElevenLabsApiKey)();
  const fetchImpl = options.fetchImpl || fetch;
  let response: Response | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
      method: 'POST',
      headers: {
        accept: 'audio/mpeg',
        'content-type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: normalizedScript,
        model_id: modelId,
        language_code: 'pt',
        apply_text_normalization: 'on',
        voice_settings: {
          stability: 0.34,
          similarity_boost: 0.82,
          style: 0.12,
          use_speaker_boost: true,
          speed: 0.96,
        },
      }),
      signal: AbortSignal.timeout(25_000),
      },
    );
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  if (!response) throw new Error('elevenlabs_no_response');
  if (!response.ok) {
    throw new Error(`elevenlabs_http_${response.status}`);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: 'audio/mpeg',
    cacheHash: saraivaVoiceCacheHash(normalizedScript, voiceId, modelId),
    voiceId,
    modelId,
  };
}

export function saraivaVoiceCacheHash(
  script: string,
  voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
  modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL_ID,
): string {
  return createHash('sha256')
    .update(`${VOICE_PROFILE_VERSION}:${voiceId}:${modelId}:${script.replace(/\s+/g, ' ').trim()}`)
    .digest('hex');
}

export async function resolveElevenLabsApiKey(): Promise<string> {
  if (process.env.ELEVENLABS_API_KEY?.trim()) return process.env.ELEVENLABS_API_KEY.trim();
  if (cachedApiKey) return cachedApiKey;
  const secretId = process.env.ELEVENLABS_SECRET_ID?.trim() || DEFAULT_SECRET_ID;

  const result = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = result.SecretString?.trim();
  if (!raw) throw new Error('elevenlabs_secret_empty');

  let key = raw;
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw) as { apiKey?: unknown; ELEVENLABS_API_KEY?: unknown };
    const candidate = parsed.apiKey ?? parsed.ELEVENLABS_API_KEY;
    if (typeof candidate !== 'string') throw new Error('elevenlabs_secret_invalid');
    key = candidate.trim();
  }
  if (!key) throw new Error('elevenlabs_secret_invalid');
  cachedApiKey = key;
  return key;
}
