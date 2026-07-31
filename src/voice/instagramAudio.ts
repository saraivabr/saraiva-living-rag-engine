import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ffmpegPath = join(
  process.cwd(),
  'node_modules',
  '@ffmpeg-installer',
  'linux-x64',
  'ffmpeg',
);

export interface InstagramAudio {
  bytes: Uint8Array;
  contentType: 'audio/mp4';
  filename: 'saraiva.m4a';
}

export async function convertMp3ToInstagramAudio(bytes: Uint8Array): Promise<InstagramAudio> {
  if (!bytes.byteLength) throw new Error('instagram_audio_source_empty');
  const directory = await mkdtemp(join(tmpdir(), 'saraiva-audio-'));
  const sourcePath = join(directory, 'source.mp3');
  const outputPath = join(directory, 'saraiva.m4a');
  try {
    await writeFile(sourcePath, bytes);
    await runFfmpeg(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', sourcePath,
      '-vn', '-ac', '1', '-ar', '44100',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ]);
    const converted = await readFile(outputPath);
    if (!converted.byteLength || converted.byteLength > 25 * 1024 * 1024) {
      throw new Error('instagram_audio_output_size_invalid');
    }
    return {
      bytes: new Uint8Array(converted),
      contentType: 'audio/mp4',
      filename: 'saraiva.m4a',
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runFfmpeg(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errorOutput = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (errorOutput.length < 1_000) errorOutput += chunk.toString('utf8');
    });
    child.once('error', () => reject(new Error('instagram_audio_encoder_failed')));
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`instagram_audio_encoder_failed:${code}:${sanitizeEncoderError(errorOutput)}`));
    });
  });
}

function sanitizeEncoderError(value: string): string {
  return value
    .replace(/[^\w .,:-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}
