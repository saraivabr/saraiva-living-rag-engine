import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

/**
 * Invoca o Claude Code CLI em modo headless (`claude -p`) usando a assinatura
 * logada no servidor (via `claude setup-token`). Não consome créditos de API.
 *
 * Retorna o texto puro produzido pelo modelo.
 */
export async function runClaudeCli(systemPrompt: string, userPrompt: string): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  const args = [
    '-p',
    fullPrompt,
    '--model',
    config.ai.model,
    '--output-format',
    'json',
  ];

  // 60s é folgado para uma resposta curta; evita travar o ciclo se algo emperrar.
  const { stdout } = await execFileAsync('claude', args, {
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
  });

  // `--output-format json` retorna um envelope; o texto fica em `.result`.
  try {
    const parsed = JSON.parse(stdout) as { result?: string };
    return (parsed.result ?? '').trim();
  } catch {
    // Se vier texto puro (versões/configs diferentes), usa direto.
    return stdout.trim();
  }
}
