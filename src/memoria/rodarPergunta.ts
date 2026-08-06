/**
 * Entrada de linha de comando do fio 2.
 *
 *   npm run memoria:perguntar              — as quatro perguntas
 *   npm run memoria:perguntar -- postar    — só uma
 */

import { PERGUNTAS, perguntarAoCerebro } from './perguntarAoCerebro.js';

async function principal(): Promise<void> {
  const chaves = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const respostas = await perguntarAoCerebro(chaves.length ? chaves : undefined);

  for (const resposta of respostas) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  ${resposta.titulo.toUpperCase()}`);
    console.log('═'.repeat(70));
    console.log(resposta.vazia
      ? `(o cérebro não sabe responder isso ainda — rode "npm run memoria:sync")\n${resposta.resposta}`
      : resposta.resposta);
  }

  const vazias = respostas.filter((r) => r.vazia).length;
  console.log(`\n${respostas.length - vazias}/${respostas.length} perguntas com resposta.`);
  if (vazias === respostas.length) process.exitCode = 1;
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  console.error(`perguntas disponíveis: ${PERGUNTAS.map((p) => p.chave).join(', ')}`);
  process.exit(1);
});
