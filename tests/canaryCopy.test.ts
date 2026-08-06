import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from '../src/canaryCopy.js';

test('canário serializa o prompt em texto e somente o link da Biblioteca', async () => {
  const result = await handler();
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.journeys.map((journey) => journey.path), ['ready', 'build']);
  assert.ok(result.journeys.every((journey) => journey.stage === 'offering_product'));
  const copy = JSON.stringify(result.journeys);
  assert.match(copy, /PROMPT DO VÍDEO — COPIE E COLE/);
  assert.doesNotMatch(copy, /COPIAR PROMPT|\/instagram\/prompt\?/);
  assert.ok(result.journeys.every((journey) => journey.deliveryMessages.length === 2));
  for (const journey of result.journeys) {
    const [promptMessage, libraryCard] = journey.deliveryMessages;
    assert.equal(promptMessage!.kind, 'text');
    if (promptMessage!.kind !== 'text') continue;
    assert.doesNotMatch(promptMessage!.text, /https?:/);
    assert.equal(libraryCard!.kind, 'link_card');
    if (libraryCard!.kind !== 'link_card') continue;
    assert.equal(libraryCard!.buttons.length, 1);
    const libraryButton = libraryCard!.buttons[0]!;
    assert.equal(libraryButton.title, 'VER A BIBLIOTECA');
    assert.equal(libraryButton.type, 'web_url');
    if (libraryButton.type !== 'web_url') continue;
    const libraryUrl = new URL(libraryButton.url);
    assert.equal(libraryUrl.host, 'app.saraiva.ai');
    assert.equal(libraryUrl.pathname, '/instagram/product');
  }
  assert.ok(result.journeys.every((journey) => (
    JSON.stringify(journey).match(/https?:/g) || []
  ).length === 1));
  assert.doesNotMatch(copy, /Gerador de Prompts|últimas vagas|80% off|R\$ 97|100 projetos/i);
});

test('canário rejeita caminho fora do contrato', async () => {
  const result = await handler({ path: 'unknown' as 'ready' });
  assert.deepEqual(result, { ok: false, error: 'invalid_path' });
});

test('canário pode validar o Motor sem enviar mensagem ao Instagram', async () => {
  const result = await handler({ validateMotor: true }, {
    generateMotor: async () => ({
      reply: 'Entendi o seu cenário. Qual segmento você quer adaptar primeiro?',
      source: 'motor',
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.assistantCheck, {
    ok: true,
    source: 'motor',
    chars: 64,
    questionCount: 1,
  });
});
