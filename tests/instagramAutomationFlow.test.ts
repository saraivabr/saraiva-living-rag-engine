import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  advanceInstagramFlow,
  createCommunityDestinationUrl,
  createFreePromptDestinationUrl,
  createInstagramCommentFlow,
  createStorefrontProductDestinationUrl,
  isInstagramFlowOptOut,
  isInstagramFlowResume,
  pauseInstagramFlow,
  recoverInstagramFlowSessionForInbound,
  resumeInstagramFlowMessage,
  SARAIVA_FLOW_ID,
  shouldAdvanceInstagramFlow,
  verifyTrackedFlowSignature,
  WEBSITE_PRODUCT_BUTTON_OPTIONS,
  WEBSITE_PRODUCT_BUTTON_RECOMMENDED,
} from '../src/instagram/automationFlow.js';
import { generateConversationalFlowReply } from '../src/instagram/conversationalFlow.js';
import {
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../src/campaignTrigger.js';
import { buildSafeProfileBrief } from '../src/instagram/profilePersonalization.js';
import { buildSaraivaAudioScript } from '../src/instagram/personalizedOffer.js';

const startedAt = new Date('2026-07-30T12:00:00.000Z');

test('reel de prospecção preserva o acesso direto atualmente publicado', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    now: startedAt,
    correlationId: 'anonymous-test',
  });
  assert.ok(entry);
  assert.equal(entry.session.id, SARAIVA_FLOW_ID);
  assert.equal(entry.session.stage, 'awaiting_request');
  assert.equal(entry.message.kind, 'quick_replies');
  if (entry.message.kind !== 'quick_replies') return;
  assert.deepEqual(entry.message.quickReplies.map((item) => item.title), ['VER ESTRUTURA']);
  assert.ok(Buffer.byteLength(entry.message.text, 'utf8') < 200);
  assert.equal(entry.publicReply, 'Te enviei o acesso no Direct 👀');
});

test('reel de sites confirma a entrega e bifurca somente entre empresa própria e vender sites', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites',
  })!;
  assert.equal(entry.session.campaign, 'sites_workshop');
  assert.equal(entry.session.stage, 'awaiting_intent');
  assert.equal(entry.message.kind, 'quick_replies');
  if (entry.message.kind !== 'quick_replies') return;
  assert.match(entry.message.text, /tenho o prompt completo do vídeo aqui/i);
  assert.deepEqual(entry.message.quickReplies.map((item) => item.title), [
    'MINHA EMPRESA',
    'VENDER SITES',
  ]);
  assert.ok(entry.message.quickReplies.every((item) => item.title.length <= 20));
  assert.doesNotMatch(
    JSON.stringify(entry),
    /qual (?:é|e) o seu negócio|cidade|nicho|nível atual|Cliente Pronto|Laboratório|WhatsApp/i,
  );
  assert.match(entry.publicReply, /prompt completo do vídeo.*Direct/i);
});

test('caminho Minha Empresa bloqueia a entrega até confirmar que a pessoa segue', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites-offer',
  })!;
  assert.equal(shouldAdvanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }), true);
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { firstName: 'Ana', followStatus: 'not_following' })!;
  assert.equal(delivery.session.stage, 'awaiting_follow');
  assert.equal(delivery.session.path, 'ready');
  assert.equal(delivery.event, 'website_follow_required');
  assert.equal(delivery.message.kind, 'quick_replies');
  if (delivery.message.kind !== 'quick_replies') return;
  assert.deepEqual(delivery.message.quickReplies, [{
    title: 'JÁ SEGUI',
    payload: 'FLOW:SARAIVA:FOLLOW_CONFIRMED',
  }]);
  assert.doesNotMatch(JSON.stringify(delivery), /\/instagram\/(?:prompt|product)\?/);
});

test('seguir confirmado envia o prompt em texto e somente o link da Biblioteca', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites-sell',
  })!;
  const gated = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'not_following' })!;
  const delivery = advanceInstagramFlow(gated.session, {
    payload: 'FLOW:SARAIVA:FOLLOW_CONFIRMED',
  }, { followStatus: 'following' })!;
  assert.equal(delivery.session.path, 'build');
  assert.equal(delivery.session.stage, 'offering_product');
  assert.equal(delivery.event, 'website_prompt_delivered_after_follow');
  assert.equal(delivery.message.kind, 'text');
  assert.equal(delivery.messages?.length, 2);
  assert.ok(delivery.messages?.slice(0, -1).every((message) => message.kind === 'text'));
  assert.equal(delivery.messages?.at(-1)?.kind, 'link_card');
  const serialized = JSON.stringify(delivery);
  assert.match(serialized, /PROMPT DO VÍDEO — COPIE E COLE/);
  assert.match(serialized, /VER A BIBLIOTECA/);
  assert.match(serialized, /\/instagram\/product\?/);
  assert.doesNotMatch(serialized, /\/instagram\/prompt\?|COPIAR PROMPT/);
  assert.equal((serialized.match(/https?:/g) || []).length, 1);
  assert.throws(() => buildSaraivaAudioScript(delivery.session), /sites_workshop_audio_forbidden/);
});

