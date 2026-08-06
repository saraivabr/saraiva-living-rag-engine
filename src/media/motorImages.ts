import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/**
 * Cliente do endpoint de imagens do Motor.
 *
 * A API responde em Server-Sent Events mesmo para uma única imagem: manda
 * alguns `progress`, um `partial_image` com a prévia e um `done` com o
 * resultado final. Uma imagem de 1122x1402 chega como ~3,3 milhões de
 * caracteres em base64 — por isso o teto de bytes é explícito e generoso,
 * e por isso a geração vive fora do handler do Instagram.
 */

const DEFAULT_BASE_URL = 'https://motor.empresa.ia.br/v1';
const DEFAULT_MODEL = 'cx/gpt-5.5-image';
const DEFAULT_SECRET_ID = 'respondedor-instagram/production/motor-images';
/** Uma geração levou 32s no teste; o teto cobre lote grande sem ficar infinito. */
const DEFAULT_TIMEOUT_MS = 180_000;
/** Uma imagem 1122x1402 devolve ~6,5 MB de SSE. 40 MB cobre n=4 com folga. */
const MAX_RESPONSE_BYTES = 40 * 1024 * 1024;

export type MotorImageSize = 'auto' | '1024x1024' | '1024x1536' | '1536x1024';
export type MotorImageQuality = 'auto' | 'low' | 'medium' | 'high';
export type MotorImageFormat = 'png' | 'jpeg' | 'webp';

export interface MotorImageRequest {
  prompt: string;
  n?: number;
  size?: MotorImageSize;
  quality?: MotorImageQuality;
  background?: 'auto' | 'transparent' | 'opaque';
  imageDetail?: 'low' | 'high';
  outputFormat?: MotorImageFormat;
  /**
   * Imagem de referência. O modelo mantém rosto, roupa e identidade visual do
   * que vier aqui — é assim que se gera criativo com a pessoa real da marca.
   *
   * /v1/images/edits e /v1/images/variations respondem 500 neste provedor; o
   * caminho que funciona é este campo dentro do próprio /generations.
   */
  referenceImage?: { bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' };
}

/**
 * O servidor devolve 413 bem antes do que se imagina: 3,3 MB em base64 já
 * estoura, 142 KB passa. JPEG com ~1024px de lado maior cabe com folga.
 */
export const MAX_REFERENCE_BASE64_BYTES = 1.5 * 1024 * 1024;

export interface MotorImageOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  secretId?: string;
  region?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  /** Recebe cada estágio do stream, para quem quiser mostrar progresso. */
  onProgress?: (stage: string, bytesReceived: number) => void;
}

export interface MotorImage {
  bytes: Uint8Array;
  format: MotorImageFormat;
  width?: number;
  height?: number;
}

let cachedApiKey: string | undefined;

export async function generateMotorImages(
  request: MotorImageRequest,
  options: MotorImageOptions = {},
): Promise<MotorImage[]> {
  const prompt = request.prompt.trim();
  if (!prompt) throw new Error('motor_image_prompt_empty');

  const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.MOTOR_BASE_URL || DEFAULT_BASE_URL);
  const model = options.model?.trim() || process.env.MOTOR_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
  const format = request.outputFormat || 'png';
  const apiKey = options.apiKey?.trim() || await loadMotorImageApiKey({
    secretId: options.secretId,
    region: options.region,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options.fetch || globalThis.fetch)(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'User-Agent': 'SaraivaAI-Instagram/1.0',
      },
      body: JSON.stringify({
        model,
        prompt,
        n: request.n ?? 1,
        size: request.size ?? 'auto',
        quality: request.quality ?? 'auto',
        background: request.background ?? 'auto',
        image_detail: request.imageDetail ?? 'high',
        output_format: format,
        ...(request.referenceImage ? { image: toDataUrl(request.referenceImage) } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`motor_image_http_${response.status}: ${sanitize(await safeText(response))}`);
    }
    const base64List = await readImageStream(response, options.onProgress);
    if (!base64List.length) throw new Error('motor_image_empty_result');
    return base64List.map((b64) => toImage(b64, format));
  } finally {
    clearTimeout(timer);
  }
}

