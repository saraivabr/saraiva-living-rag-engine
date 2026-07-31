const exampleLink = "https://www.instagram.com/saraiva.ai/";

const processingContent = [
  {
    title: "Identificando o negócio...",
    subtitle: "Validando a fonte e organizando as informações públicas.",
    progress: 12,
  },
  {
    title: "Lendo a presença digital...",
    subtitle: "Analisando posicionamento, prova social e canais de contato.",
    progress: 29,
  },
  {
    title: "Mapeando a oportunidade...",
    subtitle: "Encontrando o ponto de maior impacto comercial.",
    progress: 48,
  },
  {
    title: "Construindo a oferta...",
    subtitle: "Conectando o problema identificado a uma solução vendável.",
    progress: 66,
  },
  {
    title: "Calculando o investimento...",
    subtitle: "Definindo uma faixa coerente com escopo e valor percebido.",
    progress: 83,
  },
  {
    title: "Criando a abordagem...",
    subtitle: "Personalizando a mensagem e o plano de fechamento.",
    progress: 96,
  },
];

const elements = {
  form: document.querySelector("#analysisForm"),
  input: document.querySelector("#companyLink"),
  hero: document.querySelector("#heroSection"),
  processing: document.querySelector("#processingSection"),
  results: document.querySelector("#resultsSection"),
  progressBar: document.querySelector("#progressBar"),
  progressPercent: document.querySelector("#progressPercent"),
  processingTitle: document.querySelector("#processingTitle"),
  processingSubtitle: document.querySelector("#processingSubtitle"),
  processingSource: document.querySelector("#processingSource"),
  processingSteps: [...document.querySelectorAll("#processingSteps li")],
  exampleButton: document.querySelector("#exampleButton"),
  sourceButtons: [...document.querySelectorAll("[data-source]")],
  tabs: [...document.querySelectorAll("[data-tab]")],
  panels: [...document.querySelectorAll("[data-panel]")],
  newAnalysis: document.querySelector("#newAnalysisButton"),
  toast: document.querySelector("#toast"),
  error: document.querySelector("#analysisError"),
};

let analysisRun = 0;
let toastTimer = null;

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  startAnalysis(elements.input.value.trim());
});

elements.exampleButton.addEventListener("click", () => {
  elements.input.value = exampleLink;
  markSource("instagram");
  elements.input.focus();
  elements.input.setSelectionRange(elements.input.value.length, elements.input.value.length);
});

elements.sourceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const source = button.dataset.source;
    markSource(source);
    elements.input.placeholder =
      source === "instagram"
        ? "https://instagram.com/nome.da.empresa"
        : "https://maps.app.goo.gl/...";
    elements.input.focus();
  });
});

elements.input.addEventListener("input", () => {
  const source = detectSource(elements.input.value);
  markSource(source);
});

