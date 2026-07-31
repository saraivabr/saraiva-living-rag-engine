#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const engine =
  "/Users/saraiva/.agents/skills/media-use/audio/scripts/audio.mjs";
const args = [engine, ...process.argv.slice(2), "--lang", "pt-br"];
const result = spawnSync(process.execPath, args, { stdio: "inherit" });

process.exit(result.status ?? 1);