test('status de follow ausente pede nova verificação sem acusar que a pessoa não segue', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites-unknown-follow',
  })!;
  const gated = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { followStatus: 'unknown' })!;
  assert.equal(gated.session.stage, 'awaiting_follow');
  assert.equal(gated.message.kind, 'quick_replies');
  if (gated.message.kind !== 'quick_replies') return;
  assert.match(gated.message.text, /não consegui confirmar/i);
  assert.doesNotMatch(gated.message.text, /você não (?:me )?segue/i);
});

test('botão recomendado do produto é claro e as três opções respeitam 20 caracteres', () => {
  assert.equal(WEBSITE_PRODUCT_BUTTON_RECOMMENDED, 'VER A BIBLIOTECA');
  assert.equal(WEBSITE_PRODUCT_BUTTON_OPTIONS.length, 3);
  assert.ok(WEBSITE_PRODUCT_BUTTON_OPTIONS.every((title) => title.length <= 20));
  assert.doesNotMatch(WEBSITE_PRODUCT_BUTTON_OPTIONS.join(' '), /gerador/i);
});

test('mantém os destinos assinados esperados pelo handler Lambda publicado', () => {
  const input = {
    correlationId: 'corr-library-production',
    intent: 'ter' as const,
    issuedAt: 1_775_431_200,
    secret: 's'.repeat(32),
  };
  const product = new URL(createStorefrontProductDestinationUrl(input));
  const prompt = new URL(createFreePromptDestinationUrl(input));
  assert.equal(product.pathname, '/quero-o-prompt');
  assert.equal(prompt.pathname, '/prompt-do-video');
  assert.equal(product.searchParams.get('correlationId'), input.correlationId);
  assert.equal(prompt.searchParams.get('sourceSignature'), product.searchParams.get('sourceSignature'));
  assert.match(product.searchParams.get('sourceSignature') || '', /^[a-f0-9]{64}$/);
});

test('pergunta livre antes da escolha responde e reapresenta somente as duas intenções', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  let trustedContext = '';
  assert.equal(shouldAdvanceInstagramFlow(entry.session, {
    text: 'preciso saber programar?',
  }), false);
  const reply = await generateConversationalFlowReply({
    inboundText: 'preciso saber programar?',
    session: entry.session,
    generateReply: async (salesInput) => {
      trustedContext = salesInput.promise.trustedContext;
      return {
        reply: 'Não. O @Sites transforma sua descrição em um site que você pode revisar e refinar.',
        source: 'bedrock',
      };
    },
  });
  assert.equal(reply.message.kind, 'quick_replies');
  if (reply.message.kind !== 'quick_replies') return;
  assert.match(reply.message.text, /não/i);
  assert.deepEqual(reply.message.quickReplies.map((button) => button.title), ['MINHA EMPRESA', 'VENDER SITES']);
  assert.doesNotMatch(trustedContext, /Biblioteca|24 prompts|R\$|19,90|desconto|off|promoção|garantia/i);
  assert.match(trustedContext, /Não use a expressão Gerador de Prompts/i);
  assert.equal(entry.session.stage, 'awaiting_intent');
});

test('texto livre identifica uso na própria empresa sem depender do botão', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const input = { text: 'Quero usar isso para criar o site da minha clínica' };
  assert.equal(shouldAdvanceInstagramFlow(entry.session, input), true);
  const gated = advanceInstagramFlow(entry.session, input, { followStatus: 'not_following' })!;
  assert.equal(gated.session.path, 'ready');
  assert.equal(gated.session.stage, 'awaiting_follow');
});

test('texto livre identifica criação de sites para clientes sem depender do botão', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const input = { text: 'Trabalho criando sites e quero oferecer isso para meus clientes' };
  assert.equal(shouldAdvanceInstagramFlow(entry.session, input), true);
  const delivery = advanceInstagramFlow(entry.session, input, { followStatus: 'following' })!;
  assert.equal(delivery.session.path, 'build');
  assert.equal(delivery.session.stage, 'offering_product');
  assert.equal(delivery.messages?.length, 2);
});

test('pergunta com contexto de negócio não é confundida com escolha de caminho', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  assert.equal(shouldAdvanceInstagramFlow(entry.session, {
    text: 'Isso funciona para o site da minha clínica?',
  }), false);
});

