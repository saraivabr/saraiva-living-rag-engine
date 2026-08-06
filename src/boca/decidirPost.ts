/**
 * A boca da máquina: o cérebro decide o que dizer, e a política diz se pode.
 *
 * Até aqui a máquina tinha ouvido (responde comentário) e memória (Cognee).
 * Faltava a boca — e sem ela tudo depende de o Saraiva lembrar de postar. Um
 * post vivo alimentando 62.989 seguidores é um fio de cabelo segurando o
 * negócio inteiro.
 *
 * O caminho é curto de propósito:
 *
 *   Cognee diz o tema  →  buildCarousel monta  →  contentPolicy libera ou barra
 *
 * Nada aqui inventa assunto. Se a memória não souber responder, a boca fica
 * calada e diz por quê — que é infinitamente melhor do que postar chute para
 * sessenta mil pessoas.
 */

import { buildCarousel, type CarouselDraft, type CarouselSignal } from '../content/carouselBuilder.js';
import { evaluateContentPolicy, type ContentPolicyResult } from '../content/contentPolicy.js';
import { perguntarAoCerebro } from '../memoria/perguntarAoCerebro.js';
import type { ConfigCognee } from '../memoria/cogneeClient.js';

/** A palavra que a pessoa comenta para abrir a DM. É o gatilho da campanha viva. */
const PALAVRA_DE_ENTRADA = 'SARAIVA';

export interface PropostaDePost {
  /** O que a memória respondeu, cru — para o humano conferir a origem. */
  origem: string;
  /** As frases de cliente que sustentam o tema, se a memória citou alguma. */
  citacoes: string[];
  rascunho?: CarouselDraft;
  politica?: ContentPolicyResult;
  /** Por que a boca ficou calada, quando ficou. */
  impedimento?: string;
}

/**
 * O Cognee responde em prosa. Daí saem as frases entre aspas — que são o que
 * um cliente realmente escreveu — e a primeira frase útil, que vira manchete.
 */
export function extrairCitacoes(resposta: string): string[] {
  const encontradas = resposta.match(/["“]([^"”]{12,220})["”]/g) || [];
  return encontradas
    .map((c) => c.replace(/^["“]|["”]$/g, '').trim())
    .filter((c, i, todas) => c && todas.indexOf(c) === i);
}

export function extrairManchete(resposta: string): string {
  const limpa = resposta
    .replace(/^\[graph\]\s*/i, '')
    // O Cognee responde em markdown. Asterisco vazado vira gancho de Reel com
    // "**" no meio — foi exatamente o que saiu na primeira vez que a boca falou.
    .replace(/\*\*|__|`/g, '')
    .trim();
  const frases = limpa
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f
      .replace(/^[-*•\d.\s]+/, '')
      // O Cognee gosta de abrir com rótulo — "Resumo:", "Tema:", "Resposta:".
      // Rótulo não é manchete; virar gancho de Reel com ele soa a relatório.
      .replace(/^[A-Za-zÀ-ÿ]{3,12}:\s*/, '')
      .trim())
    // Frase curta demais é rótulo ("Resumo:"), longa demais não é manchete.
    .filter((f) => f.length >= 25 && f.length <= 140);
  return frases[0] || '';
}

/**
 * Os três passos do carrossel saem das próprias citações quando existem: é a
 * diferença entre ensinar o que o cliente pediu e ensinar o que eu achei.
 */
export function montarPassos(citacoes: string[], resposta: string): string[] {
  const dasCitacoes = citacoes.slice(0, 3).map((c) => `Responder: ${c}`);
  if (dasCitacoes.length >= 3) return dasCitacoes;

  const doTexto = resposta
    .split('\n')
    .map((l) => l.replace(/^[-*•\d.\s]+/, '').trim())
    .filter((l) => l.length >= 20 && l.length <= 160);

  return [...dasCitacoes, ...doTexto].slice(0, 3);
}

export interface OpcoesDaBoca {
  /** Instante da publicação pretendida, para a política julgar a janela. */
  publicarEm?: string;
  config?: ConfigCognee;
}

export async function decidirProximoPost(opcoes: OpcoesDaBoca = {}): Promise<PropostaDePost> {
  const [resposta] = await perguntarAoCerebro(['postar'], opcoes.config);

  if (!resposta || resposta.vazia) {
    return {
      origem: resposta?.resposta || '(sem resposta)',
      citacoes: [],
      impedimento: 'A memória não tem o que dizer ainda. Rode "npm run memoria:sync" antes.',
    };
  }

  const citacoes = extrairCitacoes(resposta.resposta);
  const manchete = extrairManchete(resposta.resposta);
  const passos = montarPassos(citacoes, resposta.resposta);

  if (!manchete) {
    return {
      origem: resposta.resposta,
      citacoes,
      impedimento: 'A memória respondeu, mas sem uma frase que sirva de manchete.',
    };
  }
  if (passos.length < 3) {
    // O carrossel exige três passos. Menos que isso vira manifesto, e
    // manifesto não converte — só soa bonito.
    return {
      origem: resposta.resposta,
      citacoes,
      impedimento: `A memória sustentou só ${passos.length} passo(s); o post precisa de 3.`,
    };
  }

  const sinal: CarouselSignal = {
    headline: manchete,
    fact: citacoes[0] || manchete,
    steps: passos,
    ctaKeyword: PALAVRA_DE_ENTRADA,
    source: 'Cognee — conversas reais do Instagram',
  };

  const rascunho = buildCarousel(sinal);

  // A máquina pontua o próprio gancho e, na primeira vez que falou, deu
  // "descartar" nele — e montou o post do mesmo jeito. Ter o julgamento e
  // ignorá-lo é pior que não julgar: dá aparência de crivo a coisa nenhuma.
  if (rascunho.hookScore.verdict === 'descartar') {
    return {
      origem: resposta.resposta,
      citacoes,
      rascunho,
      impedimento: `O próprio scorer reprovou o gancho ("${rascunho.hook}"). `
        + 'A memória tem o tema, mas ainda não tem uma frase que segure um Reel.',
    };
  }

  const politica = evaluateContentPolicy({
    // A política do @saraiva.ai só libera REELS enquanto o feed estático está
    // suspenso. O rascunho vira roteiro de Reel, não carrossel publicado.
    mediaProductType: 'REELS',
    publishAt: opcoes.publicarEm,
    caption: rascunho.caption,
    hashtags: rascunho.hashtags,
  });

  return { origem: resposta.resposta, citacoes, rascunho, politica };
}
