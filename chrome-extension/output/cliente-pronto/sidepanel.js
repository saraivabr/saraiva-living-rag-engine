import {
  isGoogleMapsUrl,
  isValidOrder,
  invalidateContactConfirmation as clearContactConfirmation,
  leadKey,
  normalizeMessage,
  normalizePhone,
} from "./lib/core.js";

const API_BASE = "https://52cv7zdc64autz4ltjj6h7uce40ktyfd.lambda-url.us-east-1.on.aws";
const GENERATE_URL = `${API_BASE}/checkout/website-guide/generate`;
const SETTINGS_KEY = "clienteProntoSettings";
const PIPELINE_KEY = "clienteProntoPipeline";

const elements = {
  form: byId("dossierForm"),
  order: byId("orderInput"),
  business: byId("businessInput"),
  location: byId("locationInput"),
  generate: byId("generateButton"),
  generationStatus: byId("generationStatus"),
  activeTabStatus: byId("activeTabStatus"),
  refreshTab: byId("refreshTabButton"),
  resultSection: byId("resultSection"),
  emptyState: byId("emptyState"),
  businessName: byId("businessName"),
  businessMeta: byId("businessMeta"),
  diagnosisHeadline: byId("diagnosisHeadline"),
  diagnosisSignal: byId("diagnosisSignal"),
  diagnosisOpportunity: byId("diagnosisOpportunity"),
  diagnosisPoints: byId("diagnosisPoints"),
  variantTabs: byId("variantTabs"),
  message: byId("messageInput"),
  characterCount: byId("characterCount"),
  phone: byId("phoneInput"),
  confirmation: byId("contactConfirmation"),
  send: byId("sendWhatsAppButton"),
  sendStatus: byId("sendStatus"),
  resetSend: byId("resetSendButton"),
  pipelineStage: byId("pipelineStage"),
  followUp: byId("followUpInput"),
  savePipeline: byId("savePipelineButton"),
  pipelineStatus: byId("pipelineStatus"),
  offerName: byId("offerName"),
  offerPromise: byId("offerPromise"),
  offerScope: byId("offerScope"),
  offerPrice: byId("offerPrice"),
  offerNote: byId("offerNote"),
  proposal: byId("proposalOutput"),
  contract: byId("contractOutput"),
  prompt: byId("promptOutput"),
  checklist: byId("deliveryChecklist"),
};

const state = {
  result: null,
  selectedMessage: 0,
  sendStatusTimer: null,
};

initialize();

async function initialize() {
  bindEvents();
  const stored = await chrome.storage.local.get([SETTINGS_KEY]);
  if (stored[SETTINGS_KEY]?.order) elements.order.value = stored[SETTINGS_KEY].order;
  await captureActiveTab();
  const status = await chrome.runtime.sendMessage({ type: "CLIENT_READY_GET_SEND_STATUS" });
  if (status?.intent) renderSendStatus(status.intent);
}

function bindEvents() {
  elements.form.addEventListener("submit", generateDossier);
  elements.refreshTab.addEventListener("click", captureActiveTab);
  elements.message.addEventListener("input", () => {
    updateCharacterCount();
    invalidateContactConfirmation();
  });
  elements.phone.addEventListener("input", invalidateContactConfirmation);
  elements.send.addEventListener("click", sendByWhatsApp);
  elements.resetSend.addEventListener("click", resetSend);
  elements.savePipeline.addEventListener("click", savePipeline);
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => copyOutput(button));
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CLIENT_READY_SEND_STATUS_CHANGED" && message.intent) {
      renderSendStatus(message.intent);
    }
  });
}