test('negação nunca é tratada como intenção positiva', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  for (const text of [
    'Não quero vender sites para clientes',
    'Não é para minha empresa',
    'Não quero usar isso no meu negócio',
    'Não trabalho com sites para clientes',
    'Eu não trabalho com sites para clientes',
    'Olha, não trabalho com sites para clientes',
    'Na verdade não trabalho criando sites para clientes',
    'Não sei se quero vender sites para clientes',
    'Ainda não decidi se é para minha empresa ou para clientes',
    'Quero usar na minha empresa ou talvez criar para clientes',
  ]) {
    assert.equal(shouldAdvanceInstagramFlow(entry.session, { text }), false, text);
  }
});

test('entende respostas conversacionais comuns nos dois caminhos', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  for (const text of ['Isso é para minha empresa', 'É para o meu negócio']) {
    const step = advanceInstagramFlow(entry.session, { text }, { followStatus: 'following' })!;
    assert.equal(shouldAdvanceInstagramFlow(entry.session, { text }), true, text);
    assert.equal(step.session.path, 'ready', text);
  }
  for (const text of [
    'É para um cliente',
    'Quero fazer um site para um cliente',
    'Trabalho com sites para clientes',
  ]) {
    const step = advanceInstagramFlow(entry.session, { text }, { followStatus: 'following' })!;
    assert.equal(shouldAdvanceInstagramFlow(entry.session, { text }), true, text);
    assert.equal(step.session.path, 'build', text);
  }
});

