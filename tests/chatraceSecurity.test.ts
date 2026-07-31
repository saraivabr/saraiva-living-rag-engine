import assert from 'node:assert/strict';
import test from 'node:test';
import { isAuthorizedSyntheticValidation } from '../src/chatraceSecurity.js';

const secret = 'validation-secret-for-test';

test('autoriza validacao sintetica somente com modo e segredo separados', () => {
  assert.equal(isAuthorizedSyntheticValidation({
    'X-Saraiva-Validation-Mode': 'synthetic',
    'X-Saraiva-Validation-Token': secret,
  }, secret), true);
});

test('texto do seguidor nunca ativa o modo de validacao', () => {
  assert.equal(isAuthorizedSyntheticValidation({
    'x-follower-text': 'codex healthcheck validacao final',
  }, secret), false);
});

test('recusa modo sem token, token errado e token sem modo', () => {
  assert.equal(isAuthorizedSyntheticValidation({
    'x-saraiva-validation-mode': 'synthetic',
  }, secret), false);
  assert.equal(isAuthorizedSyntheticValidation({
    'x-saraiva-validation-mode': 'synthetic',
    'x-saraiva-validation-token': 'wrong',
  }, secret), false);
  assert.equal(isAuthorizedSyntheticValidation({
    'x-saraiva-validation-token': secret,
  }, secret), false);
});
