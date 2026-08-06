/**
 * Fio 1 da máquina: as conversas do Instagram alimentando o cérebro.
 *
 * O Cognee é um grafo de conhecimento, não um depósito. Despejar JSON cru nele
 * gera um grafo de chaves e valores que não responde nada. Então aqui cada
 * conversa vira NARRATIVA — uma frase que diz quem apareceu, de onde veio, o
 * que escolheu, o que escreveu com as próprias mãos e onde parou.
 *
 * O que a máquina precisa lembrar, em ordem de valor:
 *   1. o que a pessoa ESCREVEU à mão (é onde mora a dor de verdade)
 *   2. onde ela morreu no funil (é onde mora o conserto)
 *   3. o que ela escolheu quando teve opção (é onde mora a oferta)
 * Texto de botão é ruído: a pessoa não escolheu as palavras, nós escolhemos.
 */

import { DynamoDBClient, QueryCommand, PutItemCommand, GetItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  abrirSessaoCognee,
  carregarConfigCognee,
  lembrar,
  type ConfigCognee,
} from './cogneeClient.js';
import { CAMPANHAS } from '../catalogo/campanhas.js';

const tabela = process.env.DYNAMODB_TABLE?.trim() || '';
const conta = process.env.STORE_ACCOUNT?.trim() || process.env.IG_USER_ID?.trim() || 'default';
const dynamo = new DynamoDBClient({});

const CHAVE_MARCA = 'cognee-sync';
const DATASET = 'instagram_saraiva';

interface Interacao {
  at?: string;
  direction?: 'in' | 'out';
  text?: string;
}

interface Conversa {
  senderId?: string;
  username?: string;
  postId?: string;
  updatedAt?: string;
  interactions?: Interacao[];
  instagramFlow?: Record<string, unknown>;
  socialSelling?: { stage?: string; score?: number; summary?: string; updatedAt?: string };
}

/**
 * Palavras que a pessoa digitou porque NÓS mandamos digitar.
 *
 * O comentário que dispara a automação é a palavra-gatilho da campanha —
 * "saraiva" aparece 996 vezes em 1.308 conversas. Ela chega como texto livre e
 * passa por qualquer filtro ingênuo de "escreveu à mão", inundando o grafo com
 * mil cópias da mesma coisa. Vem do catálogo para não sair de sincronia quando
 * uma campanha nova nascer.
 */
const GATILHOS = new Set(
  CAMPANHAS.flatMap((campanha) => campanha.gatilhos)
    .map((g) => g.toLowerCase())
    // Variações que as pessoas digitam do mesmo gatilho.
    .concat(['saraíva', 'ligação', 'ligacao', 'voz', 'claude', 'repos', '@saraiva.ai']),
);

/**
 * Texto de botão vem em CAIXA ALTA porque nós escrevemos assim nos payloads.
 * O que a pessoa digita vem misturado. Fora isso, o gatilho não conta: ela
 * não escolheu aquela palavra, nós escolhemos por ela.
 */
function ehEscritoAMao(texto: string): boolean {
  const limpo = texto.trim();
  if (limpo.length < 3) return false;
  if (limpo === limpo.toUpperCase()) return false;
  const normalizado = limpo.toLowerCase().replace(/[.!?…]+$/, '');
  if (GATILHOS.has(normalizado)) return false;
  return true;
}

function frasesEscritas(conversa: Conversa): string[] {
  return (conversa.interactions || [])
    .filter((i) => i.direction === 'in')
    .map((i) => (i.text || '').trim())
    .filter(ehEscritoAMao);
}

/**
 * Quando esta conversa mexeu pela última vez.
 *
 * `updatedAt` no topo só existe em 245 dos 1.308 registros — o campo nasceu
 * depois. Confiar só nele faria a sincronia pular 1.045 conversas em silêncio,
 * que é o pior tipo de falha: a memória pareceria completa e não estaria.
 * Descemos até a última interação, que sempre carrega data.
 */
export function momentoDaConversa(conversa: Conversa): string {
  const candidatos = [
    conversa.updatedAt,
    conversa.instagramFlow?.updatedAt as string | undefined,
    conversa.socialSelling?.updatedAt,
    ...(conversa.interactions || []).map((i) => i.at),
  ].filter((v): v is string => Boolean(v));
  return candidatos.length ? candidatos.sort().at(-1)! : '';
}

