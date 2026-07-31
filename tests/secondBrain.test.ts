import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerHypothesis,
  recordExposure,
  recordClick,
  generateBrainSummary,
} from '../src/secondBrain/hypothesisEngine.js';
import { exportSecondBrainMarkdownReport } from '../src/secondBrain/insightsReporter.js';

test('Segundo Cérebro: registra hipótese e calcula conversão corretamente', async () => {
  const hyp = await registerHypothesis(
    'HYP-TEST-001',
    'Teste de Copy de Provocação no Direct',
    'Testando se provocação inicial aumenta cliques no WhatsApp',
    'private_reply',
    'Você comentou SARAIVA porque sabe que seu site atual é um ralo de clientes...',
  );

  assert.equal(hyp.id, 'HYP-TEST-001');
  assert.equal(hyp.exposures, 0);
  assert.equal(hyp.status, 'TESTING');

  await recordExposure('HYP-TEST-001');
  await recordExposure('HYP-TEST-001');
  await recordClick('HYP-TEST-001');

  const summary = await generateBrainSummary();
  const found = summary.activeHypotheses.find((item) => item.id === 'HYP-TEST-001');
  assert.ok(found);
  assert.equal(found.exposures, 2);
  assert.equal(found.clicks, 1);
  assert.equal(found.conversionRate, 50.0);
});

test('Segundo Cérebro: gera relatório formatado em Markdown', async () => {
  const report = await exportSecondBrainMarkdownReport();
  assert.match(report, /# 🧠 Relatório do Segundo Cérebro/);
  assert.match(report, /Hipóteses & Experimentos Ativos/);
});
