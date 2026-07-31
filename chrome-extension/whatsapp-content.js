(() => {
  if (globalThis.__CLIENTE_PRONTO_WHATSAPP_ACTIVE__) return;
  globalThis.__CLIENTE_PRONTO_WHATSAPP_ACTIVE__ = true;

  const READY_RETRY_MS = 900;
  const READY_TIMEOUT_MS = 45_000;
  const BUTTON_TIMEOUT_MS = 45_000;
  const startedAt = Date.now();
  let claimed = false;

  requestAuthorization();

  async function requestAuthorization() {
    if (claimed || Date.now() - startedAt > READY_TIMEOUT_MS) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CLIENT_READY_WHATSAPP_READY",
        pageUrl: window.location.href,
      });
      if (response?.execute && response.intent) {
        claimed = true;
        await executeSend(response.intent);
        return;
      }
      if (["expired", "wrong_recipient", "already_claimed"].includes(response?.reason)) {
        return;
      }
    } catch {
      // O service worker pode reiniciar durante a abertura do WhatsApp Web.
    }
    window.setTimeout(requestAuthorization, READY_RETRY_MS);
  }

  async function executeSend(intent) {
    let triggerStarted = false;
    try {
      const button = await waitForSendButton(intent.text, BUTTON_TIMEOUT_MS);
      if (!button || button.disabled) {
        throw new Error("O botão de envio não ficou disponível. Confirme que o WhatsApp Web está conectado.");
      }
      const authorization = await chrome.runtime.sendMessage({
        type: "CLIENT_READY_WHATSAPP_ABOUT_TO_TRIGGER",
        intentId: intent.id,
      });
      if (!authorization?.ok) {
        throw new Error(authorization?.error || "O envio não foi autorizado.");
      }
      triggerStarted = true;
      button.click();
      const acknowledgment = await chrome.runtime.sendMessage({
        type: "CLIENT_READY_WHATSAPP_TRIGGERED",
        intentId: intent.id,
      });
      if (!acknowledgment?.ok) {
        throw new Error(acknowledgment?.error || "O clique não pôde ser confirmado.");
      }
    } catch (error) {
      await chrome.runtime.sendMessage({
        type: triggerStarted
          ? "CLIENT_READY_WHATSAPP_UNCONFIRMED"
          : "CLIENT_READY_WHATSAPP_FAILED",
        intentId: intent.id,
        error: error instanceof Error ? error.message : "Falha ao acionar o envio.",
      }).catch(() => undefined);
    }
  }

  function waitForSendButton(expectedText, timeoutMs) {
    return new Promise((resolve, reject) => {
      const existing = findSendButton(expectedText);
      if (existing) {
        resolve(existing);
        return;
      }

      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error("Tempo esgotado aguardando o WhatsApp Web."));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const button = findSendButton(expectedText);
        if (!button) return;
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(button);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-label", "data-testid", "data-icon", "disabled"],
      });
    });
  }

  function findSendButton(expectedText) {
    const composer = findMatchingComposer(expectedText);
    if (!composer) return null;
    const root = composer.closest("footer") || composer.parentElement;
    if (!root) return null;
    const direct = root.querySelector(
      [
        'button[data-testid="compose-btn-send"]',
        'button[aria-label="Enviar"]',
        'button[aria-label="Send"]',
      ].join(","),
    );
    if (isVisible(direct)) return direct;

    for (const icon of root.querySelectorAll(
      '[data-icon="send"], [data-testid="send"], span[data-icon="wds-ic-send-filled"]',
    )) {
      const button = icon.closest("button");
      if (isVisible(button)) return button;
    }
    return null;
  }

  function findMatchingComposer(expectedText) {
    const composer = document.querySelector(
      [
        'footer [contenteditable="true"][role="textbox"]',
        '[data-testid="conversation-compose-box-input"]',
        'footer div[contenteditable="true"][data-tab]',
      ].join(","),
    );
    if (!(composer instanceof HTMLElement) || !isVisible(composer)) return null;
    return normalizeText(composer.innerText || composer.textContent)
      === normalizeText(expectedText) ? composer : null;
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity || "1") > 0;
  }
})();
