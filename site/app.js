const stateKey = "saraiva-studio-settings-v2";
const historyKey = "saraiva-studio-history-v2";
const plannerApi = "https://52cv7zdc64autz4ltjj6h7uce40ktyfd.lambda-url.us-east-1.on.aws/api/planner";

const seedArchive = [
  {
    id: "briefing-campanha",
    title: "Do briefing a campanha pronta.",
    subtitle: "Sem agencia. Sem atraso.",
    mode: "carousel",
    status: "publicado",
    count: 3,
    tone: "blue",
    caption: "Do briefing a campanha pronta.\n\nMe chama no direct.",
  },
  {
    id: "menos-operacao",
    title: "Menos operacao. Mais resultado.",
    subtitle: "Planejamento, legendas e agendamentos",
    mode: "carousel",
    status: "agendado",
    count: 3,
    tone: "ink",
    caption: "Menos operacao. Mais resultado.\n\nMe chama no direct.",
  },
  {
    id: "marca-memoria",
    title: "A IA aprende a sua marca.",
    subtitle: "Tom, estilo e memoria em um unico fluxo",
    mode: "carousel",
    status: "publicado",
    count: 3,
    tone: "slate",
    caption: "A IA aprende a sua marca.\n\nMe chama no direct.",
  },
  {
    id: "whatsapp-inteligencia",
    title: "WhatsApp como inteligencia comercial.",
    subtitle: "Conteudo pronto para vender mais",
    mode: "carousel",
    status: "publicado",
    count: 10,
    tone: "teal",
    caption: "WhatsApp como inteligencia comercial.\n\nMe chama no direct.",
  },
  {
    id: "aprovar-editar",
    title: "Aprovar, editar e publicar no WhatsApp.",
    subtitle: "Tudo dentro da mesma conversa",
    mode: "carousel",
    status: "agendado",
    count: 3,
    tone: "blue",
    caption: "Aprovar, editar e publicar no WhatsApp.\n\nMe chama no direct.",
  },
  {
    id: "operacao",
    title: "Lance, nutra e venda.",
    subtitle: "Sequencia de conteudo que gera receita",
    mode: "carousel",
    status: "publicado",
    count: 5,
    tone: "ink",
    caption: "Lance, nutra e venda.\n\nMe chama no direct.",
  },
];

const defaultState = {
  pin: localStorage.getItem("saraiva-planner-pin") || "",
  mode: "carousel",
  theme: "",
  slug: "",
  caption: "",
  sliceCount: 3,
  trimEdges: 18,
  search: "",
};

const state = loadJson(stateKey, defaultState);
let history = loadJson(historyKey, []);
let selectionToken = 0;
let rawFiles = [];
let previewFiles = [];
let previewUrls = [];
let preparedPayload = null;
let plannerQueue = [];
let nextSlots = [];
let archiveRows = [];

const $ = (id) => document.getElementById(id);

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (parsed && typeof parsed === "object") {
      return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : { ...fallback, ...parsed };
    }
  } catch {
    // ignore
  }
  return Array.isArray(fallback) ? [...fallback] : { ...fallback };
}

function saveState() {
  localStorage.setItem(stateKey, JSON.stringify({
    pin: state.pin,
    mode: state.mode,
    theme: state.theme,
    slug: state.slug,
    caption: state.caption,
    sliceCount: state.sliceCount,
    trimEdges: state.trimEdges,
    search: state.search,
  }));
}

