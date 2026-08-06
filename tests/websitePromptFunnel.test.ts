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

test('a jornada entrega o prompt no primeiro contato, sem link e sem preço', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    correlationId: 'corr-entrada',
  })!;
  assert.equal(entry.session.stage, 'offering_product');
  assert.equal(entry.session.path, 'build');
  assert.ok(entry.session.promptDeliveredAt);
  assert.equal(entry.session.productOfferedAt, undefined);
  assert.equal(entry.messages?.length, 2);

  const [prompt, uso] = entry.messages!;
  assert.equal(prompt!.kind, 'text');
  if (prompt!.kind !== 'text') return;
  assert.match(prompt!.text, /^PROMPT DO VÍDEO — COPIE E COLE/);
  assert.match(prompt!.text, /potencial cliente/);
  assert.match(prompt!.text, /\[VALIDAR COM CLIENTE\]/);
  assert.doesNotMatch(prompt!.text, /https?:/);

  assert.equal(uso!.kind, 'quick_replies');
  if (uso!.kind !== 'quick_replies') return;
  assert.match(uso!.text, /ChatGPT.*modo Work/i);

  // A entrega é só a entrega. Preço e link são do follow-up, uma hora depois.
  const serialized = JSON.stringify(entry.messages);
  assert.equal((serialized.match(/https?:/g) || []).length, 0);
  assert.doesNotMatch(serialized, /R\$|19,90|Biblioteca|VER A BIBLIOTECA/i);
  assert.doesNotMatch(serialized, /COPIAR PROMPT|\/instagram\/(?:prompt|product)\?/);
  assert.doesNotMatch(serialized, /Gerador|Laboratório|comunidade|consultoria|Cliente Pronto|últimas vagas|80% off|lote/i);
});

test('quem pede a outra versão recebe a outra, também sem link', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    correlationId: 'corr-troca',
  })!;
  const troca = advanceInstagramFlow(
    entry.session,
    { payload: 'FLOW:SITES:INTENT:OWN' },
    { trackingBaseUrl: 'https://app.saraiva.ai' },
  )!;
  assert.equal(troca.session.path, 'ready');
  const [prompt] = troca.messages!;
  assert.equal(prompt!.kind, 'text');
  if (prompt!.kind !== 'text') return;
  assert.match(prompt!.text, /pronto para publicar/);
  assert.doesNotMatch(prompt!.text, /potencial cliente/);
  assert.equal((JSON.stringify(troca.messages).match(/https?:/g) || []).length, 0);
});

test('todos os botões do funil respeitam o limite estrito de vinte caracteres', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID)!;
  // Os botões agora vêm na mensagem de uso, não na primeira. O limite de 20
  // caracteres é regra dura do Instagram: acima disso o botão é recusado.
  const titles: string[] = ['JÁ SEGUI', 'VER A BIBLIOTECA'];
  for (const message of entry.messages || [entry.message]) {
    if (message.kind === 'quick_replies') {
      titles.push(...message.quickReplies.map((button) => button.title));
    }
    if (message.kind === 'link_card') {
      titles.push(...message.buttons.map((button) => button.title));
    }
  }
  assert.ok(titles.length > 2, 'nenhum botão encontrado na entrega');
  assert.ok(titles.every((title) => title.length <= 20), titles.join(', '));
});
