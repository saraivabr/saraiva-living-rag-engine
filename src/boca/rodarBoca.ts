/**
 * Entrada de linha de comando da boca.
 *
 *   npm run boca              — o que a máquina postaria agora, e se pode
 *   npm run boca -- --em 2026-08-07T17:30:00Z
 *
 * Repare no que este comando NÃO faz: publicar. A boca monta e mostra; quem
 * aperta o botão para 62.989 pessoas é gente. Publicação automática é uma
 * decisão do Saraiva, não um efeito colateral de eu ter ligado o encanamento.
 */

import { decidirProximoPost } from './decidirPost.js';

function lerQuando(argumentos: string[]): string | undefined {
  const posicao = argumentos.indexOf('--em');
  return posicao >= 0 ? argumentos[posicao + 1] : new Date().toISOString();
}

async function principal(): Promise<void> {
  const proposta = await decidirProximoPost({ publicarEm: lerQuando(process.argv.slice(2)) });

  console.log('\n═══ O QUE A MEMÓRIA RESPONDEU ═══');
  console.log(proposta.origem.slice(0, 900));

  if (proposta.citacoes.length) {
    console.log('\n═══ FRASES DE CLIENTE QUE SUSTENTAM ═══');
    for (const citacao of proposta.citacoes) console.log(`  • ${citacao}`);
  }

  if (proposta.impedimento) {
    console.log(`\n⛔ BOCA CALADA: ${proposta.impedimento}`);
    process.exitCode = 1;
    return;
  }

  const { rascunho, politica } = proposta;
  if (!rascunho) return;

  console.log('\n═══ ROTEIRO DO REEL ═══');
  console.log(`gancho (${rascunho.hookScore.verdict}): ${rascunho.hook}`);
  for (const slide of rascunho.slides) {
    console.log(`  ${slide.n}. [${slide.role}] ${slide.text}`);
  }
  console.log(`\nlegenda (${rascunho.captionLength} caracteres):\n${rascunho.caption}`);
  console.log(`hashtags: ${rascunho.hashtags.join(' ')}`);
  console.log(`palavra de entrada: ${rascunho.ctaKeyword}`);

  for (const aviso of rascunho.warnings) console.log(`  ⚠ ${aviso}`);

  console.log('\n═══ POLÍTICA DE CONTEÚDO ═══');
  if (politica?.ok) {
    console.log('  liberado');
  } else {
    for (const violacao of politica?.violations || []) {
      console.log(`  ${violacao.severity === 'block' ? '⛔' : '⚠'} ${violacao.rule}: ${violacao.detail}`);
    }
  }
  if (politica?.unchecked.length) {
    console.log(`  não avaliado por falta de dado: ${politica.unchecked.join(', ')}`);
  }

  console.log('\nA boca monta o post. Publicar é decisão sua.');
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
