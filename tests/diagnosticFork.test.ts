import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DIAGNOSTIC_FORK_QUESTION,
  PAIN_FORK_QUESTION,
  isForkQuestion,
  matchDiagnosticFork,
} from '../src/socialSelling/diagnosticFork.js';
import { diagnosticQuestion } from '../src/sales/empresaAgentica.js';
import { buildSocialSellingTurn, type PostPromise } from '../src/socialSelling/flow.js';

const diagnosticPromise: PostPromise = {
  kind: 'diagnostic',
  label: 'diagnostico da operacao',
  publicReply: 'te chamei na DM.',
  privateReply: `vi teu comentario.\n\n${DIAGNOSTIC_FORK_QUESTION}`,
};

test('a pergunta de diagnostico e binaria, nao um menu de seis opcoes', () => {
  assert.equal(diagnosticQuestion(), DIAGNOSTIC_FORK_QUESTION);
  assert.match(DIAGNOSTIC_FORK_QUESTION, /cliente que ficou sem resposta ou mes sem previsao/u);
  // duas alternativas: um unico "ou" e nenhuma enumeracao por virgula.
  assert.equal(DIAGNOSTIC_FORK_QUESTION.match(/\bou\b/gu)?.length, 1);
  assert.equal(DIAGNOSTIC_FORK_QUESTION.includes(','), false);
  assert.equal(PAIN_FORK_QUESTION.match(/\bou\b/gu)?.length, 1);
});

test('ramo atendimento preenche useCase e pain no mesmo turno', () => {
  const match = matchDiagnosticFork('cliente que ficou sem resposta mesmo');
  assert.deepEqual(match, { useCase: 'atendimento', pain: 'demora na resposta' });
});

test('ramo previsibilidade preenche useCase e pain no mesmo turno', () => {
  const match = matchDiagnosticFork('o mes sem previsao de faturamento');
  assert.deepEqual(match, {
    useCase: 'vendas',
    pain: 'mes sem previsibilidade de faturamento',
  });
});

test('responder os dois marca urgencia alta', () => {
  const match = matchDiagnosticFork('os dois na real', { forkWasAsked: true });
  assert.equal(match?.urgency, 'alta');
  assert.equal(match?.pain, 'lead parado na fila e mes sem previsibilidade');
});

test('atalhos so valem quando a bifurcacao foi perguntada', () => {
  assert.equal(matchDiagnosticFork('a'), undefined);
  assert.deepEqual(matchDiagnosticFork('a', { forkWasAsked: true }), {
    useCase: 'atendimento',
    pain: 'demora na resposta',
  });
  assert.equal(matchDiagnosticFork('2'), undefined);
  assert.equal(matchDiagnosticFork('2', { forkWasAsked: true })?.useCase, 'vendas');
});

test('frase solta com a letra a nao dispara o ramo de atendimento', () => {
  assert.equal(matchDiagnosticFork('quero ver a automacao pronta'), undefined);
  assert.equal(matchDiagnosticFork('quero ver a automacao', { forkWasAsked: true }), undefined);
});

test('isForkQuestion reconhece as duas perguntas da bifurcacao', () => {
  assert.equal(isForkQuestion(DIAGNOSTIC_FORK_QUESTION), true);
  assert.equal(isForkQuestion(PAIN_FORK_QUESTION), true);
  assert.equal(isForkQuestion('qualquer outra pergunta'), false);
  assert.equal(isForkQuestion(undefined), false);
});

test('uma resposta a bifurcacao tira o lead do score minimo', () => {
  const first = buildSocialSellingTurn('saraiva', diagnosticPromise);
  assert.equal(first.state.score, 10, 'palavra-chave sozinha nao qualifica');
  assert.equal(first.state.lastQuestion, DIAGNOSTIC_FORK_QUESTION);

  const second = buildSocialSellingTurn(
    'cliente que ficou sem resposta',
    diagnosticPromise,
    first.state,
  );
  assert.equal(second.state.useCase, 'atendimento');
  assert.equal(second.state.pain, 'demora na resposta');
  assert.ok(
    second.state.score >= 40,
    `score deveria sair de frio; veio ${second.state.score}`,
  );
});

test('atalho de um caractere qualifica porque a bifurcacao foi a ultima pergunta', () => {
  const first = buildSocialSellingTurn('saraiva', diagnosticPromise);
  const second = buildSocialSellingTurn('2', diagnosticPromise, first.state);
  assert.equal(second.state.useCase, 'vendas');
  assert.equal(second.state.pain, 'mes sem previsibilidade de faturamento');
});