function escolhas(conversa: Conversa): string[] {
  return (conversa.interactions || [])
    .filter((i) => i.direction === 'in')
    .map((i) => (i.text || '').trim())
    .filter((t) => t.length >= 3 && t === t.toUpperCase());
}

/**
 * Conversa que nós mesmos criamos testando o sistema.
 *
 * São só 4 registros — mas são os únicos que escreveram frases longas, então
 * dominam qualquer pergunta que o cérebro responda. A primeira vez que a boca
 * falou, ela propôs um post inteiro baseado em "@Teste Codex". Dado de teste
 * na memória de produção não é ruído: é mentira com aparência de evidência.
 */
export function ehRegistroDeTeste(conversa: Conversa): boolean {
  const alvo = `${conversa.username || ''} ${conversa.senderId || ''}`;
  return /\b(teste|test|validacao|validação|codex|debug|smoke)\b/i.test(alvo);
}

/** Uma conversa vira um parágrafo que o grafo consegue ligar a outros. */
export function narrarConversa(conversa: Conversa): string | undefined {
  if (ehRegistroDeTeste(conversa)) return undefined;

  const escritas = frasesEscritas(conversa);
  const fluxo = conversa.instagramFlow || {};
  const etapa = (fluxo.stage as string) || conversa.socialSelling?.stage || 'sem etapa';
  const entregue = Boolean(fluxo.promptDeliveredAt);
  const ofertado = Boolean(fluxo.productOfferedAt);
  const abriu = Boolean(fluxo.productOpenedAt);
  const respondeuFollowUp = Boolean(fluxo.followUpRepliedAt);

  // Sem fala escrita e sem sinal de compra, a conversa não ensina nada que a
  // contagem agregada já não diga. Mandar assim só engorda o grafo.
  if (!escritas.length && !abriu && !respondeuFollowUp) return undefined;

  const quem = conversa.username ? `@${conversa.username}` : 'um seguidor';
  const partes = [
    `${quem} veio do post ${conversa.postId || 'desconhecido'} do Instagram do Saraiva.AI.`,
  ];

  const escolhido = escolhas(conversa);
  if (escolhido.length) partes.push(`Escolheu: ${escolhido.join(' → ')}.`);

  if (escritas.length) {
    partes.push(`Escreveu com as próprias palavras: ${escritas.map((f) => `"${f}"`).join(' ')}`);
  }

  partes.push(entregue ? 'Recebeu o prompt gratuito do site.' : 'Não chegou a receber o prompt.');
  if (ofertado) partes.push(abriu ? 'Recebeu a oferta e abriu a página.' : 'Recebeu a oferta e não abriu.');
  if (respondeuFollowUp) partes.push('Respondeu o follow-up da segunda etapa — levantou a mão.');
  partes.push(`Parou na etapa "${etapa}".`);

  return partes.join(' ');
}

/**
 * O formato do funil não cabe em conversa individual: só aparece somando. Sem
 * este resumo o grafo sabe de gente, mas não sabe onde o dinheiro vaza.
 */
