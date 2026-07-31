import { config } from './config.js';
import { runCycle } from './responder.js';

/**
 * Entrypoint. Dois modos:
 *   --once  : roda um único ciclo e encerra (bom para cron/testes)
 *   (padrão): roda em loop infinito, com intervalo de POLL_INTERVAL_SECONDS
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const runOnce = process.argv.includes('--once');

  if (!config.behavior.enabled) {
    console.log('⏸ Respondedor desativado (RESPONDER_ENABLED=false). Saindo sem fazer nada.');
    if (runOnce) return;
    // Keep process alive but inert if someone starts it in daemon mode
    await new Promise(() => {});
    return;
  }

  if (runOnce) {
    await runCycle();
    return;
  }

  console.log(
    `🤖 Respondedor de Instagram rodando. Intervalo: ${config.behavior.pollIntervalSeconds}s. Ctrl+C para parar.`,
  );

  // Loop resiliente: um erro em um ciclo não derruba o processo.
  for (;;) {
    try {
      await runCycle();
    } catch (err) {
      console.error(`✖ Erro no ciclo: ${(err as Error).message}`);
    }
    await sleep(config.behavior.pollIntervalSeconds * 1000);
  }
}

main().catch((err) => {
  console.error(`✖ Falha fatal: ${(err as Error).message}`);
  process.exit(1);
});