export async function loadMotorImageApiKey(
  options: { secretId?: string; region?: string } = {},
): Promise<string> {
  const direta = process.env.MOTOR_IMAGE_API_KEY?.trim();
  if (direta) return direta;
  if (cachedApiKey) return cachedApiKey;

  const secretId = options.secretId?.trim() || process.env.MOTOR_IMAGE_SECRET_ID?.trim() || DEFAULT_SECRET_ID;
  const region = options.region?.trim() || process.env.AWS_REGION?.trim() || 'us-east-1';
  const result = await new SecretsManagerClient({ region })
    .send(new GetSecretValueCommand({ SecretId: secretId }));
  const secret = result.SecretString
    || (result.SecretBinary ? Buffer.from(result.SecretBinary).toString('utf8') : '');
  cachedApiKey = parseSecret(secret);
  if (!cachedApiKey) throw new Error('motor_image_credential_empty');
  return cachedApiKey;
}

/** Lê o SSE acumulando só o que interessa: o base64 do evento `done`. */
async function readImageStream(
  response: Response,
  onProgress?: MotorImageOptions['onProgress'],
): Promise<string[]> {
  if (!response.body) throw new Error('motor_image_no_body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let total = 0;
  const imagens: string[] = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel('motor_image_response_too_large');
        throw new Error('motor_image_response_too_large');
      }
      buffer += decoder.decode(value, { stream: true });

      let corte = buffer.indexOf('\n\n');
      while (corte !== -1) {
        processEvent(buffer.slice(0, corte), imagens, onProgress);
        buffer = buffer.slice(corte + 2);
        corte = buffer.indexOf('\n\n');
      }
    }
    processEvent(buffer + decoder.decode(), imagens, onProgress);
    return imagens;
  } finally {
    reader.releaseLock();
  }
}

function processEvent(
  bloco: string,
  imagens: string[],
  onProgress?: MotorImageOptions['onProgress'],
): void {
  if (!bloco.trim()) return;
  let evento = '';
  let dados = '';
  for (const linha of bloco.split('\n')) {
    if (linha.startsWith('event:')) evento = linha.slice(6).trim();
    else if (linha.startsWith('data:')) dados += linha.slice(5).trim();
  }
  if (!dados || dados === '[DONE]') return;

  let payload: unknown;
  try {
    payload = JSON.parse(dados);
  } catch {
    return;
  }

  if (evento === 'progress') {
    const p = payload as { stage?: string; bytesReceived?: number };
    onProgress?.(p.stage || 'progress', p.bytesReceived ?? 0);
    return;
  }
  // A prévia do partial_image é descartada de propósito: o done traz a final,
  // e guardar as duas dobraria o pico de memória sem entregar nada a mais.
  if (evento !== 'done') return;

  const final = payload as { data?: Array<{ b64_json?: string }> };
  for (const item of final.data ?? []) {
    if (item.b64_json) imagens.push(item.b64_json);
  }
}

function toImage(b64: string, format: MotorImageFormat): MotorImage {
  const bytes = Buffer.from(b64, 'base64');
  return { bytes, format, ...readPngSize(bytes, format) };
}

/** O header PNG traz largura e altura em bytes fixos; útil para conferir o resultado. */
function readPngSize(bytes: Buffer, format: MotorImageFormat): { width?: number; height?: number } {
  if (format !== 'png' || bytes.length < 24) return {};
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return {};
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function parseSecret(secret: string): string {
  const value = secret.trim();
  if (!value) return '';
  if (!value.startsWith('{')) return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    for (const chave of ['MOTOR_IMAGE_API_KEY', 'MOTOR_API_KEY', 'apiKey', 'key', 'token']) {
      const item = parsed[chave];
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  } catch {
    return '';
  }
  return '';
}

function toDataUrl(ref: NonNullable<MotorImageRequest['referenceImage']>): string {
  const base64 = Buffer.from(ref.bytes).toString('base64');
  if (base64.length > MAX_REFERENCE_BASE64_BYTES) {
    throw new Error(
      `motor_image_reference_too_large: ${Math.round(base64.length / 1024)}KB em base64. `
      + 'Reduza para ~1024px de lado maior em JPEG (ex.: sips -Z 1024 -s format jpeg).',
    );
  }
  return `data:${ref.mimeType};base64,${base64}`;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:') throw new Error('motor_image_base_url_must_be_https');
  return url.toString().replace(/\/$/u, '');
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '';
  }
}

/** Nunca deixa a credencial vazar numa mensagem de erro. */
function sanitize(value: string): string {
  return value
    .replace(/Bearer\s+\S+/giu, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, '[REDACTED]');
}
