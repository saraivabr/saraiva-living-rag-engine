import assert from 'node:assert/strict';
import test from 'node:test';
import { synthesizeSaraivaVoice } from '../src/voice/elevenLabsTts.js';

test('gera MP3 com voz e modelo Saraiva sem expor a chave', async () => {
  let requestBody = '';
  let requestKey = '';
  const audio = await synthesizeSaraivaVoice('Ana, esta é uma apresentação segura.', {
    apiKeyResolver: async () => 'secret-for-test',
    fetchImpl: async (_url, init) => {
      requestBody = String(init?.body);
      requestKey = new Headers(init?.headers).get('xi-api-key') || '';
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    },
  });
  assert.equal(requestKey, 'secret-for-test');
  assert.match(requestBody, /eleven_multilingual_v2/);
  const parsedBody = JSON.parse(requestBody) as {
    apply_text_normalization?: string;
    voice_settings?: Record<string, unknown>;
  };
  assert.equal(parsedBody.apply_text_normalization, 'on');
  assert.deepEqual(parsedBody.voice_settings, {
    stability: 0.34,
    similarity_boost: 0.82,
    style: 0.12,
    use_speaker_boost: true,
    speed: 0.96,
  });
  assert.equal(audio.contentType, 'audio/mpeg');
  assert.equal(audio.bytes.length, 3);
  assert.doesNotMatch(JSON.stringify(audio), /secret-for-test/);
});

test('repete 429 e encerra em sucesso', async () => {
  let attempts = 0;
  const audio = await synthesizeSaraivaVoice('Texto consultivo.', {
    apiKeyResolver: async () => 'test-key',
    fetchImpl: async () => {
      attempts++;
      return attempts < 3
        ? new Response('{}', { status: 429 })
        : new Response(new Uint8Array([9]), { status: 200 });
    },
  });
  assert.equal(attempts, 3);
  assert.equal(audio.bytes[0], 9);
});
