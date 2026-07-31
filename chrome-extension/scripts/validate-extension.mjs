import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const requiredFiles = [
  "manifest.json",
  "service-worker.js",
  "whatsapp-content.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "lib/core.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, "module");
assert.equal(manifest.side_panel.default_path, "sidepanel.html");
assert.deepEqual(
  [...manifest.permissions].sort(),
  ["scripting", "sidePanel", "storage", "tabs"].sort(),
  "A extensão deve manter somente as permissões mínimas aprovadas.",
);
assert.deepEqual(
  manifest.host_permissions,
  [
    "https://52cv7zdc64autz4ltjj6h7uce40ktyfd.lambda-url.us-east-1.on.aws/*",
    "https://web.whatsapp.com/*",
  ],
);
assert.equal(manifest.content_scripts, undefined);

for (const relativePath of requiredFiles) {
  const file = join(root, relativePath);
  assert.equal((await stat(file)).isFile(), true, `Arquivo obrigatório ausente: ${relativePath}`);
}

for (const relativePath of ["service-worker.js", "whatsapp-content.js", "sidepanel.js", "lib/core.js"]) {
  const source = await readFile(join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /document\.cookie|chrome\.cookies|eval\s*\(|new Function\s*\(/);
  assert.doesNotMatch(source, /import\s*\(\s*["']https?:\/\//);
  const check = spawnSync(process.execPath, ["--check", join(root, relativePath)], {
    encoding: "utf8",
  });
  assert.equal(check.status, 0, check.stderr || `JavaScript inválido: ${relativePath}`);
}

const html = await readFile(join(root, "sidepanel.html"), "utf8");
assert.doesNotMatch(html, /<script(?![^>]+src=)/i, "Scripts inline não são permitidos.");
assert.match(html, /id="contactConfirmation"/);
assert.match(html, /id="resetSendButton"/);
assert.match(html, /Enviar pelo WhatsApp Web/);

const worker = await readFile(join(root, "service-worker.js"), "utf8");
assert.match(worker, /chrome\.scripting\.executeScript/);
assert.match(worker, /intent\.tabId !== tabId/);
assert.match(worker, /CLIENT_READY_WHATSAPP_ABOUT_TO_TRIGGER/);
assert.match(worker, /TRIGGERED_UNCONFIRMED/);

const adapter = await readFile(join(root, "whatsapp-content.js"), "utf8");
assert.match(adapter, /findMatchingComposer/);
assert.match(adapter, /CLIENT_READY_WHATSAPP_UNCONFIRMED/);

console.log("Manifest V3 validado: permissões mínimas, arquivos completos e sem código remoto.");
