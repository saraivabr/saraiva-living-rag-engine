import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceInstagramFlow,
  createInstagramCommentFlow,
  FOLLOW_GATE_MAX_RECHECKS,
  SARAIVA_FLOW_PAYLOAD,
  type InstagramFlowSession,
} from '../src/instagram/automationFlow.js';
import { WEBSITE_PROMPT_MEDIA_ID } from '../src/campaignTrigger.js';

function sessaoNoPortao(tentativas: number): InstagramFlowSession {
  const inicial = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID)!.session;
  return {
    ...inicial,
    stage: 'awaiting_follow',
    path: 'build',
    followStatus: 'unknown',
    followRecheckAttempts: tentativas,
  };
}

const confirmou = { payload: SARAIVA_FLOW_PAYLOAD.followConfirmed };

test('primeira confirmação sem isFollower ainda pede o follow', () => {
  const passo = advanceInstagramFlow(sessaoNoPortao(0), confirmou, {});

  assert.equal(passo?.session.stage, 'awaiting_follow');
  assert.equal(passo?.session.followRecheckAttempts, 1);
  assert.equal(passo?.session.promptDeliveredAt, undefined);
});

test('quem insiste depois do limite recebe o prompt em vez de ficar preso', () => {
  // A Graph API não devolve isFollower em todo evento. Sem escape, quem já
  // seguiu bate no mesmo portão para sempre — foi o que prendeu 24 leads.
  const passo = advanceInstagramFlow(sessaoNoPortao(FOLLOW_GATE_MAX_RECHECKS), confirmou, {});

  assert.equal(passo?.session.stage, 'offering_product');
  assert.ok(passo?.session.promptDeliveredAt, 'o prompt precisa ser entregue');
  assert.equal(passo?.reasonCode, 'follow_confirmed_before_content');
});

test('quem a Graph API confirma como seguidor passa direto, sem recheck', () => {
  const passo = advanceInstagramFlow(sessaoNoPortao(0), confirmou, { followStatus: 'following' });

  assert.equal(passo?.session.stage, 'offering_product');
  assert.ok(passo?.session.promptDeliveredAt);
});

test('sem confirmar o follow o portão continua fechado, por mais que insista', () => {
  const passo = advanceInstagramFlow(
    sessaoNoPortao(FOLLOW_GATE_MAX_RECHECKS + 5),
    { text: 'me manda logo' },
    {},
  );

  assert.equal(passo?.session.stage, 'awaiting_follow');
  assert.equal(passo?.session.promptDeliveredAt, undefined);
  assert.equal(passo?.reasonCode, 'follow_confirmation_required');
});