function saveHistory() {
  localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 18)));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function prettyTitle(value) {
  const text = String(value || "").trim().replace(/[-_]+/g, " ");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function plannerPin() {
  return $("plannerPin")?.value?.trim() || state.pin || "";
}

function setStatus(message, kind = "") {
  const el = $("plannerStatus");
  const hint = $("plannerHint");
  if (el) el.textContent = message;
  if (hint) hint.textContent = kind ? kind : message;
}

function setNextSlotLabel(text) {
  const el = $("nextSlotLabel");
  if (el) el.textContent = text;
}

function updateCounts() {
  $("archiveCount").textContent = String(archiveRows.length);
  $("queuedCount").textContent = String(plannerQueue.length);
  $("slotCount").textContent = String(nextSlots.length);
}

function setMode(mode) {
  state.mode = mode;
  saveState();
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  const slices = $("sliceCount");
  if (slices) slices.disabled = mode !== "panorama";
  updateSelectionPreview().catch(reportError);
}

function currentSelectionName() {
  if (state.theme.trim()) return state.theme.trim();
  if (state.slug.trim()) return state.slug.trim().replace(/-/g, " ");
  if (rawFiles[0]) return rawFiles[0].name.replace(/\.[^.]+$/, "");
  return "nova postagem";
}

function suggestCaption() {
  const theme = prettyTitle(currentSelectionName()) || "Nova postagem";
  const count = previewFiles.length || rawFiles.length || 1;
  const modeLabel = state.mode === "panorama"
    ? "carrossel em 3 partes"
    : count === 1
      ? "foto unica"
      : count > 1 && count <= 10
        ? `carrossel com ${count} slides`
        : `sequencia com ${count} fotos`;
  const tags = buildHashtags(theme);
  return `${theme}\n\n${modeLabel} pronto para publicar.\nConteudo organizado, legenda pronta e proxima lacuna em vista.\n\nMe chama no direct.\n\n${tags}`;
}

function buildHashtags(value) {
  const words = slugify(value).split("-").filter(Boolean).slice(0, 4);
  const base = ["SaraivaAI", "InstagramStudio", "ConteudoDigital"];
  const generated = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return [...new Set([...generated, ...base])].map((tag) => `#${tag}`).join(" ");
}

function renderModeState() {
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
  $("sliceCount").disabled = state.mode !== "panorama";
}

function renderTrimValue() {
  $("trimValue").textContent = `${state.trimEdges}px`;
}

function renderUploadEmpty() {
  const preview = $("uploadPreview");
  preview.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "preview-empty";
  empty.textContent = "Nenhuma imagem selecionada.";
  preview.appendChild(empty);
}

function renderPreview() {
  const preview = $("uploadPreview");
  preview.innerHTML = "";
  if (!previewFiles.length) {
    renderUploadEmpty();
    return;
  }
  previewFiles.slice(0, 12).forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "preview-item";
    const img = document.createElement("img");
    img.src = previewUrls[index];
    img.alt = file.name;
    const label = document.createElement("span");
    label.textContent = file.name.replace(/\.[^.]+$/, "");
    card.append(img, label);
    preview.appendChild(card);
  });
}

