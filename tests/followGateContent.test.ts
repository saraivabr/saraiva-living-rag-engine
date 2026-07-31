import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFollowStatus, buildFollowGateMessage } from '../src/instagram/followGate.js';
import { getContentDefinition } from '../src/instagram/contentCatalog.js';

test('isFollower=true libera conteúdo e resolve status como following', () => {
  const payload = {
    message: {
      sender: {
        instagramProfile: {
          isFollower: true,
        },
      },
    },
  };
  const status = resolveFollowStatus(payload);
  assert.equal(status, 'following');
  const msg = buildFollowGateMessage('following', { contentTitle: 'Prompt de Automação' });
  assert.match(msg.message, /Pronto\. Aqui está a/);
});

test('isFollower=false bloqueia e mostra botão JÁ SEGUI', () => {
  const payload = {
    message: {
      sender: {
        instagramProfile: {
          isFollower: false,
        },
      },
    },
  };
  const status = resolveFollowStatus(payload);
  assert.equal(status, 'not_following');
  const msg = buildFollowGateMessage('not_following', {});
  assert.match(msg.message, /Esse conteúdo é exclusivo/);
  assert.equal(msg.buttons?.[0]?.title, 'JÁ SEGUI');
  assert.equal(msg.buttons?.[0]?.payload, 'FLOW:SARAIVA:FOLLOW_CONFIRMED');
});

test('isFollower ausente usa unknown sem acusar ausência de follow', () => {
  const payload = { message: { sender: {} } };
  const status = resolveFollowStatus(payload);
  assert.equal(status, 'unknown');
  const msg = buildFollowGateMessage('unknown', {});
  assert.match(msg.message, /Não consegui confirmar ainda/);
  assert.doesNotMatch(msg.message, /você não me segue|você não segue/i);
});

test('catálogo determinístico recupera conteúdos cadastrados e recusa externos', () => {
  const promptContent = getContentDefinition('PROMPT');
  assert.equal(promptContent?.id, 'PROMPT');
  assert.equal(promptContent?.requiresFollow, true);

  const invalidContent = getContentDefinition('LINK_EXTERNO_MALICIOSO');
  assert.equal(invalidContent, undefined);
});
