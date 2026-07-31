import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const WEBSITE_GUIDE_VALUE_CENTS = 1_990;
export const WEBSITE_GUIDE_LEGACY_VALUE_CENTS = 1_900;
export const WEBSITE_GUIDE_PREVIOUS_VALUE_CENTS = 9_900;
export const AGENCY_SUBSCRIPTION_VALUE_CENTS = 4_990;
export const WEBSITE_GUIDE_PRODUCT = 'Cliente Pronto Starter — extensão + 10 prospecções';
export const AGENCY_SUBSCRIPTION_PRODUCT = 'Motor de Vendas WhatsApp — Atualizações';
const WEBSITE_GUIDE_WOOVI_COMMENT = 'Cliente Pronto Starter - extensao e 10 prospeccoes';
const CORRELATION_PREFIX = 'ig-sites-guide-';
const SUBSCRIPTION_CORRELATION_PREFIX = 'ig-sites-sub-';

export interface WooviCharge {
  correlationId: string;
  status: string;
  value: number;
  paymentLinkUrl: string;
  brCode?: string;
  transactionId?: string;
}

export interface WooviChargeStatus {
  correlationId: string;
  status: string;
  value: number;
  transactionId?: string;
  paidAt?: string;
}

export interface CompletedGuidePayment {
  correlationId: string;
  value: number;
  transactionId?: string;
  paidAt?: string;
}

export interface AgencySubscriptionCustomer {
  name: string;
  taxID: string;
  email: string;
  phone: string;
  address: {
    zipcode: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    complement?: string;
  };
}

export interface AgencySubscription {
  correlationId: string;
  globalId: string;
  status: string;
  pixRecurringStatus: string;
  value: number;
  paymentLinkUrl: string;
}

export function isWebsiteGuideCheckoutIntent(text: string): boolean {
  const normalized = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return /^(pronto|pronta|apostila)$/.test(normalized)
    || /\b(comprar|checkout|pix|pagar|quero aprender|quero (?:a )?automacao|quero pronto|quero pronta)\b/.test(normalized);
}

export function websiteGuideCorrelationId(
  senderId: string,
  now = new Date(),
  orderId = '',
): string {
  const period = now.toISOString().slice(0, 7).replace('-', '');
  const follower = createHash('sha256')
    .update(`saraiva-ai:${senderId}:${orderId}:client-ready-kit-v3`)
    .digest('hex')
    .slice(0, 20);
  return `${CORRELATION_PREFIX}${period}-${follower}`;
}

export function agencySubscriptionCorrelationId(sessionId: string): string {
  const follower = createHash('sha256')
    .update(`saraiva-ai:${sessionId}:agency-subscription-v1`)
    .digest('hex')
    .slice(0, 24);
  return `${SUBSCRIPTION_CORRELATION_PREFIX}${follower}`;
}

