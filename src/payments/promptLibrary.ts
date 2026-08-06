import {
  createHash,
  createHmac,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';

export const PROMPT_LIBRARY_VALUE_CENTS = 1_990;
export const PROMPT_LIBRARY_PRICE_KEY = 'prompt_library_one_time_brl_1990';
export const PROMPT_LIBRARY_OFFER_KEY = 'quero_o_prompt_1990';
export const PROMPT_LIBRARY_CORRELATION_PREFIX = 'ig-prompt-library-';

const PROMPT_LIBRARY_WOOVI_COMMENT = 'Biblioteca Secreta de Prompts Prontos';

// Public key published by Woovi for x-webhook-signature validation.
const WOOVI_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/+NtIkjzevvqD+I3MMv3bLXDt
pvxBjY4BsRrSdca3rtAwMcRYYvxSnd7jagVLpctMiOxQO8ieUCKLSWHpsMAjO/zZ
WMKbqoG8MNpi/u3fp6zz0mcHCOSqYsPUUG19buW8bis5ZZ2IZgBObWSpTvJ0cnj6
HKBAA82Jln+lGwS1MwIDAQAB
-----END PUBLIC KEY-----`;

export interface PromptLibraryCharge {
  correlationId: string;
  status: string;
  value: number;
  paymentLinkUrl: string;
  brCode?: string;
  transactionId?: string;
  paidAt?: string;
}

export interface CompletedPromptLibraryPayment {
  correlationId: string;
  value: number;
  transactionId?: string;
  paidAt?: string;
}

export function promptLibraryCorrelationId(
  senderId: string,
  orderId: string,
  now = new Date(),
): string {
  const period = now.toISOString().slice(0, 7).replace('-', '');
  const digest = createHash('sha256')
    .update(`saraiva-ai:${senderId}:${orderId}:prompt-library-v1`)
    .digest('hex')
    .slice(0, 24);
  return `${PROMPT_LIBRARY_CORRELATION_PREFIX}${period}-${digest}`;
}

export function isPromptLibraryCorrelationId(value: string): boolean {
  return /^ig-prompt-library-\d{6}-[a-f0-9]{24}$/.test(value);
}

export function createPromptLibraryAccessToken(
  correlationId: string,
  secret: string,
): string {
  assertAccessSecret(secret);
  if (!isPromptLibraryCorrelationId(correlationId)) {
    throw new Error('prompt_library_order_invalid');
  }
  const digest = createHmac('sha256', secret)
    .update(`${correlationId}:prompt-library-access:v1`)
    .digest('base64url');
  return `v1.${digest}`;
}

export function verifyPromptLibraryAccessToken(input: {
  correlationId: string;
  token: string;
  currentSecret: string;
  previousSecret?: string;
}): boolean {
  if (!isPromptLibraryCorrelationId(input.correlationId)) return false;
  if (!/^v1\.[A-Za-z0-9_-]{43}$/.test(input.token)) return false;
  const secrets = [input.currentSecret, input.previousSecret].filter(
    (secret): secret is string => Boolean(secret?.trim()),
  );
  return secrets.some((secret) => {
    try {
      return safeEqual(
        input.token,
        createPromptLibraryAccessToken(input.correlationId, secret),
      );
    } catch {
      return false;
    }
  });
}

export function promptLibraryAccessUrl(input: {
  baseUrl: string;
  correlationId: string;
  token: string;
}): string {
  const url = new URL('/biblioteca', input.baseUrl.replace(/\/+$/, ''));
  url.searchParams.set('pedido', input.correlationId);
  url.searchParams.set('token', input.token);
  return url.toString();
}

export async function createPromptLibraryCharge(input: {
  appId: string;
  correlationId: string;
  redirectUrl: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<PromptLibraryCharge> {
  const appId = input.appId.trim();
  if (!appId) throw new Error('woovi_app_id_missing');
  if (!isPromptLibraryCorrelationId(input.correlationId)) {
    throw new Error('prompt_library_order_invalid');
  }
  if (!isSafeAppUrl(input.redirectUrl)) {
    throw new Error('prompt_library_redirect_invalid');
  }
  const baseUrl = (input.baseUrl || 'https://api.woovi.com').replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(`${baseUrl}/api/v1/charge?return_existing=true`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: appId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      correlationID: input.correlationId,
      value: PROMPT_LIBRARY_VALUE_CENTS,
      comment: PROMPT_LIBRARY_WOOVI_COMMENT,
      redirectUrl: input.redirectUrl,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as {
    charge?: Record<string, unknown>;
  };
  if (!response.ok) throw new Error(`prompt_library_charge_failed_${response.status}`);
  return normalizePromptLibraryCharge(body.charge, input.correlationId);
}

export async function getPromptLibraryCharge(input: {
  appId: string;
  correlationId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<PromptLibraryCharge> {
  const appId = input.appId.trim();
  if (!appId) throw new Error('woovi_app_id_missing');
  if (!isPromptLibraryCorrelationId(input.correlationId)) {
    throw new Error('prompt_library_order_invalid');
  }
  const baseUrl = (input.baseUrl || 'https://api.woovi.com').replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(
    `${baseUrl}/api/v1/charge/${encodeURIComponent(input.correlationId)}`,
    {
      headers: { accept: 'application/json', authorization: appId },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json().catch(() => ({})) as {
    charge?: Record<string, unknown>;
  };
  if (!response.ok) throw new Error(`prompt_library_charge_lookup_failed_${response.status}`);
  return normalizePromptLibraryCharge(body.charge, input.correlationId);
}

export function parseCompletedPromptLibraryPayment(
  payload: unknown,
): CompletedPromptLibraryPayment | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  const event = String(root.event || root.type || '').toUpperCase();
  if (!event.endsWith('CHARGE_COMPLETED')) return undefined;
  const charge = root.charge && typeof root.charge === 'object'
    ? root.charge as Record<string, unknown>
    : undefined;
  if (!charge) return undefined;
  const correlationId = String(charge.correlationID || charge.correlationId || '');
  const value = Number(charge.value || 0);
  const status = String(charge.status || '').toUpperCase();
  if (
    !isPromptLibraryCorrelationId(correlationId)
    || value !== PROMPT_LIBRARY_VALUE_CENTS
    || status !== 'COMPLETED'
  ) {
    return undefined;
  }
  return {
    correlationId,
    value,
    transactionId: optionalString(charge.transactionID || charge.transactionId),
    paidAt: optionalString(charge.paidAt),
  };
}

export function verifyPromptLibraryWebhook(input: {
  rawBody: string;
  wooviSignature?: string;
  hmacSignature?: string;
  hmacSecret?: string;
}): boolean {
  const wooviSignature = input.wooviSignature?.trim();
  if (wooviSignature) {
    try {
      if (verifySignature(
        'RSA-SHA256',
        Buffer.from(input.rawBody),
        WOOVI_WEBHOOK_PUBLIC_KEY,
        Buffer.from(wooviSignature, 'base64'),
      )) return true;
    } catch {
      // Fall through to the per-webhook HMAC when present.
    }
  }

  const hmacSignature = input.hmacSignature?.trim();
  const hmacSecret = input.hmacSecret?.trim();
  if (!hmacSignature || !hmacSecret) return false;
  const expected = createHmac('sha1', hmacSecret)
    .update(input.rawBody)
    .digest('base64');
  return safeEqual(hmacSignature, expected);
}

function normalizePromptLibraryCharge(
  raw: Record<string, unknown> | undefined,
  correlationId: string,
): PromptLibraryCharge {
  const paymentLinkUrl = String(raw?.paymentLinkUrl || '');
  if (
    !raw
    || String(raw.correlationID || raw.correlationId || '') !== correlationId
    || Number(raw.value) !== PROMPT_LIBRARY_VALUE_CENTS
    || !isSafePaymentUrl(paymentLinkUrl)
  ) {
    throw new Error('prompt_library_charge_invalid');
  }
  return {
    correlationId,
    status: String(raw.status || 'ACTIVE'),
    value: Number(raw.value),
    paymentLinkUrl,
    brCode: optionalString(raw.brCode),
    transactionId: optionalString(raw.transactionID || raw.transactionId),
    paidAt: optionalString(raw.paidAt),
  };
}

function assertAccessSecret(secret: string): void {
  if (secret.trim().length < 32) {
    throw new Error('prompt_library_access_secret_invalid');
  }
}

function isSafePaymentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (
      url.hostname === 'woovi.com'
      || url.hostname.endsWith('.woovi.com')
      || url.hostname === 'openpix.com.br'
      || url.hostname.endsWith('.openpix.com.br')
    );
  } catch {
    return false;
  }
}

/**
 * Domínios da casa que podem receber o comprador depois do Pix.
 *
 * Os dois servem o mesmo origin. Estavam aqui só como `app.saraiva.ai`, e isso
 * era uma armadilha: PROMPT_LIBRARY_STOREFRONT_URL é variável de ambiente e a
 * direção declarada do projeto é migrar para prompt.saraiva.ai. No dia em que
 * alguém apontasse a variável para lá, createPromptLibraryCharge passaria a
 * lançar prompt_library_redirect_invalid e o checkout pago pararia de gerar
 * Pix — com cara de validação defensiva funcionando, não de falha.
 *
 * A allowlist continua fechada: só o que é nosso entra.
 */
const DOMINIOS_DE_ACESSO = ['app.saraiva.ai', 'prompt.saraiva.ai', 'localhost'] as const;

function isSafeAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && DOMINIOS_DE_ACESSO.includes(url.hostname as (typeof DOMINIOS_DE_ACESSO)[number]);
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length
    && timingSafeEqual(leftBytes, rightBytes);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