function renderQueue() {
  const list = $("queueList");
  list.innerHTML = "";
  if (!plannerQueue.length) {
    const li = document.createElement("li");
    li.innerHTML = "<strong>Fila vazia</strong><span>Nenhuma postagem agendada ainda.</span>";
    list.appendChild(li);
  } else {
    plannerQueue.slice(0, 6).forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${item.localTime}</strong>
        <span>${item.slug}</span>
        <em>${item.action === "publishCarousel" ? "carrossel" : "foto"} · ${item.urlCount} midia(s)</em>
      `;
      list.appendChild(li);
    });
  }
  updateCounts();
}

function renderStories() {
  const strip = $("storyStrip");
  strip.innerHTML = "";
  const stories = [...history.slice(0, 4), ...seedArchive.slice(0, 4)];
  stories.slice(0, 6).forEach((item) => {
    const button = document.createElement("button");
    button.className = "story";
    button.type = "button";
    button.innerHTML = `
      <div class="story-visual">${(item.title || "sa")
        .split(" ")
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 2)}</div>
      <span class="story-label">${item.title}</span>
    `;
    button.addEventListener("click", () => loadArchiveItem(item));
    strip.appendChild(button);
  });
}

function toneBackground(tone) {
  const tones = {
    blue: "linear-gradient(180deg, #fdfefe, #dfeaff)",
    ink: "linear-gradient(180deg, #f4f7fb, #d6deea)",
    slate: "linear-gradient(180deg, #f9fafc, #e7edf6)",
    teal: "linear-gradient(180deg, #f4fbfb, #dff3f2)",
  };
  return tones[tone] || tones.blue;
}

function renderArchive() {
  const grid = $("archiveGrid");
  const query = state.search.trim().toLowerCase();
  const rows = [...history, ...seedArchive].filter((item) => {
    if (!query) return true;
    const haystack = [item.title, item.subtitle, item.caption, item.mode, item.status].join(" ").toLowerCase();
    return haystack.includes(query);
  });
  archiveRows = rows;
  grid.innerHTML = "";
  rows.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-card";
    const inner = document.createElement("div");
    inner.className = "archive-card-inner";
    if (item.thumbs?.[0]) {
      const img = document.createElement("img");
      img.className = "archive-thumb";
      img.src = item.thumbs[0];
      img.alt = item.title;
      inner.appendChild(img);
    } else {
      const art = document.createElement("div");
      art.className = "archive-art";
      art.style.background = toneBackground(item.tone);
      art.innerHTML = `
        <div>
          <h3>${item.title}</h3>
          <p>${item.subtitle || item.caption || ""}</p>
        </div>
        <div></div>
      `;
      inner.appendChild(art);
    }

    const badge = document.createElement("span");
    badge.className = "archive-badge";
    badge.textContent = item.mode === "photos" ? "fotos" : "carrossel";

    const count = document.createElement("span");
    count.className = "archive-count";
    count.textContent = item.count ? `${item.count}` : "1";

    inner.append(badge, count);

    const meta = document.createElement("div");
    meta.className = "archive-meta";
    meta.innerHTML = `<span>${item.status || "rascunho"}</span><span>${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("pt-BR") : ""}</span>`;

    button.append(inner, meta);
    button.addEventListener("click", () => loadArchiveItem(item));
    grid.appendChild(button);
  });
  updateCounts();
}

function loadArchiveItem(item) {
  $("postTheme").value = item.title || "";
  $("postSlug").value = slugify(item.title || item.slug || "");
  $("uploadCaption").value = item.caption || suggestCaption();
  if (item.mode === "photos" || item.mode === "carousel" || item.mode === "panorama") {
    setMode(item.mode === "panorama" ? "panorama" : item.mode);
  }
  if (item.sliceCount) $("sliceCount").value = String(item.sliceCount);
  state.theme = $("postTheme").value;
  state.slug = $("postSlug").value;
  state.caption = $("uploadCaption").value;
  saveState();
  $("nova-postagem").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSelectionState() {
  $("selectionCount").textContent = rawFiles.length ? `${rawFiles.length} arquivo(s)` : "0 arquivos";
  if (!rawFiles.length) {
    $("selectionHint").textContent = "aguardando envio";
    return;
  }
  if (state.mode === "panorama" && rawFiles.length > 1) {
    $("selectionHint").textContent = "panorama usa o primeiro arquivo";
  } else if (state.mode === "panorama") {
    $("selectionHint").textContent = `${previewFiles.length || state.sliceCount} slides prontos`;
  } else if (rawFiles.length > 10) {
    $("selectionHint").textContent = "mais de 10 arquivos: fotos separadas";
  } else if (rawFiles.length === 1) {
    $("selectionHint").textContent = "foto unica pronta";
  } else {
    $("selectionHint").textContent = "carrossel pronto";
  }
}

async function loadImage(file) {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Imagem invalida: ${file.name}`));
    };
    image.src = url;
  });
}

function blobToFile(blob, name) {
  const type = blob.type || "image/jpeg";
  return new File([blob], name, { type });
}

async function fileToThumbDataUrl(file, maxWidth = 420) {
  const image = await loadImage(file);
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

async function normalizeToJpeg(file) {
  if (file.type === "image/jpeg" || file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg")) {
    return file;
  }
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error(`Falha convertendo ${file.name}`);
  return blobToFile(blob, file.name.replace(/\.[^.]+$/, ".jpg"));
}

async function splitPanorama(file, parts, trimEdges) {
  const image = await loadImage(file);
  const count = Math.max(2, Math.min(10, Number(parts) || 3));
  const trim = Math.max(0, Number(trimEdges) || 0);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const usableWidth = Math.max(count, sourceWidth - trim * 2);
  const innerWidth = Math.max(count, Math.floor(usableWidth));
  const base = document.createElement("canvas");
  base.width = innerWidth;
  base.height = sourceHeight;
  const baseContext = base.getContext("2d");
  baseContext.fillStyle = "#fff";
  baseContext.fillRect(0, 0, innerWidth, sourceHeight);
  baseContext.drawImage(image, trim, 0, innerWidth, sourceHeight, 0, 0, innerWidth, sourceHeight);

  const partsFiles = [];
  for (let index = 0; index < count; index += 1) {
    const startX = Math.floor((innerWidth * index) / count);
    const endX = index === count - 1 ? innerWidth : Math.floor((innerWidth * (index + 1)) / count);
    const width = Math.max(1, endX - startX);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = sourceHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, sourceHeight);
    context.drawImage(base, startX, 0, width, sourceHeight, 0, 0, width, sourceHeight);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    partsFiles.push(blobToFile(blob, `slide-${String(index + 1).padStart(2, "0")}.jpg`));
  }
  return partsFiles;
}

