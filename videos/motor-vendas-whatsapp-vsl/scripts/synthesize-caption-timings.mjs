#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const script = readFileSync(new URL("../SCRIPT.md", import.meta.url), "utf8");
const metaPath = new URL("../audio_meta.json", import.meta.url);
const meta = JSON.parse(readFileSync(metaPath, "utf8"));

const lines = new Map();
let frame = null;
let text = "";

const flush = () => {
  if (frame !== null && text.trim()) lines.set(frame, text.trim());
  frame = null;
  text = "";
};

for (const line of script.split(/\r?\n/)) {
  const heading = line.match(/^##\s+Line\s+\d+.*\(Frame\s+(\d+)\)/i);
  if (heading) {
    flush();
    frame = Number(heading[1]);
    continue;
  }
  if (frame === null || /^\s*\*\*/.test(line)) continue;
  const spoken = line.match(/^(?: {4,}|\t)(.+)$/);
  if (spoken) text += `${text ? " " : ""}${spoken[1].trim()}`;
}
flush();

for (const voice of meta.voices ?? []) {
  const spoken = lines.get(voice.frame);
  if (!spoken) continue;

  const tokens = spoken.split(/\s+/).filter(Boolean);
  const duration = Number(voice.duration_s) || 0;
  const startPad = Math.min(0.12, duration * 0.02);
  const endPad = Math.min(0.16, duration * 0.025);
  const gap = 0.035;
  const speakingWindow = Math.max(
    0.1,
    duration - startPad - endPad - gap * Math.max(0, tokens.length - 1),
  );
  const weights = tokens.map((token) =>
    Math.max(1, token.replace(/[^\p{L}\p{N}@]/gu, "").length ** 0.72),
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  let cursor = startPad;
  voice.words = tokens.map((token, index) => {
    const wordDuration = speakingWindow * (weights[index] / totalWeight);
    const start = Number(cursor.toFixed(3));
    const end = Number((cursor + wordDuration).toFixed(3));
    cursor += wordDuration + gap;
    return {
      id: `frame-${voice.frame}-word-${index}`,
      text: token,
      start,
      end,
    };
  });
}

writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