test('resposta longa preserva inteira a pergunta obrigatória da etapa', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const reply = await generateConversationalFlowReply({
    inboundText: 'preciso saber programar?',
    session: entry.session,
    generateReply: async () => ({
      reply: `${'Você consegue adaptar o projeto aos dados reais do negócio com tranquilidade. '.repeat(5)}Quer continuar?`,
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'quick_replies');
  if (reply.message.kind !== 'quick_replies') return;
  assert.ok(reply.message.text.length <= 320);
  assert.match(reply.message.text, /Você quer usar no site da sua empresa ou criar sites para clientes\?$/i);
});

test('após a entrega o assistente responde a adaptação sem repetir prompt, botões ou link', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { followStatus: 'following' })!;
  assert.equal(shouldAdvanceInstagramFlow(delivery.session, {
    text: 'Como adapto para uma clínica odontológica?',
  }), false);
  const reply = await generateConversationalFlowReply({
    inboundText: 'Como adapto para uma clínica odontológica?',
    session: delivery.session,
    generateReply: async () => ({
      reply: 'Troque o segmento, os serviços e a chamada para agendamento pelos dados reais da clínica. Qual tratamento você quer destacar primeiro?',
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.match(reply.message.text, /dados reais da clínica/i);
  assert.match(reply.message.text, /qual tratamento/i);
  assert.doesNotMatch(reply.message.text, /mensagens acima|botão|Biblioteca/i);
  assert.doesNotMatch(reply.message.text, /https?:\/\//i);
});

test('após a entrega bloqueia Gerador e usa ajuda conversacional segura', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { followStatus: 'following' })!;
  const reply = await generateConversationalFlowReply({
    inboundText: 'como eu uso isso?',
    session: delivery.session,
    generateReply: async () => ({
      reply: 'É um Gerador de Prompts para novos projetos. Quer testar?',
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.doesNotMatch(reply.message.text, /Gerador/i);
  assert.match(reply.message.text, /adaptar o prompt/i);
  assert.equal((reply.message.text.match(/\?/g) || []).length, 1);
});

test('fallback pós-entrega orienta prova social ausente sem inventar depoimentos', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  const reply = await generateConversationalFlowReply({
    inboundText: 'Ele ainda não tem depoimentos. O que eu coloco nessa parte?',
    session: delivery.session,
    generateReply: async () => ({
      reply: 'Use o depoimento: “O melhor site que já contratamos”. Quer colocar essa frase?',
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.match(reply.message.text, /não invente depoimentos/i);
  assert.match(reply.message.text, /portfólio|processo|credenciais/i);
  assert.doesNotMatch(reply.message.text, /Biblioteca|24 prompts/i);
});

test('bloqueia depoimento ditado mesmo sem a palavra depoimento na saída', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  for (const inboundText of [
    'Ele não possui avaliações. O que eu coloco?',
    'A clínica não tem prova social. Pode preencher para mim?',
  ]) {
    const reply = await generateConversationalFlowReply({
      inboundText,
      session: delivery.session,
      generateReply: async () => ({
        reply: 'Coloque: “O melhor site que já contratamos”.',
        source: 'bedrock',
      }),
    });
    assert.equal(reply.message.kind, 'text');
    if (reply.message.kind !== 'text') continue;
    assert.match(reply.message.text, /não invente depoimentos/i);
    assert.doesNotMatch(reply.message.text, /melhor site que já contratamos/i);
  }
});

test('recusa pedido direto para fabricar prova social sem consultar o modelo', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  let called = false;
  for (const inboundText of [
    'Crie um depoimento para colocar no site',
    'Me dá um depoimento',
    'Pode sugerir uma avaliação para o site?',
  ]) {
    const reply = await generateConversationalFlowReply({
      inboundText,
      session: delivery.session,
      generateReply: async () => {
        called = true;
        return { reply: 'Coloque: “O melhor site que já contratamos”.', source: 'bedrock' };
      },
    });
    assert.equal(called, false);
    assert.equal(reply.message.kind, 'text');
    if (reply.message.kind !== 'text') continue;
    assert.match(reply.message.text, /não invente depoimentos/i);
    assert.match(reply.message.text, /prova verdadeira/i);
  }
});

test('fallback pós-entrega responde prazo sem inventar duração', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  let trustedContext = '';
  const reply = await generateConversationalFlowReply({
    inboundText: 'Quanto tempo eu levo para construir isso no Lovable?',
    session: delivery.session,
    generateReply: async (input) => {
      trustedContext = input.promise.trustedContext;
      return {
        reply: 'Você consegue em duas horas. Quer começar?',
        source: 'bedrock',
      };
    },
  });
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.match(reply.message.text, /prazo depende do escopo/i);
  assert.match(reply.message.text, /landing page|várias páginas/i);
  assert.doesNotMatch(reply.message.text, /\b\d+\s*(?:hora|dia)/i);
  assert.match(trustedContext, /não dê prazo numérico/i);
});

test('bloqueia durações escritas em formas não enumeráveis', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  for (const generated of ['Leva quarenta minutos.', 'Você termina em meia hora.']) {
    const reply = await generateConversationalFlowReply({
      inboundText: 'Quanto tempo leva para fazer no Lovable?',
      session: delivery.session,
      generateReply: async () => ({ reply: generated, source: 'bedrock' }),
    });
    assert.equal(reply.message.kind, 'text');
    if (reply.message.kind !== 'text') continue;
    assert.match(reply.message.text, /prazo depende do escopo/i);
    assert.doesNotMatch(reply.message.text, /minutos?|horas?/i);
  }
});

test('pergunta sobre a Biblioteca usa fatos canônicos sem consultar o modelo', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  let called = false;
  const reply = await generateConversationalFlowReply({
    inboundText: 'Quanto custa?',
    session: delivery.session,
    generateReply: async () => {
      called = true;
      return {
        reply: 'A Biblioteca custa R$ 97, inclui 80 prompts e acesso vitalício. Quer comprar?',
        source: 'bedrock',
      };
    },
  });
  assert.equal(called, false);
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.match(reply.message.text, /24 prompts/i);
  assert.match(reply.message.text, /R\$ 19,90/i);
  assert.match(reply.message.text, /acesso permanente/i);
  assert.doesNotMatch(reply.message.text, /R\$ 97|80 prompts|vitalício/i);
  assert.doesNotMatch(reply.message.text, /https?:\/\/|\b[a-z0-9-]+\.com(?:\.br)?\b/i);
});

test('domínio nu gerado após a entrega é bloqueado como segundo link', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  for (const generated of [
    'Veja mais exemplos em bibliotecasecreta.com.br. Qual tipo de restaurante?',
    'Acesse (bibliotecasecreta.com.br). Qual tipo de restaurante?',
  ]) {
    const reply = await generateConversationalFlowReply({
      inboundText: 'Como adapto para um restaurante?',
      session: delivery.session,
      generateReply: async () => ({ reply: generated, source: 'bedrock' }),
    });
    assert.equal(reply.message.kind, 'text');
    if (reply.message.kind !== 'text') continue;
    assert.doesNotMatch(reply.message.text, /bibliotecasecreta\.com\.br/i);
    assert.match(reply.message.text, /adaptar o prompt/i);
  }
});

test('fallback pós-entrega orienta preço pelo escopo sem validar valor inventado', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  const reply = await generateConversationalFlowReply({
    inboundText: 'Quero cobrar R$ 500 por esse site. Está barato?',
    session: delivery.session,
    generateReply: async () => ({
      reply: 'Cobre R$ 2.000. Quer fechar?',
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.match(reply.message.text, /preço depende do escopo/i);
  assert.match(reply.message.text, /páginas, integrações e revisões/i);
  assert.doesNotMatch(reply.message.text, /R\s*\$|\b\d+[.,]?\d*/i);
});

test('bloqueia preço por extenso sem depender de enumerar o número', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  for (const generated of ['Cobre vinte reais para começar.', 'Eu cobraria 500.']) {
    let called = false;
    const reply = await generateConversationalFlowReply({
      inboundText: 'Quanto eu deveria cobrar pelo site?',
      session: delivery.session,
      generateReply: async () => {
        called = true;
        return { reply: generated, source: 'bedrock' };
      },
    });
    assert.equal(called, false);
    assert.equal(reply.message.kind, 'text');
    if (reply.message.kind !== 'text') continue;
    assert.match(reply.message.text, /preço depende do escopo/i);
    assert.doesNotMatch(reply.message.text, /vinte reais|500/i);
  }
});

test('reconhece paráfrases de preço de serviço e nunca consulta o modelo', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  }, { followStatus: 'following' })!;
  for (const inboundText of [
    'Quanto custa fazer um site?',
    'Qual investimento para criar o site?',
    'Quanto cobram por um site?',
  ]) {
    let called = false;
    const reply = await generateConversationalFlowReply({
      inboundText,
      session: delivery.session,
      generateReply: async () => {
        called = true;
        return { reply: 'Em média, 500.', source: 'bedrock' };
      },
    });
    assert.equal(called, false);
    assert.equal(reply.message.kind, 'text');
    if (reply.message.kind !== 'text') continue;
    assert.match(reply.message.text, /preço depende do escopo/i);
    assert.doesNotMatch(reply.message.text, /500/i);
  }
});

test('não repete oferta comercial após a entrega quando a pessoa pede ajuda prática', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { followStatus: 'following' })!;
  const reply = await generateConversationalFlowReply({
    inboundText: 'como eu adapto para meu caso?',
    session: delivery.session,
    generateReply: async () => ({
      reply: 'A Biblioteca tem 24 prompts e custa R$ 19,90. Quer conhecer melhor?',
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.doesNotMatch(reply.message.text, /Biblioteca|24 prompts|R\$|19,90/i);
  assert.match(reply.message.text, /adaptar o prompt/i);
});

test('bloqueia oferta precoce e repetida mesmo quando o modelo usa paráfrases', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const beforeDelivery = await generateConversationalFlowReply({
    inboundText: 'isso serve para clínica?',
    session: entry.session,
    generateReply: async () => ({
      reply: 'Tenho um produto pago para continuar depois. Quer conhecer?',
      source: 'bedrock',
    }),
  });
  assert.equal(beforeDelivery.message.kind, 'quick_replies');
  if (beforeDelivery.message.kind === 'quick_replies') {
    assert.doesNotMatch(beforeDelivery.message.text, /produto pago|versão paga|plano|compra/i);
    assert.match(beforeDelivery.message.text, /site da sua empresa ou criar sites para clientes\?$/i);
  }

  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { followStatus: 'following' })!;
  const afterDelivery = await generateConversationalFlowReply({
    inboundText: 'como adapto para meu caso?',
    session: delivery.session,
    generateReply: async () => ({
      reply: 'O produto pago continua disponível. Quer conhecer?',
      source: 'bedrock',
    }),
  });
  assert.equal(afterDelivery.message.kind, 'text');
  if (afterDelivery.message.kind === 'text') {
    assert.doesNotMatch(afterDelivery.message.text, /produto pago|versão paga|plano|compra/i);
    assert.match(afterDelivery.message.text, /adaptar o prompt/i);
  }
});

test('pergunta técnica com quanto ou valor não autoriza repetir oferta', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { followStatus: 'following' })!;
  for (const inboundText of [
    'Quanto texto eu coloco no prompt?',
    'Qual valor eu devo colocar no campo do serviço?',
    'Qual o valor eu coloco no CTA?',
    'Qual plano eu coloco na seção de preços?',
  ]) {
    const reply = await generateConversationalFlowReply({
      inboundText,
      session: delivery.session,
      generateReply: async () => ({
        reply: 'O produto pago continua disponível. Quer conhecer?',
        source: 'bedrock',
      }),
    });
    assert.equal(reply.message.kind, 'text');
    if (reply.message.kind !== 'text') continue;
    assert.doesNotMatch(reply.message.text, /produto pago|plano|compra/i);
    assert.match(reply.message.text, /adaptar o prompt|preço depende do escopo/i);
    assert.doesNotMatch(reply.message.text, /R\s*\$|\b\d+(?:[.,]\d+)?\s*reais?/i);
  }
});

test('pedido pelo local do conteúdo aponta para a mensagem anterior sem duplicar URL', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { followStatus: 'following' })!;
  let called = false;
  const reply = await generateConversationalFlowReply({
    inboundText: 'Cadê o link e o prompt?',
    session: delivery.session,
    generateReply: async () => {
      called = true;
      return { reply: 'Resposta indevida. Quer continuar?', source: 'bedrock' };
    },
  });
  assert.equal(called, false);
  assert.equal(reply.message.kind, 'text');
  if (reply.message.kind !== 'text') return;
  assert.match(reply.message.text, /prompt completo.*mensagens acima/i);
  assert.match(reply.message.text, /botão.*Biblioteca/i);
  assert.doesNotMatch(reply.message.text, /https?:\/\//i);
});