export async function createWebsiteGuideCharge(input: {
  appId: string;
  senderId: string;
  orderId?: string;
  redirectUrl?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<WooviCharge> {
  const appId = input.appId.trim();
  if (!appId) throw new Error('woovi_app_id_missing');
  const baseUrl = (input.baseUrl || 'https://api.woovi.com').replace(/\/+$/, '');
  const correlationId = websiteGuideCorrelationId(input.senderId, new Date(), input.orderId);
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(
    `${baseUrl}/api/v1/charge?return_existing=true`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: appId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        correlationID: correlationId,
        value: WEBSITE_GUIDE_VALUE_CENTS,
        // Woovi rejects the em dash as an emoji in charge comments.
        comment: WEBSITE_GUIDE_WOOVI_COMMENT,
        ...(input.redirectUrl ? { redirectUrl: input.redirectUrl } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json().catch(() => ({})) as {
    charge?: {
      correlationID?: string;
      status?: string;
      value?: number;
      paymentLinkUrl?: string;
      brCode?: string;
      transactionID?: string;
    };
  };
  if (!response.ok) {
    throw new Error(`woovi_charge_failed_${response.status}`);
  }
  const charge = body.charge;
  const paymentLinkUrl = charge?.paymentLinkUrl || '';
  if (
    !charge
    || charge.correlationID !== correlationId
    || !isSupportedWebsiteGuideValue(charge.value)
    || !isSafePaymentUrl(paymentLinkUrl)
  ) {
    throw new Error('woovi_charge_invalid');
  }
  return {
    correlationId,
    status: charge.status || 'ACTIVE',
    value: charge.value,
    paymentLinkUrl,
    brCode: charge.brCode,
    transactionId: charge.transactionID,
  };
}

export async function createAgencySubscription(input: {
  appId: string;
  sessionId: string;
  customer: AgencySubscriptionCustomer;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<AgencySubscription> {
  const appId = input.appId.trim();
  if (!appId) throw new Error('woovi_app_id_missing');
  const baseUrl = (input.baseUrl || 'https://api.woovi.com').replace(/\/+$/, '');
  const correlationId = agencySubscriptionCorrelationId(input.sessionId);
  const customer = normalizeSubscriptionCustomer(input.customer);
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(`${baseUrl}/api/v1/subscriptions`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: appId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Motor de Vendas WhatsApp',
      value: AGENCY_SUBSCRIPTION_VALUE_CENTS,
      customer,
      correlationID: correlationId,
      comment: 'Agencia Sites IA mensal',
      frequency: 'MONTHLY',
      type: 'PIX_RECURRING',
      pixRecurringOptions: {
        journey: 'PAYMENT_ON_APPROVAL',
        retryPolicy: 'THREE_RETRIES_7_DAYS',
      },
      dayGenerateCharge: (input.now || new Date()).toISOString(),
      dayDue: 7,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as {
    subscription?: {
      correlationID?: string;
      globalID?: string;
      status?: string;
      type?: string;
      value?: number;
      paymentLinkUrl?: string;
      pixRecurring?: {
        status?: string;
      };
    };
  };
  if (!response.ok) {
    throw new Error(`woovi_subscription_failed_${response.status}`);
  }
  return validateAgencySubscription(body.subscription, correlationId);
}

export async function getAgencySubscription(input: {
  appId: string;
  correlationId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<AgencySubscription> {
  const appId = input.appId.trim();
  if (!appId) throw new Error('woovi_app_id_missing');
  if (!input.correlationId.startsWith(SUBSCRIPTION_CORRELATION_PREFIX)) {
    throw new Error('woovi_subscription_correlation_invalid');
  }
  const baseUrl = (input.baseUrl || 'https://api.woovi.com').replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(
    `${baseUrl}/api/v1/subscriptions/${encodeURIComponent(input.correlationId)}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: appId,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json().catch(() => ({})) as {
    subscription?: Parameters<typeof validateAgencySubscription>[0];
  };
  if (!response.ok) {
    throw new Error(`woovi_subscription_lookup_failed_${response.status}`);
  }
  return validateAgencySubscription(body.subscription, input.correlationId);
}

export function isAgencySubscriptionActive(subscription: AgencySubscription): boolean {
  return subscription.status.toUpperCase() === 'ACTIVE'
    && subscription.pixRecurringStatus.toUpperCase() === 'APPROVED';
}

export async function getWebsiteGuideCharge(input: {
  appId: string;
  correlationId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<WooviChargeStatus> {
  const appId = input.appId.trim();
  if (!appId) throw new Error('woovi_app_id_missing');
  if (!input.correlationId.startsWith(CORRELATION_PREFIX)) {
    throw new Error('woovi_correlation_invalid');
  }
  const baseUrl = (input.baseUrl || 'https://api.woovi.com').replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(
    `${baseUrl}/api/v1/charge/${encodeURIComponent(input.correlationId)}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: appId,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json().catch(() => ({})) as {
    charge?: {
      correlationID?: string;
      status?: string;
      value?: number;
      transactionID?: string;
      paidAt?: string;
    };
  };
  if (!response.ok) {
    throw new Error(`woovi_charge_lookup_failed_${response.status}`);
  }
  const charge = body.charge;
  if (
    !charge
    || charge.correlationID !== input.correlationId
    || !isSupportedWebsiteGuideValue(charge.value)
  ) {
    throw new Error('woovi_charge_lookup_invalid');
  }
  return {
    correlationId: charge.correlationID,
    status: charge.status || 'UNKNOWN',
    value: charge.value,
    transactionId: charge.transactionID,
    paidAt: charge.paidAt,
  };
}

export function buildWebsiteGuideCheckoutReply(charge: WooviCharge): string {
  const formattedPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(charge.value / 100);
  return [
    'Fechado. Você está adquirindo o Cliente Pronto Starter.',
    '',
    'Você instala no Chrome, abre uma empresa no Google Maps e usa o seu WhatsApp Web já conectado. A extensão organiza a pesquisa e prepara a abordagem para você revisar antes de enviar.',
    '',
    'A compra inclui o acesso beta à extensão e 10 prospecções completas. Em cada uma, você recebe diagnóstico, abordagens, oferta, proposta, contrato-base, prompt para Work + @Sites e checklist.',
    '',
    `Valor: ${formattedPrice}, em pagamento único.`,
    '',
    `Pague por Pix na Woovi: ${charge.paymentLinkUrl}`,
    '',
    'Assim que o Pix for confirmado, o download e as 10 prospecções são liberados.',
  ].join('\n');
}

export function verifyWooviWebhook(input: {
  rawBody: string;
  signature?: string;
  hmacSecret?: string;
  authorization?: string;
  expectedAuthorization?: string;
}): boolean {
  const signature = input.signature?.trim();
  const hmacSecret = input.hmacSecret?.trim();
  if (signature && hmacSecret) {
    const expected = createHmac('sha1', hmacSecret)
      .update(input.rawBody)
      .digest('hex');
    if (safeEqual(signature.replace(/^sha1=/i, ''), expected)) return true;
  }

  const authorization = input.authorization?.trim();
  const expectedAuthorization = input.expectedAuthorization?.trim();
  return Boolean(
    authorization
    && expectedAuthorization
    && safeEqual(authorization, expectedAuthorization),
  );
}

export function parseCompletedGuidePayment(payload: unknown): CompletedGuidePayment | undefined {
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
    !correlationId.startsWith(CORRELATION_PREFIX)
    || !isSupportedWebsiteGuideValue(value)
    || status !== 'COMPLETED'
  ) {
    return undefined;
  }
  return {
    correlationId,
    value,
    transactionId: optionalString(charge.transactionID),
    paidAt: optionalString(charge.paidAt),
  };
}

export function isSupportedWebsiteGuideValue(value: number | undefined): value is number {
  return value === WEBSITE_GUIDE_VALUE_CENTS
    || value === WEBSITE_GUIDE_PREVIOUS_VALUE_CENTS
    || value === WEBSITE_GUIDE_LEGACY_VALUE_CENTS;
}

function validateAgencySubscription(
  subscription: {
    correlationID?: string;
    globalID?: string;
    status?: string;
    type?: string;
    value?: number;
    paymentLinkUrl?: string;
    pixRecurring?: { status?: string };
  } | undefined,
  correlationId: string,
): AgencySubscription {
  const paymentLinkUrl = subscription?.paymentLinkUrl || '';
  if (
    !subscription
    || subscription.correlationID !== correlationId
    || subscription.type !== 'PIX_RECURRING'
    || subscription.value !== AGENCY_SUBSCRIPTION_VALUE_CENTS
    || !subscription.globalID
    || !isSafePaymentUrl(paymentLinkUrl)
  ) {
    throw new Error('woovi_subscription_invalid');
  }
  return {
    correlationId,
    globalId: subscription.globalID,
    status: subscription.status || 'ACTIVE',
    pixRecurringStatus: subscription.pixRecurring?.status || 'CREATED',
    value: subscription.value,
    paymentLinkUrl,
  };
}

function normalizeSubscriptionCustomer(
  customer: AgencySubscriptionCustomer,
): AgencySubscriptionCustomer {
  const address = customer?.address || {} as AgencySubscriptionCustomer['address'];
  const name = normalizeText(String(customer?.name || ''), 120);
  const taxID = String(customer?.taxID || '').replace(/\D/g, '');
  const email = String(customer?.email || '').trim().toLowerCase();
  const phone = String(customer?.phone || '').replace(/\D/g, '');
  const zipcode = String(address.zipcode || '').replace(/\D/g, '');
  const street = normalizeText(String(address.street || ''), 160);
  const number = normalizeText(String(address.number || ''), 30);
  const neighborhood = normalizeText(String(address.neighborhood || ''), 100);
  const city = normalizeText(String(address.city || ''), 100);
  const state = String(address.state || '').trim().toUpperCase();
  const complement = normalizeText(String(address.complement || ''), 100);

  if (name.length < 3) throw new Error('subscription_customer_name_invalid');
  if (![11, 14].includes(taxID.length)) throw new Error('subscription_customer_taxid_invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('subscription_customer_email_invalid');
  }
  if (phone.length < 10 || phone.length > 13) {
    throw new Error('subscription_customer_phone_invalid');
  }
  if (zipcode.length !== 8) throw new Error('subscription_customer_zipcode_invalid');
  if (!street || !number || !neighborhood || !city || !/^[A-Z]{2}$/.test(state)) {
    throw new Error('subscription_customer_address_invalid');
  }

  return {
    name,
    taxID,
    email,
    phone,
    address: {
      zipcode,
      street,
      number,
      neighborhood,
      city,
      state,
      ...(complement ? { complement } : {}),
    },
  };
}

function normalizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isSafePaymentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (
        url.hostname === 'woovi.com'
        || url.hostname.endsWith('.woovi.com')
        || url.hostname === 'openpix.com.br'
        || url.hostname.endsWith('.openpix.com.br')
      );
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
