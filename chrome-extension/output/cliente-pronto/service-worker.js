import {
  authorizeIntent,
  buildWhatsAppWebUrl,
  canCompleteSend,
  canStartTrigger,
  createSendIntent,
  reconcileIntentStatus,
} from "./lib/core.js";

const INTENT_KEY = "clienteProntoPendingSend";
const ACTIVITY_KEY = "clienteProntoSendActivity";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  injectWhatsAppAdapterIfPending(tabId).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  reconcileClosedTab(tabId).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Falha inesperada.",
    }));
  return true;
});

async function routeMessage(message, sender) {
  switch (message?.type) {
    case "CLIENT_READY_GET_ACTIVE_TAB":
      return getActiveTab();
    case "CLIENT_READY_START_SEND":
      return startSend(message);
    case "CLIENT_READY_GET_SEND_STATUS":
      return getSendStatus();
    case "CLIENT_READY_CLEAR_SEND":
      await chrome.storage.session.remove(INTENT_KEY);
      return { ok: true };
    case "CLIENT_READY_WHATSAPP_READY":
      return authorizeContentSend(message, sender);
    case "CLIENT_READY_WHATSAPP_ABOUT_TO_TRIGGER":
      return markTriggering(message, sender);
    case "CLIENT_READY_WHATSAPP_TRIGGERED":
      return completeSend(message, sender);
    case "CLIENT_READY_WHATSAPP_UNCONFIRMED":
      return markUnconfirmed(message, sender);
    case "CLIENT_READY_WHATSAPP_FAILED":
      return failSend(message, sender);
    default:
      return { ok: false, error: "Mensagem da extensão não reconhecida." };
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return {
    ok: true,
    tab: tab ? { id: tab.id, title: tab.title || "", url: tab.url || "" } : null,
  };
}

async function startSend(message) {
  const intent = createSendIntent({
    phone: message.phone,
    text: message.text,
    confirmed: message.confirmed,
  });
  await chrome.storage.session.set({ [INTENT_KEY]: intent });
  const tab = await chrome.tabs.create({
    active: true,
    url: buildWhatsAppWebUrl(intent),
  });
  const openingIntent = {
    ...intent,
    status: "OPENING",
    tabId: tab.id,
    openedAt: Date.now(),
  };
  await chrome.storage.session.set({ [INTENT_KEY]: openingIntent });
  if (tab.id) {
    const currentTab = await chrome.tabs.get(tab.id);
    if (currentTab.status === "complete") {
      await injectWhatsAppAdapterIfPending(tab.id);
    }
  }
  await publishStatus(openingIntent);
  return { ok: true, intent: publicIntent(openingIntent) };
}

async function authorizeContentSend(message, sender) {
  const intent = await readIntent();
  const authorization = authorizeIntent(intent, {
    tabId: sender.tab?.id,
    pageUrl: message.pageUrl,
  });
  if (authorization.reason === "expired" && intent) {
    const expired = { ...intent, status: "EXPIRED", error: "A confirmação expirou." };
    await saveIntent(expired);
  }
  if (!authorization.allowed) {
    return { ok: true, execute: false, reason: authorization.reason };
  }
  const executing = { ...intent, status: "EXECUTING", executingAt: Date.now() };
  await saveIntent(executing);
  await publishStatus(executing);
  return {
    ok: true,
    execute: true,
    intent: {
      id: executing.id,
      phone: executing.phone,
      text: executing.text,
      expiresAt: executing.expiresAt,
    },
  };
}

async function completeSend(message, sender) {
  const intent = await readIntent();
  if (!canCompleteSend(intent, {
    intentId: message.intentId,
    tabId: sender.tab?.id,
  })) {
    return { ok: false, error: "Intenção de envio inválida ou já encerrada." };
  }
  const completed = {
    ...intent,
    status: "SEND_TRIGGERED",
    triggeredAt: Date.now(),
  };
  await saveIntent(completed);
  await appendActivity(completed);
  await publishStatus(completed);
  return { ok: true };
}

async function markTriggering(message, sender) {
  const intent = await readIntent();
  if (!canStartTrigger(intent, {
    intentId: message.intentId,
    tabId: sender.tab?.id,
  })) {
    return { ok: false, error: "Intenção de envio inválida ou já acionada." };
  }
  const triggering = {
    ...intent,
    status: "TRIGGERING",
    triggeringAt: Date.now(),
  };
  await saveIntent(triggering);
  await publishStatus(triggering);
  return { ok: true };
}

async function markUnconfirmed(message, sender) {
  const intent = await readIntent();
  if (!canCompleteSend(intent, {
    intentId: message.intentId,
    tabId: sender.tab?.id,
  })) {
    return { ok: false, error: "Intenção de envio inválida ou já encerrada." };
  }
  const uncertain = {
    ...intent,
    status: "TRIGGERED_UNCONFIRMED",
    reconciledAt: Date.now(),
    error: "O clique pode ter ocorrido, mas a extensão não confirmou o resultado.",
  };
  await saveIntent(uncertain);
  await appendActivity(uncertain);
  await publishStatus(uncertain);
  return { ok: true };
}

async function failSend(message, sender) {
  const intent = await readIntent();
  if (!canStartTrigger(intent, {
    intentId: message.intentId,
    tabId: sender.tab?.id,
  })) {
    return { ok: false, error: "Intenção de envio inválida." };
  }
  const failed = {
    ...intent,
    status: "FAILED",
    failedAt: Date.now(),
    error: String(message.error || "Não foi possível acionar o envio.").slice(0, 240),
  };
  await saveIntent(failed);
  await publishStatus(failed);
  return { ok: true };
}

async function getSendStatus() {
  const intent = await readIntent();
  const reconciled = reconcileIntentStatus(intent);
  if (intent && reconciled.status !== intent.status) {
    await saveIntent(reconciled);
    if (reconciled.status === "TRIGGERED_UNCONFIRMED") {
      await appendActivity(reconciled);
    }
    await publishStatus(reconciled);
  }
  return { ok: true, intent: reconciled ? publicIntent(reconciled) : null };
}

async function readIntent() {
  const stored = await chrome.storage.session.get(INTENT_KEY);
  return stored[INTENT_KEY] || null;
}

async function injectWhatsAppAdapterIfPending(tabId) {
  const intent = await readIntent();
  if (!intent || intent.status !== "OPENING" || intent.tabId !== tabId) return;
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith("https://web.whatsapp.com/")) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["whatsapp-content.js"],
  });
}

