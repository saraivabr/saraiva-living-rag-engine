export const SEND_INTENT_TTL_MS = 2 * 60 * 1000;
export const MAX_MESSAGE_LENGTH = 4096;

export function normalizePhone(value) {
  const raw = String(value || "").trim();
  const hasExplicitCountryCode = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!hasExplicitCountryCode && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Informe um telefone com DDD e código do país.");
  }
  return digits;
}

export function normalizeMessage(value) {
  const message = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!message) throw new Error("Revise a mensagem antes de enviar.");
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`);
  }
  return message;
}

export function invalidateContactConfirmation(control) {
  if (!control || typeof control !== "object") {
    throw new Error("Controle de confirmação inválido.");
  }
  control.checked = false;
}

export function createSendIntent({
  phone,
  text,
  confirmed,
  id = crypto.randomUUID(),
  now = Date.now(),
}) {
  if (confirmed !== true) {
    throw new Error("Confirme que você pode contatar este número.");
  }
  return {
    id,
    phone: normalizePhone(phone),
    text: normalizeMessage(text),
    status: "PENDING",
    createdAt: now,
    expiresAt: now + SEND_INTENT_TTL_MS,
  };
}

export function isIntentFresh(intent, now = Date.now()) {
  return Boolean(
    intent
      && typeof intent.expiresAt === "number"
      && intent.expiresAt > now
      && ["PENDING", "OPENING", "EXECUTING"].includes(intent.status),
  );
}

export function buildWhatsAppWebUrl(intent) {
  const url = new URL("https://web.whatsapp.com/send");
  url.searchParams.set("phone", normalizePhone(intent.phone));
  url.searchParams.set("text", normalizeMessage(intent.text));
  url.searchParams.set("type", "phone_number");
  url.searchParams.set("app_absent", "0");
  return url.toString();
}

export function matchesWhatsAppIntentUrl(urlValue, intent) {
  try {
    const url = new URL(urlValue);
    if (url.origin !== "https://web.whatsapp.com") return false;
    return normalizePhone(url.searchParams.get("phone")) === normalizePhone(intent.phone)
      && normalizeMessage(url.searchParams.get("text")) === normalizeMessage(intent.text);
  } catch {
    return false;
  }
}

export function authorizeIntent(intent, {
  tabId,
  pageUrl,
  now = Date.now(),
}) {
  if (!intent) return { allowed: false, reason: "no_intent" };
  if (!isIntentFresh(intent, now)) return { allowed: false, reason: "expired" };
  if (!tabId || tabId !== intent.tabId) return { allowed: false, reason: "wrong_tab" };
  if (!matchesWhatsAppIntentUrl(pageUrl, intent)) {
    return { allowed: false, reason: "wrong_recipient" };
  }
  if (intent.status !== "OPENING") {
    return { allowed: false, reason: "already_claimed" };
  }
  return { allowed: true };
}

export function canStartTrigger(intent, {
  intentId,
  tabId,
}) {
  return Boolean(
    intent
      && intent.status === "EXECUTING"
      && intent.id === intentId
      && intent.tabId === tabId,
  );
}

export function canCompleteSend(intent, {
  intentId,
  tabId,
}) {
  return Boolean(
    intent
      && intent.status === "TRIGGERING"
      && intent.id === intentId
      && intent.tabId === tabId,
  );
}

export function reconcileIntentStatus(intent, now = Date.now()) {
  if (!intent) return null;
  if (
    ["PENDING", "OPENING", "EXECUTING"].includes(intent.status)
    && intent.expiresAt <= now
  ) {
    return {
      ...intent,
      status: "EXPIRED",
      error: "A confirmação expirou.",
      expiredAt: now,
    };
  }
  if (
    intent.status === "TRIGGERING"
    && typeof intent.triggeringAt === "number"
    && now - intent.triggeringAt >= 3_000
  ) {
    return {
      ...intent,
      status: "TRIGGERED_UNCONFIRMED",
      error: "O clique pode ter ocorrido, mas a extensão não confirmou o resultado.",
      reconciledAt: now,
    };
  }
  return intent;
}

export function isGoogleMapsUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && (
        host === "maps.app.goo.gl"
        || host === "www.google.com"
        || host === "google.com"
        || host.endsWith(".google.com")
        || host === "www.google.com.br"
        || host === "google.com.br"
        || host.endsWith(".google.com.br")
      )
      && (host === "maps.app.goo.gl" || url.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

export function isValidOrder(value) {
  const order = String(value || "").trim();
  return /^ig-sites-guide-\d{6}-[a-f0-9]{20}$/.test(order)
    || /^ig-sites-free-[a-f0-9]{24}$/.test(order);
}

export function leadKey(business) {
  const source = [
    business?.placeId,
    business?.name,
    business?.phone,
    business?.address,
  ].filter(Boolean).join("|");
  return source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