test('opt-out explícito encerra o fluxo sem confundir frases normais', () => {
  for (const text of ['pare', 'STOP', 'cancelar', 'não tenho interesse', 'não me chame', 'não quero mais', 'sem interesse', 'pare, por favor']) {
    assert.equal(isInstagramFlowOptOut(text), true, text);
  }
  for (const text of ['parece bom', 'não quero perder clientes', 'quero cancelar tarefas']) {
    assert.equal(isInstagramFlowOptOut(text), false, text);
  }
  assert.equal(isInstagramFlowResume('QUERO RETOMAR'), true);
  assert.equal(isInstagramFlowResume('quero saber mais'), false);
});

test('falha de entrega retoma o prompt em texto e o único link da Biblioteca', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { firstName: 'Ana', followStatus: 'following' })!;
  const paused = pauseInstagramFlow(delivery.session).session;
  assert.equal(shouldAdvanceInstagramFlow(paused, {
    payload: 'FLOW:SARAIVA:RETRY',
  }), true);
  const retried = advanceInstagramFlow(paused, {
    payload: 'FLOW:SARAIVA:RETRY',
  }, { firstName: 'Ana', followStatus: 'following' })!;
  assert.equal(retried.event, 'technical_retry_requested');
  assert.equal(retried.session.stage, 'offering_product');
  assert.equal(retried.message.kind, 'text');
  assert.equal(retried.messages?.length, 2);
  const serialized = JSON.stringify(retried.messages);
  assert.match(serialized, /PROMPT DO VÍDEO — COPIE E COLE/);
  assert.match(serialized, /VER A BIBLIOTECA/);
  assert.doesNotMatch(serialized, /\/instagram\/prompt\?|COPIAR PROMPT|Laboratório|áudio/i);
  assert.equal((serialized.match(/https?:/g) || []).length, 1);
});

