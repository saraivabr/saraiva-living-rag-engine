/**
 * Espelho legível de leads e vendas no Airtable.
 *
 * O DynamoDB continua sendo a fonte da verdade operacional: é lá que ficam a
 * idempotência do webhook e os locks de conversa, que dependem de escrita
 * condicional. O Airtable existe para o lado humano da operação — ver quem
 * chegou, em que estágio está e o que foi vendido.
 *
 * Por isso nada aqui pode derrubar o atendimento: toda falha vira log.
 */

const AIRTABLE_API = 'https://api.airtable.com/v0';
const REQUEST_TIMEOUT_MS = 8_000;

export interface AirtableLeadMirror {
  senderId: string;
  username?: string;
  stage: string;
  score: number;
  temperature: string;
  offer: string;
  promiseLabel: string;
  nextAction: string;
  lastInbound?: string;
  lastOutbound?: string;
  postPermalink?: string;
  updatedAt: string;
}

export interface AirtableSaleMirror {
  correlationId: string;
  product: string;
  valueCents: number;
  status: string;
  senderId: string;
  name?: string;
  email?: string;
  whatsapp?: string;
  transactionId?: string;
  paidAt?: string;
  createdAt: string;
}

interface AirtableCredentials {
  apiKey: string;
  baseId: string;
}

function credentials(): AirtableCredentials | undefined {
  const apiKey = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  if (!apiKey || !baseId) return undefined;
  return { apiKey, baseId };
}

/**
 * Upsert nativo do Airtable: casa pelo campo-chave e cria o registro quando
 * ele ainda não existe, sem precisar de uma leitura antes.
 */
async function upsert(
  table: string,
  mergeOn: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const creds = credentials();
  if (!creds) return;

  const response = await fetch(`${AIRTABLE_API}/${creds.baseId}/${encodeURIComponent(table)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: [mergeOn] },
      records: [{ fields: pruneEmpty(fields) }],
      typecast: true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Airtable ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

/** Airtable rejeita `undefined`; campos vazios simplesmente não são enviados. */
function pruneEmpty(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export async function mirrorLeadToAirtable(lead: AirtableLeadMirror): Promise<void> {
  const table = process.env.AIRTABLE_TABLE_LEADS?.trim() || 'Leads';
  await upsert(table, 'ID', {
    ID: lead.senderId,
    Usuário: lead.username,
    Estágio: lead.stage,
    Score: lead.score,
    Temperatura: lead.temperature,
    Oferta: lead.offer,
    Promessa: lead.promiseLabel,
    'Próxima ação': lead.nextAction,
    'Última mensagem': lead.lastInbound?.slice(0, 1_000),
    'Última resposta': lead.lastOutbound?.slice(0, 1_000),
    Post: lead.postPermalink,
    Atualizado: lead.updatedAt,
  });
}

export async function mirrorSaleToAirtable(sale: AirtableSaleMirror): Promise<void> {
  const table = process.env.AIRTABLE_TABLE_SALES?.trim() || 'Vendas';
  await upsert(table, 'Correlação', {
    'Correlação': sale.correlationId,
    Produto: sale.product,
    Valor: sale.valueCents / 100,
    Status: sale.status,
    ID: sale.senderId,
    Nome: sale.name,
    Email: sale.email,
    WhatsApp: sale.whatsapp,
    Transação: sale.transactionId,
    'Pago em': sale.paidAt,
    'Criado em': sale.createdAt,
  });
}

/**
 * Dispara o espelhamento sem segurar a resposta ao seguidor. O Airtable é um
 * relatório; se ele falhar, o atendimento segue e o DynamoDB já registrou tudo.
 */
export function mirrorInBackground(
  label: 'lead' | 'venda',
  run: () => Promise<void>,
): void {
  if (!credentials()) return;
  void run().catch((error: unknown) => {
    console.warn('Espelho do Airtable falhou; seguindo sem bloquear', {
      label,
      error: error instanceof Error ? error.message.slice(0, 300) : 'erro sem mensagem',
    });
  });
}
