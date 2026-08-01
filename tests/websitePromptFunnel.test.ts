import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  advanceInstagramFlow,
  createInstagramCommentFlow,
  WEBSITE_PRODUCT_BUTTON_OPTIONS,
} from '../src/instagram/automationFlow.js';
import { WEBSITE_PROMPT_MEDIA_ID } from '../src/campaignTrigger.js';

const sourcePromptUrl = new URL('../content/prompt-site-work-sites.md', import.meta.url);
const publicPromptUrl = new URL('../storefront/public/prompt-do-video.txt', import.meta.url);

test('o arquivo gratuito publicado é byte a byte o prompt-base usado no vídeo', async () => {
  const [source, published] = await Promise.all([
    readFile(sourcePromptUrl),
    readFile(publicPromptUrl),
  ]);
  const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(published), digest(source));
  assert.ok(published.byteLength > 10_000);
});

test('a jornada completa cumpre a promessa antes da oferta nos dois caminhos', () => {
  for (const [payload, expected] of [
    ['FLOW:SITES:INTENT:OWN', /sua empresa/i],
    ['FLOW:SITES:INTENT:SELL', /potenciais clientes/i],
  ] as const) {
    const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
      correlationId: `corr-${payload}`,
    })!;
    assert.equal(entry.session.stage, 'awaiting_intent');
    assert.equal(entry.message.kind, 'quick_replies');
    if (entry.message.kind !== 'quick_replies') return;
    assert.deepEqual(entry.message.quickReplies.map((button) => button.title), [
      'MINHA EMPRESA',
      'VENDER SITES',
    ]);

    const delivered = advanceInstagramFlow(entry.session, { payload })!;
    assert.equal(delivered.session.stage, 'offering_product');
    assert.equal(delivered.messages?.length, 4);
    const messages = JSON.stringify(delivered.messages);
    assert.match(messages, expected);
    assert.ok(messages.indexOf('COPIAR PROMPT') < messages.indexOf('Gerador de Prompts — R$ 9,97'));
    assert.doesNotMatch(messages, /WhatsApp|Laboratório|comunidade|consultoria|Cliente Pronto|R\$ 97|R\$ 497/i);
  }
});

test('todos os botões do funil respeitam o limite estrito de vinte caracteres', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID)!;
  if (entry.message.kind !== 'quick_replies') assert.fail('quick replies ausentes');
  const titles = [
    ...entry.message.quickReplies.map((button) => button.title),
    'COPIAR PROMPT',
    ...WEBSITE_PRODUCT_BUTTON_OPTIONS,
  ];
  assert.ok(titles.every((title) => title.length <= 20), titles.join(', '));
});
