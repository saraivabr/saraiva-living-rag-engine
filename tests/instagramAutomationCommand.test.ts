import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstagramAutomationCommand } from '../src/instagram/automationCommand.js';
import { PROSPECTING_FLOW_MEDIA_ID } from '../src/campaignTrigger.js';

test('aceita comando determinístico do comentário exato', () => {
  const command = parseInstagramAutomationCommand(JSON.stringify({
    version: '1',
    commandId: 'instagram-automation:cmd-1',
    correlationId: 'corr-1',
    campaignId: 'sexyflow-saraiva-v1',
    action: 'start_from_comment',
    source: 'instagram.comment.received',
    person: { username: 'ana' },
    comment: { id: 'comment-1', mediaId: PROSPECTING_FLOW_MEDIA_ID, text: 'SARAIVA' },
    occurredAt: new Date().toISOString(),
  }));
  assert.equal(command.action, 'start_from_comment');
});

test('rejeita publicação errada e interação fora do namespace', () => {
  assert.throws(() => parseInstagramAutomationCommand(JSON.stringify({
    version: '1',
    commandId: 'instagram-automation:cmd-1',
    correlationId: 'corr-1',
    campaignId: 'sexyflow-saraiva-v1',
    action: 'start_from_comment',
    source: 'instagram.comment.received',
    person: {},
    comment: { id: 'comment-1', mediaId: 'wrong', text: 'SARAIVA' },
    occurredAt: new Date().toISOString(),
  })), /campaign_mismatch/);
});
