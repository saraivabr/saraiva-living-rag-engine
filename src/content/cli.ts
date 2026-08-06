#!/usr/bin/env tsx
/**
 * Esteira de pauta em linha de comando.
 *
 *   cat pesquisa.json | tsx src/content/cli.ts --top 5
 *   tsx src/content/cli.ts --file pesquisa.json --emit json
 *
 * Le a saida de `last30days --emit=json` (ou qualquer JSON com titulos),
 * ranqueia pelo formato de gancho que funciona nesta conta e imprime as pautas
 * prontas para virar carrossel.
 */

import { readFileSync } from 'node:fs';
import { ingestFindings, rankPautas, type RankedPauta } from './pipeline.js';

interface Options {
  file?: string;
  top: number;
  emit: 'md' | 'json';
  minScore: number;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const raw = options.file ? readFileSync(options.file, 'utf8') : await readStdin();
  if (!raw.trim()) {
    process.stderr.write('nada na entrada: passe --file ou envie JSON por stdin\n');
    process.exitCode = 1;
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write('entrada nao e JSON valido\n');
    process.exitCode = 1;
    return;
  }

  const findings = ingestFindings(payload);
  const ranked = rankPautas(findings).filter((p) => p.hookScore.total >= options.minScore);
  const selected = ranked.slice(0, options.top);

  if (options.emit === 'json') {
    process.stdout.write(`${JSON.stringify({ total: findings.length, selected }, null, 2)}\n`);
    return;
  }
  process.stdout.write(renderMarkdown(findings.length, ranked.length, selected));
}

function renderMarkdown(total: number, aprovadas: number, pautas: RankedPauta[]): string {
  const lines = [
    `# Radar de pauta`,
    '',
    `achados: ${total} · passaram no filtro de gancho: ${aprovadas} · selecionadas: ${pautas.length}`,
    '',
  ];
  if (!pautas.length) {
    lines.push('Nenhuma pauta passou. Baixe --min-score ou rode outra consulta.', '');
    return lines.join('\n');
  }
  for (const [index, pauta] of pautas.entries()) {
    lines.push(
      `## ${index + 1}. ${pauta.headline}`,
      '',
      `- prioridade **${pauta.priority}** · gancho **${pauta.hookScore.total}** (${pauta.hookScore.verdict})`,
      `- fonte: ${pauta.source ?? '—'}${pauta.engagement ? ` · tracao ${pauta.engagement}` : ''}`,
      pauta.url ? `- ${pauta.url}` : '',
      '',
      ...pauta.hookScore.reasons.map((reason) => `  - ${reason}`),
      '',
      '**Para virar carrossel, preencha:** o fato em uma frase · quem perde · 3 passos concretos · palavra do CTA',
      '',
    );
  }
  return lines.filter((line) => line !== undefined).join('\n');
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { top: 5, emit: 'md', minScore: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') options.file = argv[++i];
    else if (arg === '--top') options.top = Number.parseInt(argv[++i] ?? '5', 10) || 5;
    else if (arg === '--emit') options.emit = argv[++i] === 'json' ? 'json' : 'md';
    else if (arg === '--min-score') options.minScore = Number.parseInt(argv[++i] ?? '20', 10) || 0;
  }
  return options;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
