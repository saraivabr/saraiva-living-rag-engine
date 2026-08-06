import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTENT_POLICY,
  evaluateContentPolicy,
  isInsidePostingWindow,
  postingWindowHours,
  type PolicyRule,
} from '../src/content/contentPolicy.js';

/** 14h em Sao Paulo (UTC-3) = 17h UTC. */
const DENTRO_DA_JANELA = '2026-08-06T17:30:00.000Z';
/** 23h em Sao Paulo = 02h UTC do dia seguinte. */
const FORA_DA_JANELA = '2026-08-07T02:00:00.000Z';

function rules(result: { violations: Array<{ rule: PolicyRule }> }): PolicyRule[] {
  return result.violations.map((violation) => violation.rule);
}

test('reel dentro das regras passa limpo', () => {
  const result = evaluateContentPolicy({
    mediaProductType: 'REELS',
    durationSeconds: 42,
    publishAt: DENTRO_DA_JANELA,
    caption: 'a Meta liberou isso hoje. comenta MAPA que eu te mando. #ia',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.unchecked, []);
});

test('comando 4: reel acima de 45s e bloqueado', () => {
  const result = evaluateContentPolicy({
    mediaProductType: 'REELS',
    durationSeconds: 66,
    publishAt: DENTRO_DA_JANELA,
    caption: 'comenta SARAIVA',
  });
  assert.equal(result.ok, false);
  assert.ok(rules(result).includes('reel_duration'));
  assert.match(result.violations[0].detail, /66s excede o teto de 45s/u);
});

test('comando 4: 45s exatos ainda passa', () => {
  const result = evaluateContentPolicy({
    mediaProductType: 'REELS',
    durationSeconds: CONTENT_POLICY.maxReelSeconds,
    publishAt: DENTRO_DA_JANELA,
    caption: 'comenta SARAIVA',
  });
  assert.equal(rules(result).includes('reel_duration'), false);
});

test('comando 5: publicar as 23h de Sao Paulo e bloqueado', () => {
  const result = evaluateContentPolicy({
    mediaProductType: 'REELS',
    durationSeconds: 30,
    publishAt: FORA_DA_JANELA,
    caption: 'comenta SARAIVA',
  });
  assert.equal(result.ok, false);
  assert.ok(rules(result).includes('posting_window'));
});

test('comando 5: a janela cobre 14h, 15h e 16h', () => {
  assert.deepEqual(postingWindowHours(), [14, 15, 16]);
  assert.equal(isInsidePostingWindow(13), false);
  assert.equal(isInsidePostingWindow(14), true);
  assert.equal(isInsidePostingWindow(16), true);
  assert.equal(isInsidePostingWindow(17), false);
});

test('feed estatico continua bloqueado enquanto o formato estiver suspenso', () => {
  const result = evaluateContentPolicy({
    mediaProductType: 'FEED',
    durationSeconds: 20,
    publishAt: DENTRO_DA_JANELA,
    caption: 'comenta SARAIVA',
  });
  assert.equal(result.ok, false);
  assert.ok(rules(result).includes('media_format'));
});

test('excesso de hashtag e falta de CTA avisam sem bloquear', () => {
  const result = evaluateContentPolicy({
    mediaProductType: 'REELS',
    durationSeconds: 30,
    publishAt: DENTRO_DA_JANELA,
    caption: 'texto qualquer #a #b #c #d #e #f',
  });
  assert.equal(result.ok, true, 'avisos nao bloqueiam a publicacao');
  assert.deepEqual(rules(result).sort(), ['hashtag_spread', 'missing_cta']);
});

test('dado ausente vira unchecked, nunca violacao inventada', () => {
  const result = evaluateContentPolicy({});
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(
    result.unchecked.sort(),
    ['media_format', 'missing_cta', 'posting_window', 'reel_duration'],
  );
});

test('hashtags explicitas tem prioridade sobre as da legenda', () => {
  const result = evaluateContentPolicy({
    mediaProductType: 'REELS',
    durationSeconds: 30,
    publishAt: DENTRO_DA_JANELA,
    caption: 'comenta SARAIVA #um #dois #tres #quatro #cinco #seis #sete',
    hashtags: ['#ia', '#automacao'],
  });
  assert.equal(rules(result).includes('hashtag_spread'), false);
});
