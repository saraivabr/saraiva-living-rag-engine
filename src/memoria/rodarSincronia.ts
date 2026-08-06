/**
 * Entrada de linha de comando do fio 1.
 *
 *   npm run memoria:sync              — manda o que chegou desde a última vez
 *   npm run memoria:sync -- --tudo    — recomeça do zero, ignorando a marca
 *   npm run memoria:sync -- --limite 50
 */

import { sincronizarConversasComCognee } from './sincronizarConversas.js';

function lerLimite(argumentos: string[]): number | undefined {
  const posicao = argumentos.indexOf('--limite');
  if (posicao < 0) return undefined;
  const valor = Number(argumentos[posicao + 1]);
  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

async function principal(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const resultado = await sincronizarConversasComCognee({
    tudo: argumentos.includes('--tudo'),
    limite: lerLimite(argumentos),
  });

  console.log(`conversas lidas   : ${resultado.lidas}`);
  console.log(`novas desde a marca: ${resultado.novas}`);
  console.log(`gravadas no Cognee : ${resultado.enviadas}`);
  console.log(`falhas             : ${resultado.falhas}`);
  console.log(`marca agora        : ${resultado.marca || '(nenhuma)'}`);

  if (resultado.falhas > 0) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