function cleanupPreviewUrls() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
}

async function updateSelectionPreview() {
  const token = ++selectionToken;
  cleanupPreviewUrls();
  previewFiles = [];

  if (!rawFiles.length) {
    renderPreview();
    renderSelectionState();
    $("uploadCaption").value = state.caption || "";
    return;
  }

  const inputFiles = [...rawFiles];
  let computedFiles = inputFiles;
  if (state.mode === "panorama") {
    const source = inputFiles[0];
    computedFiles = await splitPanorama(source, state.sliceCount, state.trimEdges);
  }

  if (token !== selectionToken) return;

  previewFiles = computedFiles;
  previewUrls = await Promise.all(previewFiles.map((file) => URL.createObjectURL(file)));
  renderPreview();
  renderSelectionState();

  if (!$("postTheme").value.trim()) {
    $("postTheme").value = prettyTitle(previewFiles[0]?.name?.replace(/\.[^.]+$/, "") || rawFiles[0].name.replace(/\.[^.]+$/, ""));
  }
  if (!$("postSlug").value.trim()) {
    $("postSlug").value = slugify($("postTheme").value || previewFiles[0]?.name?.replace(/\.[^.]+$/, "") || rawFiles[0].name.replace(/\.[^.]+$/, ""));
  }
  if (!$("uploadCaption").value.trim()) {
    $("uploadCaption").value = suggestCaption();
  }
  state.theme = $("postTheme").value;
  state.slug = $("postSlug").value;
  state.caption = $("uploadCaption").value;
  saveState();
}

async function readInputFiles(fileList) {
  const collected = [];
  for (const file of [...fileList]) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      if (!window.fflate?.unzipSync) {
        throw new Error("Biblioteca de ZIP nao carregou.");
      }
      const zip = new Uint8Array(await file.arrayBuffer());
      const entries = window.fflate.unzipSync(zip);
      for (const [name, data] of Object.entries(entries)) {
        if (!/\.(png|jpe?g|webp)$/i.test(name) || name.includes("__MACOSX/")) continue;
        collected.push(new File([data], name.split("/").pop(), { type: guessImageType(name) }));
      }
    } else if (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name)) {
      collected.push(file);
    }
  }
  const normalized = [];
  for (const file of collected.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }))) {
    normalized.push(await normalizeToJpeg(file));
  }
  return normalized;
}

