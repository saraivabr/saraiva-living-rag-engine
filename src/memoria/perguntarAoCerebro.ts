/**
 * Fio 2 da máquina: o cérebro devolvendo decisão em vez de dado.
 *
 * O fio 1 enche o Cognee de conversas. Sozinho, isso é só um arquivo morto
 * mais bonito. O ciclo só fecha quando alguém PERGUNTA — e a pergunta precisa
 * ser sobre a próxima ação, não sobre o passado.
 *
 * Cada pergunta aqui existe porque uma decisão real depende dela hoje:
 *   - o que postar        → a boca da máquina está muda, é o maior buraco
 *   - o que vender        → o Kit não pode nascer da suposição do Saraiva
 *   - onde o funil vaza   → onde consertar antes de construir mais
 *   - quem levantou a mão → fila de atendimento humano
 */

import {
  abrirSessaoCognee,
  carregarConfigCognee,
  recordar,
  type ConfigCognee,
} from './cogneeClient.js';

const DATASET = 'instagram_saraiva';

export interface PerguntaDoCerebro {
  chave: string;
  titulo: string;
  pergunta: string;
}

export const PERGUNTAS: readonly PerguntaDoCerebro[] = Object.freeze([
  {
    chave: 'postar',
    titulo: 'O que postar agora',
    pergunta: 'Com base nas conversas reais do Instagram do Saraiva.AI, qual assunto '
      + 'as pessoas mais demonstraram querer resolver, com as palavras delas? '
      + 'Sugira o tema do próximo post e cite as frases que sustentam a sugestão.',
  },
  {
    chave: 'vender',
    titulo: 'O que vender',
    pergunta: 'Nas conversas do Instagram do Saraiva.AI, qual problema as pessoas '
      + 'descreveram DEPOIS de receber o prompt gratuito do site? '
      + 'Liste as frases literais sobre publicar, entregar ao cliente e cobrar.',
  },
  {
    chave: 'vazamento',
    titulo: 'Onde o funil vaza',
    pergunta: 'Em que etapa as conversas do Instagram do Saraiva.AI mais morrem, '
      + 'e o que as pessoas escreveram imediatamente antes de sumir?',
  },
  {
    chave: 'mao-levantada',
    titulo: 'Quem levantou a mão',
    pergunta: 'Quem respondeu o follow-up da segunda etapa no Instagram do '
      + 'Saraiva.AI, e o que cada uma dessas pessoas escreveu?',
  },
]);

export interface RespostaDoCerebro {
  chave: string;
  titulo: string;
  resposta: string;
  vazia: boolean;
}

/**
 * O Cognee responde "Got it." quando não encontra nada — uma resposta simpática
 * que parece sucesso. Sem marcar isso como vazio, um grafo sem dado passaria
 * por um grafo sábio.
 */
function pareceVazia(resposta: string): boolean {
  const limpa = resposta.replace(/^\[graph\]\s*/i, '').trim();
  if (limpa.length < 40) return true;
  return /^(got it|ok|entendi|no results?|nenhum resultado)\b/i.test(limpa);
}

export async function perguntarAoCerebro(
  chaves?: readonly string[],
  config?: ConfigCognee,
): Promise<RespostaDoCerebro[]> {
  const ajuste = config || await carregarConfigCognee();
  if (!ajuste) throw new Error('COGNEE_AUTH não configurado — sem credencial não há memória.');

  const selecionadas = chaves?.length
    ? PERGUNTAS.filter((p) => chaves.includes(p.chave))
    : PERGUNTAS;
  if (!selecionadas.length) {
    throw new Error(`pergunta desconhecida. Disponíveis: ${PERGUNTAS.map((p) => p.chave).join(', ')}`);
  }

  // Cérebro fora do ar não pode derrubar quem perguntou. A boca da máquina
  // depende desta função: se ela estourar, o comando morre com stack trace em
  // vez de dizer "não sei" — e "não sei" é a resposta certa quando não se sabe.
  let sessao: string;
  try {
    sessao = await abrirSessaoCognee(ajuste);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return selecionadas.map((pergunta) => ({
      chave: pergunta.chave,
      titulo: pergunta.titulo,
      resposta: `memória inacessível: ${motivo}`,
      vazia: true,
    }));
  }

  const respostas: RespostaDoCerebro[] = [];

  for (const pergunta of selecionadas) {
    try {
      const resposta = await recordar(ajuste, sessao, pergunta.pergunta, DATASET);
      respostas.push({
        chave: pergunta.chave,
        titulo: pergunta.titulo,
        resposta,
        vazia: pareceVazia(resposta),
      });
    } catch (erro) {
      respostas.push({
        chave: pergunta.chave,
        titulo: pergunta.titulo,
        resposta: `falhou: ${erro instanceof Error ? erro.message : erro}`,
        vazia: true,
      });
    }
  }

  return respostas;
}
