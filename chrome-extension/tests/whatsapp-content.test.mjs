import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../whatsapp-content.js", import.meta.url),
  "utf8",
);

test("adaptador usa o composer correto e registra o estado antes do clique", async () => {
  const messages = [];
  let clicks = 0;
  let globalButtonLookup = 0;

  class HTMLElement {}
  const button = new HTMLElement();
  button.disabled = false;
  button.hidden = false;
  button.click = () => {
    clicks += 1;
  };
  const footer = {
    querySelector() {
      return button;
    },
    querySelectorAll() {
      return [];
    },
  };
  const composer = new HTMLElement();
  composer.hidden = false;
  composer.innerText = "Mensagem autorizada";
  composer.closest = (selector) => selector === "footer" ? footer : null;

  const context = {
    HTMLElement,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    document: {
      documentElement: {},
      querySelector(selector) {
        if (selector.includes("compose-box-input") || selector.includes("contenteditable")) {
          return composer;
        }
        globalButtonLookup += 1;
        return null;
      },
    },
    window: {
      location: { href: "https://web.whatsapp.com/send?phone=5511999998888" },
      getComputedStyle() {
        return { display: "block", visibility: "visible", opacity: "1" };
      },
      setTimeout,
      clearTimeout,
    },
    chrome: {
      runtime: {
        async sendMessage(message) {
          messages.push(message.type);
          if (message.type === "CLIENT_READY_WHATSAPP_READY") {
            return {
              execute: true,
              intent: { id: "intent-1", text: "Mensagem autorizada" },
            };
          }
          return { ok: true };
        },
      },
    },
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(messages, [
    "CLIENT_READY_WHATSAPP_READY",
    "CLIENT_READY_WHATSAPP_ABOUT_TO_TRIGGER",
    "CLIENT_READY_WHATSAPP_TRIGGERED",
  ]);
  assert.equal(clicks, 1);
  assert.equal(globalButtonLookup, 0);

  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clicks, 1, "A mesma página não pode executar o adaptador duas vezes.");
});
