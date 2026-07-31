import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "output");
const packageRoot = join(outputRoot, "cliente-pronto");
const zipPath = join(outputRoot, "cliente-pronto-chrome-v0.1.0.zip");
const files = [
  "manifest.json",
  "service-worker.js",
  "whatsapp-content.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "lib",
  "icons",
  "PRIVACY.md",
  "INSTALAR.md",
];

await rm(packageRoot, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(packageRoot, { recursive: true });
for (const relativePath of files) {
  await cp(join(root, relativePath), join(packageRoot, relativePath), { recursive: true });
}

const zipped = spawnSync("zip", ["-qr", zipPath, "."], {
  cwd: packageRoot,
  encoding: "utf8",
});
if (zipped.status !== 0) {
  throw new Error(zipped.stderr || "Não foi possível criar o ZIP.");
}
console.log(zipPath);
