import assert from "node:assert/strict";
import test from "node:test";
import { buildWhatsAppWebUrl } from "../lib/core.js";

const listeners = {};
const sessionData = {};
const localData = {};

function event(name) {
  return {
    addListener(listener) {
      listeners[name] = listener;
    },
  };
}

function storageArea(data) {
  return {
    async get(key) {
      if (typeof key === "string") return { [key]: data[key] };
      return { ...data };
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

globalThis.chrome = {
  runtime: {
    onInstalled: event("installed"),
    onMessage: event("message"),
    async sendMessage() {},
  },
  sidePanel: {
    async setPanelBehavior() {},
  },
  storage: {
    session: storageArea(sessionData),
    local: storageArea(localData),
  },
  tabs: {
    onUpdated: event("updated"),
    onRemoved: event("removed"),
    async query() {
      return [];
    },
    async create() {
      return { id: 42 };
    },
    async get() {
      return { id: 42, status: "loading", url: "https://web.whatsapp.com/" };
    },
  },
  scripting: {
    async executeScript() {},
  },
};

await import(`../service-worker.js?test=${Date.now()}`);

function dispatch(message, sender = {}) {
  return new Promise((resolve, reject) => {
    const keepOpen = listeners.message(message, sender, resolve);
    if (keepOpen !== true) reject(new Error("Canal assíncrono não foi mantido aberto."));
  });
}

test("service worker persiste pré-clique e bloqueia falha segura depois dele", async () => {
  const started = await dispatch({
    type: "CLIENT_READY_START_SEND",
    phone: "11 99999-8888",
    text: "Mensagem autorizada",
    confirmed: true,
  });
  assert.equal(started.ok, true);
  const opening = sessionData.clienteProntoPendingSend;
  assert.equal(opening.status, "OPENING");

  const sender = { tab: { id: 42 } };
  const ready = await dispatch({
    type: "CLIENT_READY_WHATSAPP_READY",
    pageUrl: buildWhatsAppWebUrl(opening),
  }, sender);
  assert.equal(ready.execute, true);
  assert.equal(sessionData.clienteProntoPendingSend.status, "EXECUTING");

  const about = await dispatch({
    type: "CLIENT_READY_WHATSAPP_ABOUT_TO_TRIGGER",
    intentId: opening.id,
  }, sender);
  assert.equal(about.ok, true);
  assert.equal(sessionData.clienteProntoPendingSend.status, "TRIGGERING");

  const unsafeFailure = await dispatch({
    type: "CLIENT_READY_WHATSAPP_FAILED",
    intentId: opening.id,
    error: "ack perdido",
  }, sender);
  assert.equal(unsafeFailure.ok, false);
  assert.equal(sessionData.clienteProntoPendingSend.status, "TRIGGERING");

  const uncertain = await dispatch({
    type: "CLIENT_READY_WHATSAPP_UNCONFIRMED",
    intentId: opening.id,
  }, sender);
  assert.equal(uncertain.ok, true);
  assert.equal(sessionData.clienteProntoPendingSend.status, "TRIGGERED_UNCONFIRMED");
});

test("fechar a aba antes do clique vira falha segura", async () => {
  await dispatch({ type: "CLIENT_READY_CLEAR_SEND" });
  await dispatch({
    type: "CLIENT_READY_START_SEND",
    phone: "11 98888-7777",
    text: "Outra mensagem",
    confirmed: true,
  });
  listeners.removed(42);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sessionData.clienteProntoPendingSend.status, "FAILED");
});