test('sessão histórica sem fluxo só é retomada após novo inbound e volta à bifurcação correta', () => {
  const recovered = recoverInstagramFlowSessionForInbound(
    WEBSITE_PROMPT_MEDIA_ID,
    undefined,
    {
      now: startedAt,
      correlationId: 'corr-recovered-no-session',
      transport: 'zernio',
      conversationId: 'conversation-recovered',
    },
  );
  assert.ok(recovered);
  assert.equal(recovered.stage, 'awaiting_intent');
  assert.equal(recovered.transport, 'zernio');
  assert.equal(recovered.conversationId, 'conversation-recovered');
  assert.equal(
    recoverInstagramFlowSessionForInbound(PROSPECTING_FLOW_MEDIA_ID, undefined),
    undefined,
  );
});

test('sessão antiga que ofereceu comunidade não afirma que entregou o prompt', () => {
  const legacy = {
    ...createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
      now: startedAt,
      correlationId: 'corr-legacy-community',
    })!.session,
    stage: 'offering_community' as const,
    path: 'build' as const,
    destinationUrl: 'https://example.invalid/old-community',
    communityCtaMessageId: 'old-card',
  };
  assert.equal(shouldAdvanceInstagramFlow(legacy, { text: 'oi' }), true);
  const recovered = advanceInstagramFlow(legacy, { text: 'oi' }, { now: startedAt })!;
  assert.equal(recovered.event, 'legacy_site_flow_recovered');
  assert.equal(recovered.session.stage, 'awaiting_intent');
  assert.equal(recovered.session.path, undefined);
  assert.equal(recovered.session.destinationUrl, undefined);
  assert.equal(recovered.session.communityCtaMessageId, undefined);
  assert.equal(recovered.message.kind, 'quick_replies');
  if (recovered.message.kind !== 'quick_replies') return;
  assert.deepEqual(
    recovered.message.quickReplies.map((item) => item.title),
    ['MINHA EMPRESA', 'VENDER SITES'],
  );
  assert.doesNotMatch(
    JSON.stringify(recovered),
    /WhatsApp|comunidade|Laboratório|prompt gratuito já está liberado/i,
  );
});

test('sessão entregue lembra o prompt em texto e o botão único da Biblioteca', () => {
  const delivered = {
    ...createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
      now: startedAt,
      correlationId: 'corr-delivered-reminder',
    })!.session,
    stage: 'offering_product' as const,
    path: 'ready' as const,
    promptDeliveredAt: startedAt.toISOString(),
  };
  const repeated = advanceInstagramFlow(delivered, { text: 'obrigado' }, { now: startedAt })!;
  assert.equal(repeated.reasonCode, 'prompt_link_already_sent');
  assert.equal(repeated.message.kind, 'text');
  if (repeated.message.kind !== 'text') return;
  assert.match(repeated.message.text, /prompt completo.*mensagens acima/i);
  assert.match(repeated.message.text, /botão.*Biblioteca/i);
  assert.doesNotMatch(repeated.message.text, /Gerador|últimas vagas|lote|80% off|R\$ 97|https?:\/\//i);
});

