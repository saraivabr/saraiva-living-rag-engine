/**
 * Cliente HTTP do Cognee — o cérebro de memória em memoria.saraiva.ai.
 *
 * O Cognee fala MCP sobre HTTP com streaming de eventos: cada resposta chega
 * como linhas `data: {...}` em vez de um JSON único. E toda chamada exige uma
 * sessão negociada antes, que expira sozinha. Este módulo esconde as duas
 * chatices para que o resto do código só chame `lembrar()` e `recordar()`.
 */

const URL_PADRAO = 'https://memoria.saraiva.ai/mcp';
const TIMEOUT_MS = 180_000;

export interface ConfigCognee {
  url: string;
  autorizacao: string;
}

/**
 * A credencial vem do ambiente. Não lemos ~/.claude.json de propósito: aquele
 * arquivo é da máquina do Saraiva e este código roda em Lambda e em CI.
 */
export function lerConfigCognee(): ConfigCognee | undefined {
  const autorizacao = process.env.COGNEE_AUTH?.trim();
  if (!autorizacao) return undefined;
  return {
    url: process.env.COGNEE_URL?.trim() || URL_PADRAO,
    autorizacao,
  };
}

let credencialEmCache: ConfigCognee | undefined;

/**
 * No Lambda a credencial mora no Secrets Manager, não em variável de ambiente.
 *
 * Duas razões concretas: o teto de 4KB das variáveis já está em 2,8KB, e foi
 * exatamente uma variável de ambiente truncada que derrubou a automação por 26
 * horas hoje mais cedo. Segredo em env var deste projeto já mordeu uma vez.
 */
export async function carregarConfigCognee(): Promise<ConfigCognee | undefined> {
  const doAmbiente = lerConfigCognee();
  if (doAmbiente) return doAmbiente;
  if (credencialEmCache) return credencialEmCache;

  const secretId = process.env.COGNEE_SECRET_ID?.trim();
  if (!secretId) return undefined;

  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const cliente = new SecretsManagerClient({});
  const resposta = await cliente.send(new GetSecretValueCommand({ SecretId: secretId }));
  const bruto = resposta.SecretString?.trim();
  if (!bruto) return undefined;

  const dados = JSON.parse(bruto) as { autorizacao?: string; url?: string };
  if (!dados.autorizacao) return undefined;

  credencialEmCache = {
    url: dados.url?.trim() || URL_PADRAO,
    autorizacao: dados.autorizacao.trim(),
  };
  return credencialEmCache;
}

interface RespostaMcp {
  error?: { code?: number; message?: string };
  result?: { content?: Array<{ text?: string }> };
}

/** O corpo vem como Server-Sent Events; cada linha `data:` é um JSON-RPC. */
function extrairEventos(bruto: string): RespostaMcp[] {
  return bruto
    .split('\n')
    .map((linha) => linha.replace(/^data:\s*/, '').trim())
    .filter((linha) => linha.startsWith('{'))
    .flatMap((linha) => {
      try {
        return [JSON.parse(linha) as RespostaMcp];
      } catch {
        return [];
      }
    });
}

async function postar(
  config: ConfigCognee,
  corpo: unknown,
  sessao?: string,
): Promise<Response> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    return await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: config.autorizacao,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessao ? { 'mcp-session-id': sessao } : {}),
      },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Abre uma sessão. O Cognee devolve o id num cabeçalho e só aceita chamadas
 * depois do aviso `notifications/initialized` — pular esse aviso faz toda
 * chamada seguinte voltar vazia, sem erro, que é o pior tipo de falha.
 */
export async function abrirSessaoCognee(config: ConfigCognee): Promise<string> {
  const resposta = await postar(config, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'respondedor-instagram', version: '1' },
    },
  });
  const sessao = resposta.headers.get('mcp-session-id');
  if (!sessao) throw new Error('Cognee não devolveu mcp-session-id');
  await resposta.text();
  await postar(config, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessao);
  return sessao;
}

export async function chamarFerramentaCognee(
  config: ConfigCognee,
  sessao: string,
  ferramenta: string,
  argumentos: Record<string, unknown> = {},
): Promise<string> {
  const resposta = await postar(config, {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: ferramenta, arguments: argumentos },
  }, sessao);

  const eventos = extrairEventos(await resposta.text());
  const falha = eventos.find((evento) => evento.error);
  if (falha?.error) {
    throw new Error(`Cognee recusou ${ferramenta}: ${falha.error.message || falha.error.code}`);
  }
  return eventos
    .flatMap((evento) => evento.result?.content || [])
    .map((parte) => parte.text || '')
    .join('\n')
    .trim();
}

/** Grava um fato na memória. */
export async function lembrar(
  config: ConfigCognee,
  sessao: string,
  texto: string,
  dataset?: string,
): Promise<string> {
  return chamarFerramentaCognee(config, sessao, 'remember', {
    data: texto,
    ...(dataset ? { dataset_name: dataset } : {}),
  });
}

/** Pergunta à memória. */
export async function recordar(
  config: ConfigCognee,
  sessao: string,
  pergunta: string,
  dataset?: string,
): Promise<string> {
  return chamarFerramentaCognee(config, sessao, 'recall', {
    query: pergunta,
    ...(dataset ? { dataset_name: dataset } : {}),
  });
}
