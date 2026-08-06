/**
 * O ciclo da memória rodando SOZINHO, na nuvem.
 *
 * Tudo que foi construído até aqui só andava com o Saraiva sentado no terminal
 * — o que é o contrário de máquina autônoma. Este módulo pendura o ciclo no
 * Lambda que já acorda de minuto em minuto e joga a resposta no Airtable, que
 * é onde ele já olha pelo celular.
 *
 *   EventBridge (já existe) → Lambda → sincroniza → pergunta → Airtable
 *
 * A frequência é deliberadamente baixa. O cérebro não fica mais sábio sendo
 * consultado de minuto em minuto: fica caro e ruidoso.
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { PERGUNTAS, perguntarAoCerebro } from './perguntarAoCerebro.js';
import { sincronizarConversasComCognee } from './sincronizarConversas.js';

const tabela = process.env.DYNAMODB_TABLE?.trim() || '';
const conta = process.env.STORE_ACCOUNT?.trim() || process.env.IG_USER_ID?.trim() || 'default';
const dynamo = new DynamoDBClient({});

const CHAVE_CICLO = 'cognee-ciclo';
/** Uma vez a cada 6 horas. O funil recebe ~20 pessoas por dia; mais que isso é desperdício. */
const INTERVALO_MS = 6 * 60 * 60 * 1_000;

/**
 * O Lambda morre em 180 segundos — e a primeira versão deste ciclo morreu
 * exatamente assim, tentando gravar 40 conversas e fazer 4 perguntas numa
 * tacada só. Cada chamada ao Cognee leva segundos; a conta nunca fechava.
 *
 * O conserto não é aumentar o tempo do Lambda: é aceitar que ele acorda de
 * minuto em minuto e fatiar o trabalho. Cada rodada faz o que cabe no
 * orçamento, salva onde parou e devolve o resto para a próxima.
 */
const ORCAMENTO_MS = 120_000;
const LOTE = 6;

export interface ResultadoCiclo {
  ok: boolean;
  pulou?: string;
  sincronizadas?: number;
  respostas?: number;
  finishedAt: string;
}

async function ultimaRodada(): Promise<number> {
  if (!tabela) return 0;
  const resposta = await dynamo.send(new GetItemCommand({
    TableName: tabela,
    Key: { pk: { S: `${conta}#${CHAVE_CICLO}` }, sk: { S: 'ultima' } },
  }));
  return Number(resposta.Item?.emMs?.N || 0);
}

async function marcarRodada(agora: number): Promise<void> {
  if (!tabela) return;
  await dynamo.send(new PutItemCommand({
    TableName: tabela,
    Item: {
      pk: { S: `${conta}#${CHAVE_CICLO}` },
      sk: { S: 'ultima' },
      emMs: { N: String(agora) },
      updatedAt: { S: new Date(agora).toISOString() },
    },
  }));
}

/**
 * Roda o ciclo inteiro se já passou tempo suficiente.
 *
 * `forcar` existe para o Saraiva conseguir disparar na hora pelo celular, sem
 * esperar a janela — porque "só amanhã" mata a vontade de olhar.
 */
export async function rodarCicloDaMemoria(
  opcoes: { forcar?: boolean; agora?: number } = {},
): Promise<ResultadoCiclo> {
  const agora = opcoes.agora ?? Date.now();
  const anterior = await ultimaRodada();

  if (!opcoes.forcar && anterior && agora - anterior < INTERVALO_MS) {
    const faltamMin = Math.ceil((INTERVALO_MS - (agora - anterior)) / 60_000);
    return { ok: true, pulou: `próxima rodada em ${faltamMin} min`, finishedAt: new Date(agora).toISOString() };
  }

  // A marca sobe ANTES do trabalho. O Lambda acorda a cada minuto; se ela
  // subisse depois, uma rodada lenta seria disparada de novo em paralelo.
  await marcarRodada(agora);

  const comecou = Date.now();
  const sincronia = await sincronizarConversasComCognee({ limite: LOTE });

  // Uma pergunta por rodada, girando. As quatro se completam em quatro
  // rodadas — e nenhuma delas arrisca estourar o relógio do Lambda.
  const indice = Math.floor(agora / INTERVALO_MS) % PERGUNTAS.length;
  const escolhida = PERGUNTAS[indice]!;

  if (Date.now() - comecou > ORCAMENTO_MS) {
    return {
      ok: true,
      pulou: 'orçamento de tempo gasto na sincronia; a pergunta fica para a próxima rodada',
      sincronizadas: sincronia.enviadas,
      finishedAt: new Date().toISOString(),
    };
  }

  const [resposta] = await perguntarAoCerebro([escolhida.chave]);

  // A resposta NÃO é guardada em lugar nenhum, de propósito.
  //
  // Ela já existe no Cognee — copiá-la para o Airtable criaria um décimo
  // segundo lugar onde a mesma informação mora, e cada cópia é mais um ponto
  // que sai de sincronia sem avisar. Quem quiser ler pergunta ao cérebro.
  return {
    ok: true,
    sincronizadas: sincronia.enviadas,
    respostas: resposta && !resposta.vazia ? 1 : 0,
    finishedAt: new Date().toISOString(),
  };
}