test('reel de prospecção usa nome confiável no acesso direto', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const step = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SARAIVA:OPEN',
  }, {
    firstName: 'Fellipe',
    profileFacts: [],
  });
  assert.equal(step?.session.stage, 'offering_community');
  assert.equal(step?.session.firstName, 'Fellipe');
  assert.equal(step?.reasonCode, 'community_offer_ready');
  assert.equal(step?.message.kind, 'text');
});

test('reel de prospecção não exige nome antes do acesso direto', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const requested = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:OPEN' });
  assert.equal(requested?.session.stage, 'offering_community');
  assert.equal(requested?.session.firstName, undefined);
  assert.equal(requested?.reasonCode, 'community_offer_ready');
});

test('texto livre não substitui o clique explícito do reel de prospecção', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const repeated = advanceInstagramFlow(entry.session, { text: 'Pode me chamar de carolina' })!;
  assert.equal(repeated.session.stage, 'awaiting_request');
  assert.equal(repeated.session.firstName, undefined);
  assert.equal(shouldAdvanceInstagramFlow(entry.session, { text: 'conseguir mais clientes' }), false);
  assert.equal(shouldAdvanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:OPEN' }), true);
});

test('acesso direto do reel de prospecção preserva a oferta rastreável publicada', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-platform',
  })!;
  const offer = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:OPEN' }, { firstName: 'Ana' })!;
  assert.equal(offer.session.stage, 'offering_community');
  assert.equal(offer.offer?.kind, 'community');
  assert.equal(offer.offer?.path, 'ready');
  assert.equal(offer.offer?.card.buttons.length, 1);
  const urls = offer.offer!.card.buttons
    .filter((button) => button.type === 'web_url')
    .map((button) => button.type === 'web_url' ? button.url : '');
  assert.match(urls[0], /\/instagram\/community\?/);
  assert.match(urls[0], /intent=ter/);
  assert.ok(urls.every((url) => url.includes('correlation=corr-platform')));
});

test('payload antigo de bifurcação não altera o reel de prospecção atual', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-community',
  })!;
  const repeated = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:BUILD' }, { firstName: 'Leo' })!;
  assert.equal(repeated.session.stage, 'awaiting_request');
  assert.equal(repeated.offer, undefined);
  assert.equal(repeated.message.kind, 'quick_replies');
});

test('perfil oficial usa no máximo dois fatos e bloqueia sensível no áudio', () => {
  const brief = buildSafeProfileBrief({
    id: '1',
    name: 'ANA 123',
    username: 'ana',
    biography: 'Consultora de vendas e saúde',
    website: 'https://example.com/oferta',
    accountType: 'BUSINESS',
  });
  assert.equal(brief.firstName, undefined);
  assert.equal(brief.facts.length, 2);
  assert.equal(brief.facts.some((fact) => fact.field === 'biography'), false);
  assert.equal(brief.facts[0].allowedInAudio, false);
  assert.equal(brief.facts[1].allowedInAudio, true);
});

test('script usa apenas fato permitido e não menciona métricas de perfil', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const script = buildSaraivaAudioScript({
    ...entry.session,
    stage: 'offering_community',
    path: 'ready',
    qualification: { goal: 'prospect_clients', business: 'Consultoria' },
    firstName: 'Ana',
    profileFacts: [{
      field: 'website',
      value: 'você mantém o site example.com',
      source: 'meta_official_profile',
      evidence: 'official',
      confidence: 0.95,
      allowedInAudio: true,
    }],
  });
  assert.match(script, /^Ana,/);
  assert.match(script, /example\.com/);
  assert.match(script, /Laboratório Saraiva/i);
  assert.match(script, /entra direto na plataforma/i);
  assert.doesNotMatch(script, /exemplo real/i);
  assert.match(script, /Faz sentido pra você\?$/);
  assert.doesNotMatch(script, /seguidores|renda|aparência/i);
});

test('script do caminho aprender incorpora objetivo livre sem duplicar verbos', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const script = buildSaraivaAudioScript({
    ...entry.session,
    stage: 'offering_community',
    path: 'build',
    qualification: { desiredOutcome: 'Criar produtos e vender' },
    firstName: 'Mateus',
  });

  assert.match(script, /^Mateus, você quer criar produtos e vender\./);
  assert.doesNotMatch(script, /construir criar/i);
  assert.match(script, /Faz sentido pra você\?$/);
});

test('script do caminho ferramenta incorpora objetivo verbal sem duplicar verbos', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const script = buildSaraivaAudioScript({
    ...entry.session,
    stage: 'offering_community',
    path: 'ready',
    qualification: { desiredOutcome: 'Prospectar clientes' },
    firstName: 'Ana',
  });

  assert.match(script, /^Ana, se você quer prospectar clientes/);
  assert.doesNotMatch(script, /colocar prospectar|colocar conseguir/i);
  assert.match(script, /Faz sentido pra você\?$/);
});