function guessImageType(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function handleFileInput(fileList) {
  setStatus("lendo arquivos", "lendo arquivos");
  preparedPayload = null;
  $("scheduleUpload").disabled = true;
  rawFiles = await readInputFiles(fileList);
  if (!rawFiles.length) {
    setStatus("nenhuma imagem encontrada", "error");
    renderSelectionState();
    renderPreview();
    return;
  }
  if (!$("postTheme").value.trim()) {
    $("postTheme").value = prettyTitle(rawFiles[0].name.replace(/\.[^.]+$/, ""));
  }
  if (!$("postSlug").value.trim()) {
    $("postSlug").value = slugify($("postTheme").value || rawFiles[0].name.replace(/\.[^.]+$/, ""));
  }
  if (!$("uploadCaption").value.trim()) {
    $("uploadCaption").value = suggestCaption();
  }
  state.theme = $("postTheme").value;
  state.slug = $("postSlug").value;
  state.caption = $("uploadCaption").value;
  saveState();
  await updateSelectionPreview();
  setStatus(`${rawFiles.length} arquivo(s) prontos`, "ok");
}

function effectiveMode() {
  if (state.mode === "panorama") return "carousel";
  if (previewFiles.length <= 1) return "photos";
  if (previewFiles.length > 10) return "photos";
  return state.mode;
}

async function plannerFetch(path, options = {}) {
  const pin = plannerPin();
  if (!pin) throw new Error("Informe o PIN do planner.");
  state.pin = pin;
  localStorage.setItem("saraiva-planner-pin", pin);
  saveState();
  const response = await fetch(`${plannerApi}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-saraiva-planner-pin": pin,
      ...(options.headers || {}),
    },
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Falha no planner.");
  return result;
}

function formatNextSlots(slots) {
  if (!slots?.length) return "sem lacuna encontrada";
  return `proxima lacuna: ${slots[0].localTime}`;
}

async function refreshPlannerState() {
  try {
    setStatus("conectando", "conectando");
    const result = await plannerFetch("/state");
    plannerQueue = result.queue || [];
    nextSlots = result.nextSlots || [];
    setNextSlotLabel(formatNextSlots(nextSlots));
    renderQueue();
    setStatus(`${plannerQueue.length} agendado(s)`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
    plannerQueue = [];
    nextSlots = [];
    renderQueue();
    setNextSlotLabel("verifique o PIN do planner");
  }
}

async function prepareUpload() {
  if (!rawFiles.length) throw new Error("Selecione imagens ou um .zip.");
  if (!previewFiles.length) await updateSelectionPreview();
  const mode = effectiveMode();
  const slug = slugify($("postSlug").value || $("postTheme").value || rawFiles[0].name.replace(/\.[^.]+$/, ""));
  $("postSlug").value = slug;
  state.slug = slug;
  state.theme = $("postTheme").value;
  state.caption = $("uploadCaption").value.trim() || suggestCaption();
  saveState();

  if (mode === "carousel" && previewFiles.length < 2) {
    throw new Error("Carrossel precisa de pelo menos 2 imagens. Use Fotos separadas ou Panorama 1→3.");
  }

  setStatus("preparando upload", "preparando");
  const result = await plannerFetch("/prepare", {
    method: "POST",
    body: JSON.stringify({
      slug,
      mode,
      files: previewFiles.map((file) => ({
        name: file.name,
        contentType: file.type || "image/jpeg",
        size: file.size,
      })),
    }),
  });

  setStatus("subindo imagens", "subindo imagens");
  for (let index = 0; index < previewFiles.length; index += 1) {
    const target = result.upload[index];
    const response = await fetch(target.uploadUrl, {
      method: "PUT",
      headers: { "content-type": target.contentType },
      body: previewFiles[index],
    });
    if (!response.ok) throw new Error(`Falha no upload ${index + 1}: HTTP ${response.status}`);
  }

  preparedPayload = {
    ...result,
    mode,
    slug,
    urls: result.upload.map((item) => item.url),
  };
  $("scheduleUpload").disabled = false;
  setNextSlotLabel(formatNextSlots(result.nextSlots || []));
  setStatus("upload pronto", "ok");
}

async function schedulePreparedUpload() {
  if (!preparedPayload) throw new Error("Prepare o upload antes de agendar.");
  const mode = preparedPayload.mode || effectiveMode();
  const caption = $("uploadCaption").value.trim() || preparedPayload.draftCaption || suggestCaption();
  setStatus("agendando", "agendando");
  const result = await plannerFetch("/schedule", {
    method: "POST",
    body: JSON.stringify({
      mode,
      slug: preparedPayload.slug || $("postSlug").value,
      urls: preparedPayload.urls,
      caption,
      folder: preparedPayload.slug || $("postSlug").value,
    }),
  });

  const record = {
    id: `${preparedPayload.slug || $("postSlug").value}-${Date.now()}`,
    title: $("postTheme").value || prettyTitle(preparedPayload.slug),
    subtitle: mode === "photos"
      ? `${preparedPayload.urls.length} fotos separadas`
      : `${preparedPayload.urls.length} midias`,
    mode,
    status: "agendado",
    count: preparedPayload.urls.length,
    caption,
    thumbs: await Promise.all(previewFiles.map((file) => fileToThumbDataUrl(file))),
    updatedAt: new Date().toISOString(),
    scheduledAt: result.scheduled?.[0]?.localTime || "",
    sliceCount: state.mode === "panorama" ? Number($("sliceCount").value) || 3 : undefined,
  };
  history = [record, ...history.filter((item) => item.id !== record.id)].slice(0, 18);
  saveHistory();
  renderStories();
  renderArchive();

  preparedPayload = null;
  $("scheduleUpload").disabled = true;
  setNextSlotLabel(result.scheduled?.map((item) => item.localTime).join(" • ") || "agendado");
  setStatus(`${result.scheduled.length} agendado(s)`, "ok");
  await refreshPlannerState();
}

function clearSelection() {
  rawFiles = [];
  previewFiles = [];
  cleanupPreviewUrls();
  $("uploadFiles").value = "";
  $("postTheme").value = "";
  $("postSlug").value = "";
  $("uploadCaption").value = "";
  preparedPayload = null;
  $("scheduleUpload").disabled = true;
  renderUploadEmpty();
  renderSelectionState();
  state.theme = "";
  state.slug = "";
  state.caption = "";
  saveState();
}

function reportError(error) {
  setStatus(error.message, "error");
}

function bindEvents() {
  $("plannerPin").value = state.pin;
  $("postTheme").value = state.theme;
  $("postSlug").value = state.slug;
  $("uploadCaption").value = state.caption;
  $("sliceCount").value = String(state.sliceCount);
  $("trimEdges").value = String(state.trimEdges);
  $("archiveSearch").value = state.search;
  renderModeState();
  renderTrimValue();
  renderUploadEmpty();

  $("refreshTop").addEventListener("click", () => refreshPlannerState().catch(reportError));
  $("plannerRefresh").addEventListener("click", () => refreshPlannerState().catch(reportError));
  $("prepareUpload").addEventListener("click", () => prepareUpload().catch(reportError));
  $("scheduleUpload").addEventListener("click", () => schedulePreparedUpload().catch(reportError));
  $("clearSelection").addEventListener("click", clearSelection);
  $("plannerPin").addEventListener("input", (event) => {
    state.pin = event.target.value.trim();
    saveState();
  });
  $("postTheme").addEventListener("input", (event) => {
    state.theme = event.target.value;
    if (!$("postSlug").value.trim()) $("postSlug").value = slugify(event.target.value);
    if (!$("uploadCaption").value.trim()) $("uploadCaption").value = suggestCaption();
    state.slug = $("postSlug").value;
    state.caption = $("uploadCaption").value;
    saveState();
  });
  $("postSlug").addEventListener("input", (event) => {
    state.slug = event.target.value;
    saveState();
  });
  $("uploadCaption").addEventListener("input", (event) => {
    state.caption = event.target.value;
    saveState();
  });
  $("sliceCount").addEventListener("input", async (event) => {
    state.sliceCount = Math.max(2, Math.min(10, Number(event.target.value) || 3));
    saveState();
    renderTrimValue();
    if (state.mode === "panorama" && rawFiles.length) await updateSelectionPreview();
  });
  $("trimEdges").addEventListener("input", async (event) => {
    state.trimEdges = Math.max(0, Math.min(60, Number(event.target.value) || 0));
    saveState();
    renderTrimValue();
    if (state.mode === "panorama" && rawFiles.length) await updateSelectionPreview();
  });
  $("archiveSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    saveState();
    renderArchive();
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  $("uploadFiles").addEventListener("change", (event) => {
    handleFileInput(event.target.files).catch(reportError);
  });

  $("dropzone").addEventListener("click", () => $("uploadFiles").click());
  $("dropzone").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("uploadFiles").click();
    }
  });
  $("dropzone").addEventListener("dragover", (event) => {
    event.preventDefault();
    $("dropzone").classList.add("dragover");
  });
  $("dropzone").addEventListener("dragleave", () => {
    $("dropzone").classList.remove("dragover");
  });
  $("dropzone").addEventListener("drop", (event) => {
    event.preventDefault();
    $("dropzone").classList.remove("dragover");
    if (event.dataTransfer?.files?.length) {
      handleFileInput(event.dataTransfer.files).catch(reportError);
    }
  });

  if (state.pin) {
    refreshPlannerState().catch(reportError);
  } else {
    setStatus("aguardando PIN", "aguardando PIN");
    renderQueue();
    updateCounts();
  }

  setInterval(() => {
    if (plannerPin()) refreshPlannerState().catch(() => {});
  }, 60000);

  window.addEventListener("beforeunload", cleanupPreviewUrls);
}

function bootstrap() {
  renderModeState();
  renderTrimValue();
  renderStories();
  renderArchive();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", bootstrap);
