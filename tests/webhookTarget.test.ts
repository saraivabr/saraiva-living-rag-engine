import assert from 'node:assert/strict';
import test from 'node:test';
import { isTargetWebhookEntry } from '../src/webhookTarget.js';

const saraivaAiIds = ['17841401830912551', '1054385387750829'];

test('aceita somente o Instagram e a pagina vinculada ao @saraiva.ai', () => {
  assert.equal(isTargetWebhookEntry('instagram', '17841401830912551', saraivaAiIds), true);
  assert.equal(isTargetWebhookEntry('instagram', '1054385387750829', saraivaAiIds), true);
});

test('rejeita outra conta, inclusive @saraiva.os', () => {
  assert.equal(isTargetWebhookEntry('instagram', '17841423372026816', saraivaAiIds), false);
});

test('rejeita Messenger mesmo quando o entry id e da pagina vinculada', () => {
  assert.equal(isTargetWebhookEntry('page', '1054385387750829', saraivaAiIds), false);
});

test('rejeita evento sem identificador de conta', () => {
  assert.equal(isTargetWebhookEntry('instagram', undefined, saraivaAiIds), false);
  assert.equal(isTargetWebhookEntry('instagram', '', saraivaAiIds), false);
});