export function narrarFunil(conversas: Conversa[]): string {
  const porPost = new Map<string, number>();
  let entregues = 0;
  let ofertados = 0;
  let abriram = 0;
  let escreveram = 0;
  const escolhasContadas = new Map<string, number>();

  for (const conversa of conversas) {
    const post = conversa.postId || 'desconhecido';
    porPost.set(post, (porPost.get(post) || 0) + 1);
    const fluxo = conversa.instagramFlow || {};
    if (fluxo.promptDeliveredAt) entregues += 1;
    if (fluxo.productOfferedAt) ofertados += 1;
    if (fluxo.productOpenedAt) abriram += 1;
    if (frasesEscritas(conversa).length) escreveram += 1;
    for (const escolha of escolhas(conversa)) {
      escolhasContadas.set(escolha, (escolhasContadas.get(escolha) || 0) + 1);
    }
  }

  const topPosts = [...porPost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topEscolhas = [...escolhasContadas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return [
    `Formato do funil do Instagram do Saraiva.AI em ${new Date().toISOString().slice(0, 10)}:`,
    `${conversas.length} conversas no total.`,
    `${entregues} receberam o prompt gratuito, ${ofertados} receberam a oferta, ${abriram} abriram a página de compra.`,
    `Apenas ${escreveram} pessoas escreveram alguma frase própria — o resto só apertou botão.`,
    `Posts que mais trouxeram gente: ${topPosts.map(([p, n]) => `${p} (${n})`).join(', ')}.`,
    `Escolhas mais apertadas: ${topEscolhas.map(([e, n]) => `${e} (${n})`).join(', ')}.`,
  ].join(' ');
}

async function lerMarca(): Promise<string> {
  if (!tabela) return '';
  const resposta = await dynamo.send(new GetItemCommand({
    TableName: tabela,
    Key: { pk: { S: `${conta}#${CHAVE_MARCA}` }, sk: { S: 'ultima' } },
  }));
  return resposta.Item?.updatedAt?.S || '';
}

async function gravarMarca(valor: string): Promise<void> {
  if (!tabela || !valor) return;
  await dynamo.send(new PutItemCommand({
    TableName: tabela,
    Item: {
      pk: { S: `${conta}#${CHAVE_MARCA}` },
      sk: { S: 'ultima' },
      updatedAt: { S: valor },
    },
  }));
}

async function carregarConversas(): Promise<Conversa[]> {
  const conversas: Conversa[] = [];
  let cursor: Record<string, AttributeValue> | undefined;
  do {
    const resposta = await dynamo.send(new QueryCommand({
      TableName: tabela,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': { S: `${conta}#lead-context` } },
      ExclusiveStartKey: cursor,
    }));
    for (const item of resposta.Items || []) {
      const bruto = item.data?.S;
      if (!bruto) continue;
      try {
        conversas.push(JSON.parse(bruto) as Conversa);
      } catch {
        // Um registro corrompido não pode derrubar a sincronia inteira.
      }
    }
    cursor = resposta.LastEvaluatedKey;
  } while (cursor);
  return conversas;
}

export interface ResultadoSincronia {
  lidas: number;
  novas: number;
  enviadas: number;
  falhas: number;
  marca: string;
}

export async function sincronizarConversasComCognee(
  opcoes: { limite?: number; tudo?: boolean; config?: ConfigCognee } = {},
): Promise<ResultadoSincronia> {
  const config = opcoes.config || await carregarConfigCognee();
  if (!config) throw new Error('COGNEE_AUTH não configurado — sem credencial não há memória.');
  if (!tabela) throw new Error('DYNAMODB_TABLE não configurado.');

  const marcaAnterior = opcoes.tudo ? '' : await lerMarca();
  const conversas = await carregarConversas();

  const novas = conversas
    .map((conversa) => ({ conversa, momento: momentoDaConversa(conversa) }))
    // Sem data não dá para ordenar nem marcar posição; entram só no recomeço
    // do zero, onde a marca não é usada para nada.
    .filter(({ momento }) => (momento ? momento > marcaAnterior : opcoes.tudo === true))
    .sort((a, b) => a.momento.localeCompare(b.momento));

  const recorte = opcoes.limite ? novas.slice(0, opcoes.limite) : novas;
  const sessao = await abrirSessaoCognee(config);

  let enviadas = 0;
  let falhas = 0;
  let ultimaGravada = marcaAnterior;

  for (const { conversa, momento } of recorte) {
    const narrativa = narrarConversa(conversa);
    if (narrativa) {
      try {
        await lembrar(config, sessao, narrativa, DATASET);
        enviadas += 1;
      } catch (erro) {
        falhas += 1;
        console.error('falha ao gravar conversa no Cognee:', erro instanceof Error ? erro.message : erro);
        // A marca não avança além de um item que falhou: assim a próxima
        // execução tenta de novo em vez de pular a conversa para sempre.
        break;
      }
    }
    ultimaGravada = momento || ultimaGravada;
  }

  // O retrato do funil só faz sentido sobre a base inteira, não sobre o lote.
  if (enviadas > 0 || opcoes.tudo) {
    try {
      await lembrar(config, sessao, narrarFunil(conversas), DATASET);
    } catch (erro) {
      falhas += 1;
      console.error('falha ao gravar o retrato do funil:', erro instanceof Error ? erro.message : erro);
    }
  }

  await gravarMarca(ultimaGravada);

  return {
    lidas: conversas.length,
    novas: novas.length,
    enviadas,
    falhas,
    marca: ultimaGravada,
  };
}
