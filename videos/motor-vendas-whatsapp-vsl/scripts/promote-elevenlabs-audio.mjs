#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentPath = new URL("../audio_meta.json", import.meta.url);
const elevenLabsPath = new URL("../audio_meta_elevenlabs.json", import.meta.url);
const temporaryPath = new URL("../.audio_meta.json.tmp", import.meta.url);
const projectDirectory = fileURLToPath(new URL("..", import.meta.url));

const current = JSON.parse(readFileSync(currentPath, "utf8"));
const elevenLabs = JSON.parse(readFileSync(elevenLabsPath, "utf8"));

if (!Array.isArray(elevenLabs.voices) || elevenLabs.voices.length !== 8) {
  throw new Error("Expected eight ElevenLabs voice segments");
}

const expectedFrames = Array.from({ length: 8 }, (_, index) => index + 1);
const frames = elevenLabs.voices.map((voice) => Number(voice.frame));
if (frames.some((frame, index) => frame !== expectedFrames[index])) {
  throw new Error("ElevenLabs voice segments must cover frames 1 through 8 in order");
}

for (const voice of elevenLabs.voices) {
  const duration = Number(voice.duration_s);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid duration for frame ${voice.frame}`);
  }
  if (
    typeof voice.path !== "string" ||
    !existsSync(resolve(projectDirectory, voice.path))
  ) {
    throw new Error(`Missing ElevenLabs audio for frame ${voice.frame}`);
  }
  if (!Array.isArray(voice.words) || voice.words.length === 0) {
    throw new Error(`Missing word timings for frame ${voice.frame}`);
  }
  let previousEnd = 0;
  for (const word of voice.words) {
    const start = Number(word.start);
    const end = Number(word.end);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < previousEnd ||
      end < start ||
      end > duration + 0.5
    ) {
      throw new Error(`Invalid word timings for frame ${voice.frame}`);
    }
    previousEnd = end;
  }
}

const total = elevenLabs.voices.reduce(
  (sum, voice) => sum + Number(voice.duration_s),
  0,
);
if (total < 60 || total > 90) {
  throw new Error(`Unexpected ElevenLabs narration duration: ${total.toFixed(3)}s`);
}

const promoted = {
  bgm: current.bgm ?? null,
  voices: elevenLabs.voices,
  sfx: Array.isArray(current.sfx) ? current.sfx : [],
};

writeFileSync(temporaryPath, `${JSON.stringify(promoted, null, 2)}\n`);
renameSync(temporaryPath, currentPath);

console.log(
  `Promoted ${promoted.voices.length} ElevenLabs segments (${total.toFixed(3)}s) and preserved ${promoted.sfx.length} SFX.`,
);