async function reconcileClosedTab(tabId) {
  const intent = await readIntent();
  if (!intent || intent.tabId !== tabId) return;
  if (intent.status === "TRIGGERING") {
    const uncertain = {
      ...intent,
      status: "TRIGGERED_UNCONFIRMED",
      reconciledAt: Date.now(),
      error: "A aba foi fechada após o clique. Confira a conversa antes de tentar novamente.",
    };
    await saveIntent(uncertain);
    await appendActivity(uncertain);
    await publishStatus(uncertain);
    return;
  }
  if (["OPENING", "EXECUTING"].includes(intent.status)) {
    const failed = {
      ...intent,
      status: "FAILED",
      failedAt: Date.now(),
      error: "A aba do WhatsApp Web foi fechada antes do envio.",
    };
    await saveIntent(failed);
    await publishStatus(failed);
  }
}

async function saveIntent(intent) {
  await chrome.storage.session.set({ [INTENT_KEY]: intent });
}

function publicIntent(intent) {
  return {
    id: intent.id,
    status: intent.status,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
    error: intent.error,
  };
}

async function appendActivity(intent) {
  const stored = await chrome.storage.local.get(ACTIVITY_KEY);
  const activity = Array.isArray(stored[ACTIVITY_KEY]) ? stored[ACTIVITY_KEY] : [];
  activity.unshift({
    id: intent.id,
    status: intent.status,
    phoneTail: intent.phone.slice(-4),
    at: new Date(intent.triggeredAt || intent.reconciledAt).toISOString(),
  });
  await chrome.storage.local.set({ [ACTIVITY_KEY]: activity.slice(0, 100) });
}

async function publishStatus(intent) {
  await chrome.runtime.sendMessage({
    type: "CLIENT_READY_SEND_STATUS_CHANGED",
    intent: publicIntent(intent),
  }).catch(() => undefined);
}
