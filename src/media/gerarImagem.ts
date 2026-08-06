import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  generateMotorImages,
  type MotorImageFormat,
  type MotorImageQuality,
  type MotorImageSize,
} from './motorImages.js';

/**
 * Gera criativo pela API de imagens do Motor.
 *
 * Uso:
 *   npm run imagem -- "prompt aqui"
 *   npm run imagem -- "prompt" --saida creativos/story.png --tamanho 1024x1536 --n 2
 */

const AJUDA = `
Gera imagem pelo Motor (cx/gpt-5.5-image).

  npm run imagem -- "<prompt>" [opções]

  --saida <caminho>    arquivo de destino (padrão: criativos/<timestamp>.png)
  --n <1-4>            quantas imagens (padrão 1)
  --tamanho <valor>    auto | 1024x1024 | 1024x1536 | 1536x1024   (padrão auto)
  --qualidade <valor>  auto | low | medium | high                  (padrão auto)
  --formato <valor>    png | jpeg | webp                           (padrão png)
  --referencia <img>   foto de referência: o modelo mantém rosto e roupa dela

Story do Instagram é 9:16 — use --tamanho 1024x1536.
A referência precisa ser leve (~1024px, JPEG). Para reduzir:
  sips -Z 1024 -s format jpeg foto.png --out foto-ref.jpg
A credencial sai do Secrets Manager; nada de chave na linha de comando.
`.trim();

const COM_VALOR = new Set(['saida', 'n', 'tamanho', 'qualidade', 'formato', 'referencia']);

/** Separa o prompt (posicional) das opções, sem confundir o valor de uma flag. */
function parseArgs(argv: string[]): { prompt: string; flags: Map<string, string> } {
  const flags = new Map<string, string>();
  const soltos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]!;
    if (!item.startsWith('--')) {
      soltos.push(item);
      continue;
    }
    const nome = item.slice(2);
    if (COM_VALOR.has(nome)) {
      flags.set(nome, argv[i + 1] ?? '');
      i++;
    } else {
      flags.set(nome, 'true');
    }
  }
  return { prompt: soltos.join(' ').trim(), flags };
}

const { prompt, flags } = parseArgs(process.argv.slice(2));
const arg = (nome: string): string | undefined => flags.get(nome) || undefined;

async function main(): Promise<void> {
  if (!prompt || flags.has('help')) {
    console.log(AJUDA);
    process.exit(prompt ? 0 : 1);
  }

  const n = Math.min(4, Math.max(1, Number(arg('n') || 1)));
  const formato = (arg('formato') || 'png') as MotorImageFormat;
  const destino = resolve(process.cwd(), arg('saida')
    || `criativos/${new Date().toISOString().replace(/[:.]/g, '-')}.${formato}`);

  const refPath = arg('referencia');
  const referenceImage = refPath
    ? {
      bytes: await readFile(resolve(process.cwd(), refPath)),
      mimeType: refPath.toLowerCase().endsWith('.png')
        ? 'image/png' as const
        : 'image/jpeg' as const,
    }
    : undefined;

  console.log(`Gerando ${n} imagem(ns)${referenceImage ? ' com referência' : ''}…`);
  const inicio = Date.now();

  const imagens = await generateMotorImages({
    prompt,
    n,
    size: (arg('tamanho') || 'auto') as MotorImageSize,
    quality: (arg('qualidade') || 'auto') as MotorImageQuality,
    outputFormat: formato,
    referenceImage,
  }, {
    onProgress: (stage) => process.stdout.write(`  ${stage}\r`),
  });

  await mkdir(dirname(destino), { recursive: true });
  for (const [i, img] of imagens.entries()) {
    const caminho = imagens.length === 1
      ? destino
      : destino.replace(/(\.[a-z]+)$/, `-${i + 1}$1`);
    await writeFile(caminho, img.bytes);
    const dim = img.width ? ` ${img.width}x${img.height}` : '';
    console.log(`\n  ${caminho}  (${(img.bytes.byteLength / 1024 / 1024).toFixed(1)} MB${dim})`);
  }
  console.log(`\nPronto em ${((Date.now() - inicio) / 1000).toFixed(0)}s.`);
}

main().catch((error: unknown) => {
  console.error('Falhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