test('nenhuma mensagem do fluxo contém rota humana proibida', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const ready = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:READY' }, { firstName: 'Ana' })!;
  const build = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:BUILD' }, { firstName: 'Ana' })!;
  const serialized = JSON.stringify([entry, ready, build]);
  assert.doesNotMatch(serialized, /falar com saraiva|payload\.human|handoff|atendimento humano/i);
});

test('outros posts continuam sem esse funil', () => {
  assert.equal(createInstagramCommentFlow('18000000000000000'), undefined);
});

test('redirecionamento aceita somente intenção, correlação e assinatura correspondentes', () => {
  const secret = 'tracking-secret';
  const signature = createHmac('sha256', secret)
    .update('community:ter:corr-1')
    .digest('hex');
  assert.equal(
    verifyTrackedFlowSignature('community', 'ter', 'corr-1', signature, secret),
    true,
  );
  assert.equal(
    verifyTrackedFlowSignature('example', 'ter', 'corr-1', signature, secret),
    false,
  );
  assert.equal(
    verifyTrackedFlowSignature('community', 'aprender', 'corr-1', signature, secret),
    false,
  );
  const promptSignature = createHmac('sha256', secret)
    .update('prompt:ter:corr-1')
    .digest('hex');
  assert.equal(verifyTrackedFlowSignature('prompt', 'ter', 'corr-1', promptSignature, secret), true);
  assert.equal(verifyTrackedFlowSignature('product', 'ter', 'corr-1', promptSignature, secret), false);
});

test('destino final preserva exatamente a URL configurada', () => {
  const previous = process.env.INSTAGRAM_COMMUNITY_DESTINATION_URL;
  process.env.INSTAGRAM_COMMUNITY_DESTINATION_URL = 'https://saraiva.ai/acesso';
  try {
    const session = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
      now: startedAt,
      correlationId: 'corr-whatsapp',
    })!.session;
    assert.equal(
      createCommunityDestinationUrl(session),
      'https://saraiva.ai/acesso',
    );
  } finally {
    if (previous === undefined) delete process.env.INSTAGRAM_COMMUNITY_DESTINATION_URL;
    else process.env.INSTAGRAM_COMMUNITY_DESTINATION_URL = previous;
  }
});

test('dúvida livre recebe resposta e retoma a mesma etapa sem perder os botões', async () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const pathSession = {
    ...entry.session,
    stage: 'awaiting_intent' as const,
    firstName: 'Ana',
  };
  assert.equal(shouldAdvanceInstagramFlow(pathSession, {
    text: 'isso funciona para advogados?',
  }), false);
  const reply = await generateConversationalFlowReply({
    inboundText: 'isso funciona para advogados?',
    session: pathSession,
    generateReply: async () => ({
      reply: 'Sim, você pode adaptar a busca e a abordagem ao seu nicho. Quer escolher um caminho?',
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'quick_replies');
  if (reply.message.kind !== 'quick_replies') return;
  assert.match(reply.message.text, /adaptar a busca/i);
  assert.match(reply.message.text, /quer ter uma ferramenta dessas ou aprender a criar estruturas assim\?$/i);
  assert.deepEqual(reply.message.quickReplies.map((item) => item.title), [
    'QUERO TER UMA',
    'QUERO APRENDER',
  ]);
  assert.equal(pathSession.stage, 'awaiting_intent');
});

test('resposta de qualificação avança, mas pergunta mantém a etapa', () => {
  const session = {
    ...createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!.session,
    stage: 'awaiting_business' as const,
    path: 'ready' as const,
  };
  assert.equal(shouldAdvanceInstagramFlow(session, { text: 'Clínica odontológica' }), true);
  assert.equal(shouldAdvanceInstagramFlow(session, { text: 'isso serve para clínica?' }), false);
  assert.equal(resumeInstagramFlowMessage(session).kind, 'text');
});

test('serializa áudio, quick replies e card no formato da Graph API', async () => {
  process.env.IG_ACCESS_TOKEN ||= 'test-token';
  const { serializeInteractiveMessage } = await import('../src/instagram/client.js');

  assert.deepEqual(serializeInteractiveMessage({
    kind: 'audio',
    url: 'https://signed.example/audio.mp3',
  }), {
    attachment: {
      type: 'audio',
      payload: { url: 'https://signed.example/audio.mp3', is_reusable: false },
    },
  });

  assert.deepEqual(serializeInteractiveMessage({
    kind: 'quick_replies',
    text: 'Escolha:',
    quickReplies: [{ title: 'QUERO', payload: 'FLOW:TEST:OPEN' }],
  }), {
    text: 'Escolha:',
    quick_replies: [{
      content_type: 'text',
      title: 'QUERO',
      payload: 'FLOW:TEST:OPEN',
    }],
  });
});
