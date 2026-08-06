import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  advanceInstagramFlow,
  createInstagramCommentFlow,
  createWebsitePromptTextMessages,
  WEBSITE_PROMPT_MESSAGE_MAX_CHARS,
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

test('cada intenção recebe um prompt específico em uma única mensagem', () => {
  const ownBusiness = createWebsitePromptTextMessages('ready');
  const sellSites = createWebsitePromptTextMessages('build');
  assert.equal(ownBusiness.length, 1);
  assert.equal(sellSites.length, 1);
  assert.notEqual(ownBusiness[0]!.text, sellSites[0]!.text);

  for (const part of [...ownBusiness, ...sellSites]) {
    const prompt = part.text;
    assert.ok(prompt.length <= WEBSITE_PROMPT_MESSAGE_MAX_CHARS);
    assert.match(prompt, /^PROMPT DO VÍDEO — COPIE E COLE/);
    assert.match(prompt, /\[EMPRESA\].*\[SEGMENTO\].*\[CIDADE\]/s);
    assert.match(prompt, /WhatsApp.*SEO local.*Schema\.org/s);
    assert.match(prompt, /Next\.js.*TypeScript.*Tailwind/s);
    assert.doesNotMatch(prompt, /https?:|Gerador/i);
  }
  assert.match(ownBusiness[0]!.text, /pronto para publicar/);
  assert.match(sellSites[0]!.text, /potencial cliente/);
  assert.match(sellSites[0]!.text, /\[VALIDAR COM CLIENTE\]/);
});

test('a entrega falha fechada se o prompt estiver vazio ou ultrapassar o limite', () => {
  assert.throws(
    () => createWebsitePromptTextMessages('ready', '   '),
    /website_prompt_message_empty/,
  );
  assert.throws(
    () => createWebsitePromptTextMessages('ready', 'x'.repeat(WEBSITE_PROMPT_MESSAGE_MAX_CHARS + 1)),
    /website_prompt_message_too_long/,
  );
});

test('a jornada completa entrega o prompt em texto e um único site da Biblioteca', () => {
  for (const payload of [
    'FLOW:SITES:INTENT:OWN',
    'FLOW:SITES:INTENT:SELL',
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

    const delivered = advanceInstagramFlow(
      entry.session,
      { payload },
      { followStatus: 'following', trackingBaseUrl: 'https://app.saraiva.ai' },
    )!;
    assert.equal(delivered.session.stage, 'offering_product');
    assert.equal(delivered.message.kind, 'text');
    assert.equal(delivered.messages?.length, 2);
    const [promptMessage, libraryCard] = delivered.messages!;
    assert.equal(promptMessage!.kind, 'text');
    if (promptMessage!.kind !== 'text') return;
    assert.doesNotMatch(promptMessage!.text, /https?:/);
    assert.equal(libraryCard!.kind, 'link_card');
    if (libraryCard!.kind !== 'link_card') return;
    assert.equal(libraryCard!.buttons.length, 1);
    const libraryButton = libraryCard!.buttons[0]!;
    assert.equal(libraryButton.title, 'VER A BIBLIOTECA');
    assert.equal(libraryButton.type, 'web_url');
    if (libraryButton.type !== 'web_url') return;
    const libraryUrl = new URL(libraryButton.url);
    assert.equal(libraryUrl.host, 'app.saraiva.ai');
    assert.equal(libraryUrl.pathname, '/instagram/product');
    if (payload === 'FLOW:SITES:INTENT:OWN') {
      assert.match(promptMessage!.text, /pronto para publicar/);
      assert.doesNotMatch(promptMessage!.text, /potencial cliente/);
    } else {
      assert.match(promptMessage!.text, /potencial cliente/);
      assert.match(promptMessage!.text, /\[VALIDAR COM CLIENTE\]/);
    }
    const messages = JSON.stringify(delivered.messages);
    assert.match(messages, /PROMPT DO VÍDEO — COPIE E COLE/);
    assert.doesNotMatch(messages, /COPIAR PROMPT|\/instagram\/prompt\?/);
    assert.equal((messages.match(/https?:/g) || []).length, 1);
    assert.doesNotMatch(messages, /Gerador|Laboratório|comunidade|consultoria|Cliente Pronto|R\$ 497|últimas vagas|80% off|lote/i);
  }
});

test('todos os botões do funil respeitam o limite estrito de vinte caracteres', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID)!;
  if (entry.message.kind !== 'quick_replies') assert.fail('quick replies ausentes');
  const titles = [
    ...entry.message.quickReplies.map((button) => button.title),
    'JÁ SEGUI',
    'VER A BIBLIOTECA',
  ];
  assert.ok(titles.every((title) => title.length <= 20), titles.join(', '));
});