async function captureActiveTab() {
  elements.activeTabStatus.textContent = "Lendo a aba atual…";
  try {
    const response = await chrome.runtime.sendMessage({ type: "CLIENT_READY_GET_ACTIVE_TAB" });
    const tab = response?.tab;
    if (!tab?.url) {
      elements.activeTabStatus.textContent = "Nenhuma aba disponível.";
      return;
    }
    if (isGoogleMapsUrl(tab.url)) {
      elements.business.value = tab.url;
      elements.activeTabStatus.textContent = `Maps detectado: ${tab.title || "negócio aberto"}`;
      return;
    }
    elements.activeTabStatus.textContent = "Abra o negócio no Google Maps ou digite o nome.";
  } catch {
    elements.activeTabStatus.textContent = "Não foi possível ler a aba. Cole o link manualmente.";
  }
}

async function generateDossier(event) {
  event.preventDefault();
  setStatus(elements.generationStatus, "");
  const order = elements.order.value.trim();
  const business = elements.business.value.trim();
  const location = elements.location.value.trim();
  if (!isValidOrder(order)) {
    setStatus(elements.generationStatus, "Confira o código de acesso.", "error");
    elements.order.focus();
    return;
  }
  if (business.length < 3) {
    setStatus(elements.generationStatus, "Informe o negócio ou abra seu perfil no Maps.", "error");
    elements.business.focus();
    return;
  }

  elements.generate.disabled = true;
  elements.generate.querySelector("span").textContent = "Pesquisando e montando…";
  setStatus(elements.generationStatus, "A coleta pode levar até dois minutos.");
  await chrome.storage.local.set({ [SETTINGS_KEY]: { order } });

  try {
    const result = await requestDossier({ order, business, location });
    renderResult(result);
    setStatus(
      elements.generationStatus,
      result.usage
        ? `Cliente pronto. Restam ${result.usage.remaining} de ${result.usage.limit} prospecções.`
        : "Cliente pronto.",
      "success",
    );
  } catch (error) {
    setStatus(
      elements.generationStatus,
      error instanceof Error ? error.message : "Não foi possível gerar o dossiê.",
      "error",
    );
  } finally {
    elements.generate.disabled = false;
    elements.generate.querySelector("span").textContent = "Gerar Dossiê Cliente Pronto";
  }
}

