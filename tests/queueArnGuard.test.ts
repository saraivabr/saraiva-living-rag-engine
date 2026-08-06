import assert from 'node:assert/strict';
import test from 'node:test';
import { assertValidQueueArn } from '../src/lambda.js';

const VALIDO = 'arn:aws:sqs:us-east-1:880690593918:saraiva-social-sales-prod-instagram-automation-commands.fifo';

test('aceita o ARN real da fila de automação', () => {
  assert.equal(assertValidQueueArn(VALIDO), VALIDO);
  assert.equal(assertValidQueueArn(`  ${VALIDO}  `), VALIDO);
});

test('recusa o ARN mascarado que derrubou a fila em 05/08/2026', () => {
  assert.throws(
    () => assertValidQueueArn('arn:aws:sqs:us-east-1:880690593918:***.fifo'),
    /instagram_automation_queue_arn_malformed/,
  );
});

test('recusa ausência e valores truncados em vez de falhar mensagem a mensagem', () => {
  for (const invalido of [
    undefined,
    '',
    '   ',
  ]) {
    assert.throws(() => assertValidQueueArn(invalido), /instagram_automation_queue_arn_missing/);
  }

  for (const invalido of [
    'saraiva-social-sales-prod-instagram-automation-commands.fifo',
    'arn:aws:sqs:us-east-1:880690593918:',
    'arn:aws:sqs::880690593918:fila.fifo',
    'arn:aws:sqs:us-east-1:12345:fila.fifo',
    'arn:aws:sns:us-east-1:880690593918:fila.fifo',
    'https://sqs.us-east-1.amazonaws.com/880690593918/fila.fifo',
  ]) {
    assert.throws(
      () => assertValidQueueArn(invalido),
      /instagram_automation_queue_arn_malformed/,
      `deveria recusar: ${invalido}`,
    );
  }
});

test('aceita fila padrão sem sufixo .fifo', () => {
  const padrao = 'arn:aws:sqs:us-east-1:880690593918:saraiva-social-sales-prod-inbound-events';
  assert.equal(assertValidQueueArn(padrao), padrao);
});
