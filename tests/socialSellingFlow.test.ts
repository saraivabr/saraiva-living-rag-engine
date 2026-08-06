import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSalesOffer } from '../src/sales/empresaAgentica.js';
import {
  buildSocialSellingTurn,
  resolveCommentCampaignCopy,
  resolvePostPromise,
  resolveKnownMediaPromise,
  type PostPromise,
  type PromiseKind,
} from '../src/socialSelling/flow.js';
import {
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../src/campaignTrigger.js';

const CURRENT_WORKSHOP = {
  offer: 'workshop_voice_ai',
  label: 'Workshop Ligações com IA no WhatsApp',
  priceCents: 9_700,
  checkoutUrl: 'https://workshop.saraiva.ai/checkout',
} as const;

function promiseFor(kind: PromiseKind): PostPromise {
  return {
    kind,
    label: `contexto de teste: ${kind}`,
    publicReply: 'Te chamei na DM para entender o seu caso.',
    privateReply: 'Quero entender onde voce pretende aplicar essa solucao.',
  };
}

test('vincula o post VOZ corrigido ao mapa da IA de ligacao', () => {
  const promise = resolveKnownMediaPromise('17876885349503055');

  assert.equal(promise?.kind, 'voice_ai_map_workshop');
  assert.match(promise?.privateReply || '', /Wavoip/);
  assert.match(promise?.privateReply || '', /atendimento, vendas, suporte ou agenda/i);
});

test('reel de sites registra a promessa exata do prompt gratuito', () => {
  const promise = resolveKnownMediaPromise(WEBSITE_PROMPT_MEDIA_ID);

  assert.equal(promise?.kind, 'website_prompt');
  assert.match(promise?.label || '', /prompt usado no vídeo/i);
  assert.match(promise?.privateReply || '', /liberado gratuitamente/i);
  assert.match(promise?.privateReply || '', /prompt\.saraiva\.ai/i);
  assert.match(promise?.publicReply || '', /Direct|inbox/i);
  assert.doesNotMatch(
    JSON.stringify(promise),
    /WhatsApp|Laboratório|comunidade|loja\.saraiva\.ai|Cliente Pronto|R\$19,90|checkout|proposta|10 empresas/i,
  );
});

test('post correto da prospeccao nao herda a oferta de sites', () => {
  const promise = resolveKnownMediaPromise(PROSPECTING_FLOW_MEDIA_ID);

  assert.equal(promise?.kind, 'prospecting_automation');
  assert.match(promise?.label || '', /prospeccao/i);
  assert.match(promise?.privateReply || '', /QUERO COPIAR/i);
  assert.doesNotMatch(JSON.stringify(promise), /Cliente Pronto|loja\.saraiva\.ai|R\\$19,90/i);
});

test('reel do prompt mantém a mesma entrega gratuita em retries', () => {
  const promise = resolveKnownMediaPromise(WEBSITE_PROMPT_MEDIA_ID);
  assert.ok(promise);

  const first = resolveCommentCampaignCopy(promise, '17900000000000123');
  const retry = resolveCommentCampaignCopy(promise, '17900000000000123');
  assert.deepEqual(retry, first);
  assert.equal(first.variant, 'default');
  assert.match(first.publicReply, /Direct/i);
  assert.match(first.privateReply, /prompt\.saraiva\.ai/i);
  assert.doesNotMatch(first.privateReply, /WhatsApp|Laboratório|comunidade|checkout/i);
  assert.ok(Buffer.byteLength(first.privateReply, 'utf8') <= 500);
});

test('caption de sites com ChatGPT vence o fallback generico de prompt', () => {
  const promise = resolvePostPromise({
    postCaption: 'FAZER US$ 1.000 CRIANDO SITES COM CHATGPT. Um site que não gera uma ação é apenas um cartão de visita.',
    commentText: 'SARAIVA',
  });

  assert.equal(promise.kind, 'sites_whatsapp_workshop');
});

test('reel de jingles entrega acesso real e roteiro sem prometer faturamento', () => {
  const promise = resolvePostPromise({
    postCaption: 'Crie um jingle para negócios locais. Comente MÚSICA para receber o acesso.',
    commentText: 'MÚSICA',
  });

  assert.equal(promise.kind, 'music_business');
  assert.match(promise.privateReply, /https:\/\/musicacom\.ia\.br\/login\//i);
  assert.match(promise.privateReply, /Google Maps/i);
  assert.match(promise.privateReply, /não existe faturamento garantido/i);
  assert.match(promise.publicReply, /Direct/i);
});

test('mensagens antigas de APOSTILA e PRONTO não reabrem checkout no reel de sites', () => {
  const promise = resolveKnownMediaPromise(WEBSITE_PROMPT_MEDIA_ID);
  assert.ok(promise);

  const guide = buildSocialSellingTurn('APOSTILA', promise);
  assert.equal(guide.sales.offer, 'diagnostic');
  assert.equal(guide.sales.priceCents, undefined);
  assert.equal(guide.sales.checkoutUrl, undefined);
  assert.match(guide.reply, /prompt\.saraiva\.ai/i);
  assert.equal((guide.reply.match(/\?/g) || []).length, 0);

  const ready = buildSocialSellingTurn('PRONTO', promise);
  assert.equal(ready.sales.offer, 'diagnostic');
  assert.equal(ready.sales.priceCents, undefined);
  assert.match(ready.reply, /copiar e usar sem pagar/i);
  assert.doesNotMatch(
    JSON.stringify([guide.reply, guide.sales, ready.reply, ready.sales]),
    /loja\.saraiva\.ai|R\$19,90|Cliente Pronto/i,
  );
});

test('todos os contextos de voz vendem somente o Workshop Ligacoes com IA atual', () => {
  for (const kind of [
    'voice_ai_map_workshop',
    'whatsapp_elevenlabs_workshop',
    'voice_call_map',
    'sdr_voice',
  ] satisfies PromiseKind[]) {
    const offer = resolveSalesOffer(promiseFor(kind));

    assert.equal(offer.offer, CURRENT_WORKSHOP.offer, kind);
    assert.equal(offer.offerLabel, CURRENT_WORKSHOP.label, kind);
    assert.equal(offer.priceCents, CURRENT_WORKSHOP.priceCents, kind);
    assert.equal(offer.checkoutUrl, CURRENT_WORKSHOP.checkoutUrl, kind);
  }
});

test('contextos sem aderencia nunca retornam a pagina antiga da Empresa Agentica', () => {
  for (const kind of [
    'diagnostic',
    'whatsapp_ai',
    'empresa_agentica_live',
  ] satisfies PromiseKind[]) {
    const offer = resolveSalesOffer(promiseFor(kind));

    assert.doesNotMatch(JSON.stringify(offer), /comunidade\.saraiva\.ai/i, kind);
  }
});

test('pedido explicito de link entrega o checkout atual sem voltar para a Live antiga', () => {
  const turn = buildSocialSellingTurn(
    'me manda o link',
    promiseFor('voice_ai_map_workshop'),
  );

  assert.match(turn.reply, /https:\/\/workshop\.saraiva\.ai\/checkout/i);
  assert.doesNotMatch(turn.reply, /comunidade\.saraiva\.ai|Empresa Agentica|direcionar para Live/i);
  assert.equal(turn.sales.checkoutUrl, CURRENT_WORKSHOP.checkoutUrl);
  assert.equal(turn.sales.priceCents, CURRENT_WORKSHOP.priceCents);
});

test('alegacao de pagamento aguarda verificacao no provedor e nao confirma venda', () => {
  const turn = buildSocialSellingTurn(
    'paguei',
    promiseFor('voice_ai_map_workshop'),
  );
  const verificationContext = `${turn.reply}\n${turn.sales.nextAction}`;

  assert.equal(turn.sales.stage, 'pagamento_pendente_verificacao');
  assert.match(verificationContext, /verific|provedor|pagamento/i);
  assert.doesNotMatch(
    turn.reply,
    /pagamento (?:foi |esta |está )?confirmado|compra (?:foi |esta |está )?confirmada|boa decis[aã]o/i,
  );
});

test('opt-out encerra a abordagem sem pergunta e permanece bloqueado', () => {
  const stopped = buildSocialSellingTurn('pare');
  const repeated = buildSocialSellingTurn('oi', undefined, stopped.state);

  assert.equal(stopped.state.stage, 'disqualified');
  assert.equal(stopped.shouldNotifyOwner, false);
  assert.equal((stopped.reply.match(/\?/g) || []).length, 0);
  assert.equal(repeated.state.stage, 'disqualified');
  assert.equal((repeated.reply.match(/\?/g) || []).length, 0);
});

test('somente pedido explicito QUERO RETOMAR reabre a conversa', () => {
  const stopped = buildSocialSellingTurn('cancelar');
  const resumed = buildSocialSellingTurn('QUERO RETOMAR', undefined, stopped.state);

  assert.notEqual(resumed.state.stage, 'disqualified');
  assert.equal((resumed.reply.match(/\?/g) || []).length, 1);
});

test('opt-out reconhece formas explicitas sem depender de uma frase exata', () => {
  for (const message of [
    'STOP',
    'não tenho interesse',
    'não me chame',
    'remova meu contato',
    'para de mandar mensagem',
    'quero sair da lista',
  ]) {
    const turn = buildSocialSellingTurn(message);
    assert.equal(turn.state.stage, 'disqualified', message);
    assert.equal((turn.reply.match(/\?/g) || []).length, 0, message);
  }
});

test('nao confunde palavras de negocio com opt-out', () => {
  for (const message of [
    'parece bom',
    'não quero perder leads',
    'não quero continuar perdendo clientes',
    'não quero mais perder vendas',
    'quero automatizar cancelamento',
  ]) {
    const turn = buildSocialSellingTurn(message);
    assert.notEqual(turn.state.stage, 'disqualified', message);
  }
});
