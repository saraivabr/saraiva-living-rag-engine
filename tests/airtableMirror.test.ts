import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mirrorInBackground,
  mirrorLeadToAirtable,
  mirrorSaleToAirtable,
} from '../src/crm/airtableMirror.js';

const originalFetch = globalThis.fetch;
const originalKey = process.env.AIRTABLE_API_KEY;
const originalBase = process.env.AIRTABLE_BASE_ID;

function withCredentials(): void {
  process.env.AIRTABLE_API_KEY = 'key-de-teste';
  process.env.AIRTABLE_BASE_ID = 'appTeste';
}

function restore(): void {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.AIRTABLE_API_KEY;
  else process.env.AIRTABLE_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.AIRTABLE_BASE_ID;
  else process.env.AIRTABLE_BASE_ID = originalBase;
}

function captureFetch(): { calls: Array<{ url: string; body: any }> } {
  const calls: Array<{ url: string; body: any }> = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body as string) });
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;
  return { calls };
}

const lead = {
  senderId: '17841400000000000',
  username: 'clinica.exemplo',
  stage: 'diagnosing',
  score: 42,
  temperature: 'morno',
  offer: 'prompt_library',
  promiseLabel: 'Biblioteca de Prompts',
  nextAction: 'Perguntar o gargalo atual',
  lastInbound: 'quero entender como funciona',
  lastOutbound: 'Hoje voce perde mais venda na primeira resposta ou no follow-up?',
  updatedAt: '2026-08-06T08:00:00.000Z',
};

test('nao chama o Airtable quando as credenciais nao estao configuradas', async () => {
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;
  const { calls } = captureFetch();

  await mirrorLeadToAirtable(lead);

  assert.equal(calls.length, 0);
  restore();
});

test('espelha o lead com upsert pelo ID do remetente', async () => {
  withCredentials();
  const { calls } = captureFetch();

  await mirrorLeadToAirtable(lead);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /appTeste\/Leads$/);
  assert.deepEqual(calls[0].body.performUpsert, { fieldsToMergeOn: ['ID'] });
  assert.equal(calls[0].body.records[0].fields.ID, lead.senderId);
  assert.equal(calls[0].body.records[0].fields.Score, 42);
  restore();
});

test('converte centavos em reais e casa a venda pela correlacao', async () => {
  withCredentials();
  const { calls } = captureFetch();

  await mirrorSaleToAirtable({
    correlationId: 'pl-abc123',
    product: 'Biblioteca de Prompts',
    valueCents: 1990,
    status: 'COMPLETED',
    senderId: '17841400000000000',
    email: 'pessoa@exemplo.com',
    createdAt: '2026-08-06T07:00:00.000Z',
    paidAt: '2026-08-06T07:04:00.000Z',
  });

  const fields = calls[0].body.records[0].fields;
  assert.deepEqual(calls[0].body.performUpsert, { fieldsToMergeOn: ['Correlação'] });
  assert.equal(fields.Valor, 19.9);
  assert.equal(fields['Correlação'], 'pl-abc123');
  restore();
});

test('omite campos vazios em vez de mandar undefined para o Airtable', async () => {
  withCredentials();
  const { calls } = captureFetch();

  await mirrorLeadToAirtable({ ...lead, username: undefined, postPermalink: '' });

  const fields = calls[0].body.records[0].fields;
  assert.equal('Usuário' in fields, false);
  assert.equal('Post' in fields, false);
  assert.equal(fields.ID, lead.senderId);
  restore();
});

test('falha do Airtable nao propaga: o atendimento segue', async () => {
  withCredentials();
  globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof globalThis.fetch;

  await assert.rejects(() => mirrorLeadToAirtable(lead), /Airtable 429/);

  // O disparo em background engole o erro e apenas registra o aviso.
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  mirrorInBackground('lead', () => mirrorLeadToAirtable(lead));
  await new Promise((resolve) => setImmediate(resolve));
  console.warn = originalWarn;

  assert.equal(warnings.length, 1);
  restore();
});