elements.tabs.forEach((button) => {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copy}`);
    await copyText(target?.textContent || "");
    showToast("Abordagem copiada");
  });
});

document.querySelector("#proposalButton").addEventListener("click", () => {
  showToast("Proposta comercial gerada");
});

elements.newAnalysis.addEventListener("click", resetAnalysis);

async function startAnalysis(link) {
  if (!isSupportedLink(link)) {
    elements.input.setCustomValidity("Cole um link válido do Google Maps ou Instagram.");
    elements.input.reportValidity();
    window.setTimeout(() => elements.input.setCustomValidity(""), 50);
    return;
  }

  const run = ++analysisRun;
  const source = detectSource(link);
  elements.error.hidden = true;
  elements.hero.hidden = true;
  elements.results.hidden = true;
  elements.processing.hidden = false;
  elements.processingSource.textContent =
    source === "instagram" ? "Instagram detectado" : "Google Maps detectado";
  elements.processingSteps.forEach((item) => item.classList.remove("done", "current"));
  window.scrollTo({ top: 0, behavior: "auto" });

  const request = requestDossier(link);
  try {
    for (let index = 0; index < processingContent.length; index += 1) {
      if (analysisRun !== run) return;
      updateProcessing(index);
      await delay(index === 0 ? 720 : 650);
    }

    const dossier = await request;
    if (analysisRun !== run) return;
    elements.progressBar.style.width = "100%";
    elements.progressPercent.textContent = "100%";
    elements.processingSteps.at(-1)?.classList.remove("current");
    elements.processingSteps.at(-1)?.classList.add("done");
    await delay(380);

    renderProfile(dossier);
    elements.processing.hidden = true;
    elements.results.hidden = false;
    selectTab("overview");
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch (error) {
    if (analysisRun !== run) return;
    elements.processing.hidden = true;
    elements.hero.hidden = false;
    elements.error.textContent = error instanceof Error
      ? error.message
      : "Não foi possível concluir a análise real.";
    elements.error.hidden = false;
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function updateProcessing(index) {
  const content = processingContent[index];
  elements.processingTitle.textContent = content.title;
  elements.processingSubtitle.textContent = content.subtitle;
  elements.progressBar.style.width = `${content.progress}%`;
  elements.progressPercent.textContent = `${content.progress}%`;
  elements.processingSteps.forEach((item, itemIndex) => {
    item.classList.toggle("done", itemIndex < index);
    item.classList.toggle("current", itemIndex === index);
  });
}

function renderProfile(profile) {
  setText("companyName", profile.name);
  setText("companyInitials", profile.initials);
  setText("companyMeta", `${profile.category} · ${profile.location}`);
  setText("scoreValue", profile.score);
  renderSignal("One", profile.signals[0]);
  renderSignal("Two", profile.signals[1]);
  renderSignal("Three", profile.signals[2]);
  setText("diagnosisTitle", profile.diagnosis);
  setText("diagnosisText", profile.diagnosisText);
  setText("opportunityTitle", profile.opportunity);
  setText("opportunityText", profile.opportunityText);
  setText("offerName", profile.offerName);
  setText("offerPromise", profile.offerPromise);
  renderOfferScope(profile.offerScope);
  setText("priceValue", profile.price);
  setText("installmentValue", profile.installment);
  setText("monthlyValue", profile.monthly);

  setText("approachMessage", profile.approachMessage);
  setText("followupOne", profile.followupOne);
  setText("followupTwo", profile.followupTwo);
  setText(
    "footerEvidence",
    `Dados coletados agora via ${profile.sourceLabel} · ${formatFetchTime(profile.fetchedAt)}`,
  );

  const scoreRing = document.querySelector("#scoreRing");
  scoreRing.style.background =
    `conic-gradient(var(--blue) 0 ${profile.score}%, #dfe5ee ${profile.score}%)`;
}

async function requestDossier(link) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 160_000);
  try {
    const response = await fetch("/api/prospeccao/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body?.dossier) return body.dossier;
    const messages = {
      company_not_found: "Não encontrei esse perfil público. Confira o link exato da empresa.",
      unsupported_company_link: "Cole um perfil do Instagram ou um link do Google Maps.",
      analysis_provider_failed: "A fonte de dados não respondeu. Tente novamente em instantes.",
    };
    throw new Error(messages[body?.error] || "Não foi possível concluir a análise real.");
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("A pesquisa excedeu o tempo esperado. Tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function renderSignal(slot, signal) {
  setText(`signal${slot}Label`, signal?.label || "DADO PÚBLICO");
  setText(`signal${slot}Value`, signal?.value || "—");
  setText(`signal${slot}Suffix`, signal?.suffix || "");
}

function renderOfferScope(scope) {
  const list = document.querySelector("#offerScope");
  list.replaceChildren();
  (Array.isArray(scope) ? scope : []).slice(0, 4).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function formatFetchTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "coleta concluída";
  return `coletado às ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function selectTab(tabName) {
  elements.tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  elements.panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
}

function resetAnalysis() {
  analysisRun += 1;
  elements.results.hidden = true;
  elements.processing.hidden = true;
  elements.hero.hidden = false;
  elements.input.value = "";
  elements.error.hidden = true;
  markSource("");
  window.scrollTo({ top: 0, behavior: "auto" });
  window.setTimeout(() => elements.input.focus(), 450);
}

function markSource(source) {
  elements.sourceButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.source === source);
  });
}

function detectSource(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("instagram.com")) return "instagram";
  if (
    normalized.includes("google.") ||
    normalized.includes("goo.gl") ||
    normalized.includes("maps.app")
  ) {
    return "google";
  }
  return "";
}

function isSupportedLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(detectSource(value));
  } catch {
    return false;
  }
}

function setText(id, value) {
  const target = document.querySelector(`#${id}`);
  if (target) target.textContent = String(value);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value.trim());
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value.trim();
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.querySelector("p").textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
