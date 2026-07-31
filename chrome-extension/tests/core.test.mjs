import assert from "node:assert/strict";
import test from "node:test";
import {
  SEND_INTENT_TTL_MS,
  authorizeIntent,
  buildWhatsAppWebUrl,
  canCompleteSend,
  canStartTrigger,
  createSendIntent,
  invalidateContactConfirmation,
  isGoogleMapsUrl,
  isIntentFresh,
  isValidOrder,
  leadKey,
  matchesWhatsAppIntentUrl,
  normalizeMessage,
  normalizePhone,
  reconcileIntentStatus,
} from "../lib/core.js";

test("normaliza números brasileiros e preserva números internacionais", () => {
  assert.equal(normalizePhone("(11) 99999-8888"), "5511999998888");
  assert.equal(normalizePhone("+55 11 99999-8888"), "5511999998888");
  assert.equal(normalizePhone("+1 415 555 2671"), "14155552671");
  assert.throws(() => normalizePhone("123"), /DDD/);
});

test("cria intenção curta somente depois da confirmação explícita", () => {
  const now = 1_700_000_000_000;
  const intent = createSendIntent({
    phone: "11 99999-8888",
    text: "Oi, posso te mostrar uma ideia?",
    confirmed: true,
    id: "intent-1",
    now,
  });
  assert.deepEqual(intent, {
    id: "intent-1",
    phone: "5511999998888",
    text: "Oi, posso te mostrar uma ideia?",
    status: "PENDING",
    createdAt: now,
    expiresAt: now + SEND_INTENT_TTL_MS,
  });
  assert.throws(
    () => createSendIntent({ phone: "11999998888", text: "Oi", confirmed: false }),
    /Confirme/,
  );
});

test("qualquer edição invalida a confirmação anterior do contato", () => {
  const checkbox = { checked: true };
  invalidateContactConfirmation(checkbox);
  assert.equal(checkbox.checked, false);
});

test("intenção expira e não fica elegível depois de encerrada", () => {
  const intent = createSendIntent({
    phone: "11999998888",
    text: "Mensagem",
    confirmed: true,
    id: "intent-2",
    now: 1_000,
  });
  assert.equal(isIntentFresh(intent, 1_500), true);
  assert.equal(isIntentFresh(intent, intent.expiresAt + 1), false);
  assert.equal(isIntentFresh({ ...intent, status: "SEND_TRIGGERED" }, 1_500), false);
});

test("URL do WhatsApp corresponde somente ao destinatário e texto autorizados", () => {
  const intent = createSendIntent({
    phone: "11999998888",
    text: "Mensagem com acento: solução",
    confirmed: true,
    id: "intent-3",
    now: 1_000,
  });
  const url = buildWhatsAppWebUrl(intent);
  assert.match(url, /^https:\/\/web\.whatsapp\.com\/send\?/);
  assert.equal(matchesWhatsAppIntentUrl(url, intent), true);
  assert.equal(
    matchesWhatsAppIntentUrl(
      "https://web.whatsapp.com/send?phone=5511888887777&text=Mensagem%20com%20acento%3A%20solu%C3%A7%C3%A3o",
      intent,
    ),
    false,
  );
  assert.equal(
    matchesWhatsAppIntentUrl(
      "https://web.whatsapp.com/send?phone=5511999998888&text=Outra%20mensagem",
      intent,
    ),
    false,
  );
  assert.equal(matchesWhatsAppIntentUrl("https://example.com/", intent), false);
});

test("autoriza uma única aba e impede concluir a mesma intenção duas vezes", () => {
  const base = createSendIntent({
    phone: "11999998888",
    text: "Mensagem",
    confirmed: true,
    id: "intent-4",
    now: 1_000,
  });
  const opening = { ...base, status: "OPENING", tabId: 42 };
  const pageUrl = buildWhatsAppWebUrl(opening);
  assert.deepEqual(
    authorizeIntent(opening, { tabId: 42, pageUrl, now: 1_500 }),
    { allowed: true },
  );
  assert.equal(
    authorizeIntent(opening, { tabId: 99, pageUrl, now: 1_500 }).reason,
    "wrong_tab",
  );
  assert.equal(
    authorizeIntent(
      { ...opening, status: "EXECUTING" },
      { tabId: 42, pageUrl, now: 1_500 },
    ).reason,
    "already_claimed",
  );

  const executing = { ...opening, status: "EXECUTING" };
  assert.equal(canStartTrigger(executing, { intentId: "intent-4", tabId: 42 }), true);
  const triggering = { ...executing, status: "TRIGGERING", triggeringAt: 1_600 };
  assert.equal(canCompleteSend(triggering, { intentId: "intent-4", tabId: 42 }), true);
  assert.equal(
    canCompleteSend({ ...triggering, status: "SEND_TRIGGERED" }, {
      intentId: "intent-4",
      tabId: 42,
    }),
    false,
  );
});

test("reconcilia expiração e clique sem confirmação sem liberar duplicidade", () => {
  const base = createSendIntent({
    phone: "11999998888",
    text: "Mensagem",
    confirmed: true,
    id: "intent-5",
    now: 1_000,
  });
  const expired = reconcileIntentStatus(
    { ...base, status: "EXECUTING" },
    base.expiresAt + 1,
  );
  assert.equal(expired.status, "EXPIRED");

  const uncertain = reconcileIntentStatus(
    { ...base, status: "TRIGGERING", triggeringAt: 2_000 },
    5_001,
  );
  assert.equal(uncertain.status, "TRIGGERED_UNCONFIRMED");
  assert.equal(
    canStartTrigger(uncertain, { intentId: "intent-5", tabId: undefined }),
    false,
  );
});

test("valida Maps, pedido e chave do funil", () => {
  assert.equal(isGoogleMapsUrl("https://www.google.com/maps/place/Scarlett"), true);
  assert.equal(isGoogleMapsUrl("https://maps.app.goo.gl/abc123"), true);
  assert.equal(isGoogleMapsUrl("https://example.com/maps/place"), false);
  assert.equal(isValidOrder("ig-sites-guide-260729-0123456789abcdefabcd"), true);
  assert.equal(isValidOrder("ig-sites-free-0123456789abcdef01234567"), true);
  assert.equal(isValidOrder("pedido-qualquer"), false);
  assert.equal(
    leadKey({ name: "Studio Aurora", phone: "(11) 99999-8888" }),
    "studio-aurora-11-99999-8888",
  );
});

test("rejeita mensagem vazia ou longa demais", () => {
  assert.equal(normalizeMessage("  Oi!\r\nTudo bem?  "), "Oi!\nTudo bem?");
  assert.throws(() => normalizeMessage("   "), /Revise/);
  assert.throws(() => normalizeMessage("x".repeat(4097)), /4096/);
});