async function requestDossier({ order, business, location }) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 155_000);
  try {
    const response = await fetch(GENERATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pedido: order, business, location }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.prompt && body.business && body.kit) return body;
    if (response.status === 402) {
      throw new Error("Este acesso ainda não foi liberado.");
    }
    throw new Error(humanizeApiError(body.error, response.status));
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("A pesquisa excedeu o tempo esperado. Tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderResult(result) {
  state.result = result;
  state.selectedMessage = 0;
  const { business, kit } = result;
  elements.resultSection.hidden = false;
  elements.emptyState.hidden = true;
  elements.businessName.textContent = business.name || "Negócio escolhido";
  elements.businessMeta.textContent = [
    business.category,
    business.address,
  ].filter(Boolean).join(" • ");

  elements.diagnosisHeadline.textContent = kit.diagnosis.headline;
  elements.diagnosisSignal.textContent = kit.diagnosis.publicSignal;
  elements.diagnosisOpportunity.textContent = kit.diagnosis.opportunity;
  renderList(elements.diagnosisPoints, kit.diagnosis.proofPoints);
  renderMessageTabs(kit.whatsappApproaches);
  elements.phone.value = business.phone || "";
  invalidateContactConfirmation();

  elements.offerName.textContent = kit.offer.name;
  elements.offerPromise.textContent = kit.offer.promise;
  renderList(elements.offerScope, kit.offer.suggestedScope);
  elements.offerPrice.textContent = kit.offer.priceReference;
  elements.offerNote.textContent = kit.offer.pricingNote;
  elements.proposal.value = kit.proposalTemplate;
  elements.contract.value = kit.contractTemplate;
  elements.prompt.value = result.prompt;
  renderList(elements.checklist, kit.deliveryChecklist);
  restorePipeline(business);
  elements.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderMessageTabs(approaches) {
  elements.variantTabs.replaceChildren();
  approaches.forEach((approach, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = shortLabel(approach.label, index);
    button.setAttribute("aria-selected", index === state.selectedMessage ? "true" : "false");
    button.addEventListener("click", () => {
      state.selectedMessage = index;
      elements.message.value = approach.text;
      for (const [buttonIndex, tab] of [...elements.variantTabs.children].entries()) {
        tab.setAttribute("aria-selected", buttonIndex === index ? "true" : "false");
      }
      updateCharacterCount();
      invalidateContactConfirmation();
    });
    elements.variantTabs.append(button);
  });
  elements.message.value = approaches[0]?.text || "";
  updateCharacterCount();
}

async function sendByWhatsApp() {
  setStatus(elements.sendStatus, "");
  if (!state.result) return;
  try {
    const phone = normalizePhone(elements.phone.value);
    const text = normalizeMessage(elements.message.value);
    if (!elements.confirmation.checked) {
      throw new Error("Confirme que você pode realizar este contato.");
    }
    elements.send.disabled = true;
    setStatus(elements.sendStatus, "Abrindo o WhatsApp Web…");
    const response = await chrome.runtime.sendMessage({
      type: "CLIENT_READY_START_SEND",
      phone,
      text,
      confirmed: true,
    });
    if (!response?.ok) throw new Error(response?.error || "Falha ao abrir o WhatsApp Web.");
    renderSendStatus(response.intent);
  } catch (error) {
    setStatus(
      elements.sendStatus,
      error instanceof Error ? error.message : "Não foi possível iniciar o envio.",
      "error",
    );
    elements.send.disabled = false;
  }
}

function renderSendStatus(intent) {
  if (state.sendStatusTimer) {
    window.clearTimeout(state.sendStatusTimer);
    state.sendStatusTimer = null;
  }
  const messages = {
    PENDING: "Preparando envio…",
    OPENING: "WhatsApp Web aberto. Aguardando a conversa ficar pronta…",
    EXECUTING: "Mensagem confirmada. Acionando o envio…",
    TRIGGERING: "Clique autorizado. Confirmando o resultado…",
    SEND_TRIGGERED: "Envio acionado no WhatsApp Web.",
    FAILED: intent.error || "O envio não foi acionado.",
    EXPIRED: "A confirmação expirou. Clique novamente para tentar.",
    TRIGGERED_UNCONFIRMED: intent.error
      || "O clique pode ter ocorrido. Confira a conversa antes de liberar outro envio.",
  };
  const kind = intent.status === "SEND_TRIGGERED"
    ? "success"
    : ["FAILED", "EXPIRED", "TRIGGERED_UNCONFIRMED"].includes(intent.status) ? "error" : "";
  setStatus(elements.sendStatus, messages[intent.status] || "Status atualizado.", kind);
  elements.send.disabled = [
    "PENDING",
    "OPENING",
    "EXECUTING",
    "TRIGGERING",
    "TRIGGERED_UNCONFIRMED",
  ].includes(intent.status);
  elements.resetSend.hidden = intent.status !== "TRIGGERED_UNCONFIRMED";
  scheduleSendStatusRefresh(intent);
  if (intent.status === "SEND_TRIGGERED" && elements.pipelineStage.value === "prepared") {
    elements.confirmation.checked = false;
    elements.pipelineStage.value = "contacted";
    savePipeline();
  }
}

function scheduleSendStatusRefresh(intent) {
  let delay = null;
  if (["PENDING", "OPENING", "EXECUTING"].includes(intent.status)) {
    delay = Math.max(100, Number(intent.expiresAt || Date.now()) - Date.now() + 50);
  } else if (intent.status === "TRIGGERING") {
    delay = 3_100;
  }
  if (delay === null) return;
  state.sendStatusTimer = window.setTimeout(refreshSendStatus, delay);
}

async function refreshSendStatus() {
  state.sendStatusTimer = null;
  const response = await chrome.runtime.sendMessage({
    type: "CLIENT_READY_GET_SEND_STATUS",
  }).catch(() => null);
  if (response?.intent) renderSendStatus(response.intent);
}

async function resetSend() {
  await chrome.runtime.sendMessage({ type: "CLIENT_READY_CLEAR_SEND" });
  elements.confirmation.checked = false;
  elements.send.disabled = false;
  elements.resetSend.hidden = true;
  setStatus(elements.sendStatus, "Revise a mensagem, confirme o contato e tente novamente.");
}

function invalidateContactConfirmation() {
  invalidateContactConfirmationControl();
}

function invalidateContactConfirmationControl() {
  clearContactConfirmation(elements.confirmation);
}

async function savePipeline() {
  if (!state.result?.business) return;
  const stored = await chrome.storage.local.get(PIPELINE_KEY);
  const pipeline = stored[PIPELINE_KEY] && typeof stored[PIPELINE_KEY] === "object"
    ? stored[PIPELINE_KEY]
    : {};
  const key = leadKey(state.result.business);
  pipeline[key] = {
    business: {
      name: state.result.business.name,
      phone: state.result.business.phone || "",
      category: state.result.business.category || "",
      mapsUrl: state.result.business.mapsUrl || "",
    },
    stage: elements.pipelineStage.value,
    followUpAt: elements.followUp.value || null,
    updatedAt: new Date().toISOString(),
    createdAt: pipeline[key]?.createdAt || new Date().toISOString(),
  };
  const entries = Object.entries(pipeline)
    .sort(([, a], [, b]) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 250);
  await chrome.storage.local.set({ [PIPELINE_KEY]: Object.fromEntries(entries) });
  setStatus(elements.pipelineStatus, "Oportunidade salva neste navegador.", "success");
}

async function restorePipeline(business) {
  const stored = await chrome.storage.local.get(PIPELINE_KEY);
  const lead = stored[PIPELINE_KEY]?.[leadKey(business)];
  elements.pipelineStage.value = lead?.stage || "prepared";
  elements.followUp.value = lead?.followUpAt || "";
  setStatus(elements.pipelineStatus, lead ? "Oportunidade recuperada." : "");
}

async function copyOutput(button) {
  const target = byId(button.dataset.copyTarget);
  if (!(target instanceof HTMLTextAreaElement)) return;
  await navigator.clipboard.writeText(target.value);
  const original = button.textContent;
  button.textContent = "Copiado ✓";
  window.setTimeout(() => {
    button.textContent = original;
  }, 1600);
}

function updateCharacterCount() {
  elements.characterCount.textContent = `${elements.message.value.length} / 4096`;
}

function renderList(container, values) {
  container.replaceChildren();
  for (const value of Array.isArray(values) ? values : []) {
    const item = document.createElement("li");
    item.textContent = value;
    container.append(item);
  }
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  if (kind) element.dataset.kind = kind;
  else delete element.dataset.kind;
}

function shortLabel(label, index) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("direta")) return "Direta";
  if (normalized.includes("oportunidade")) return "Oportunidade";
  if (normalized.includes("follow")) return "Follow-up";
  return `Versão ${index + 1}`;
}

function humanizeApiError(error, status) {
  const messages = {
    "pedido invalido": "Confira o código do pedido.",
    "pedido nao encontrado": "Este pedido não foi encontrado.",
    "este pedido ja gerou o dossie de um negocio": "Este pedido já foi utilizado.",
    "a automacao deste negocio ja esta em andamento": "O dossiê ainda está sendo gerado.",
    "apify_business_not_found": "Não encontrei esse negócio. Abra o perfil exato no Maps.",
    "as 10 prospeccoes deste pedido ja foram utilizadas": "Você já utilizou as 10 prospecções deste pacote.",
    "a prospeccao gratuita deste acesso ja foi utilizada": "Você já utilizou a prospecção gratuita deste acesso.",
  };
  return messages[error] || `Não foi possível gerar o dossiê (${status}).`;
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento ausente: ${id}`);
  return element;
}
