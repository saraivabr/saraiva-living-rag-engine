import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  advanceInstagramFlow,
  createCommunityDestinationUrl,
  createInstagramCommentFlow,
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
  assert.match(entry.message.text, /vou te entregar o prompt do vídeo/i);
  assert.deepEqual(entry.message.quickReplies.map((item) => item.title), [
    'MINHA EMPRESA',
    'VENDER SITES',
  ]);
  assert.ok(entry.message.quickReplies.every((item) => item.title.length <= 20));
  assert.doesNotMatch(
    JSON.stringify(entry),
    /qual (?:é|e) o seu negócio|cidade|nicho|nível atual|Cliente Pronto|Laboratório|WhatsApp|R\$19,90/i,
  );
  assert.match(entry.publicReply, /entregar o prompt/i);
});

test('caminho Minha Empresa entrega o prompt gratuito antes da única oferta de R$ 9,97', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites-offer',
  })!;
  assert.equal(shouldAdvanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }), true);
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { firstName: 'Ana' })!;
  assert.equal(delivery.session.stage, 'offering_product');
  assert.equal(delivery.session.path, 'ready');
  assert.equal(delivery.event, 'website_prompt_delivered');
  assert.equal(delivery.reasonCode, 'free_prompt_before_product');
  assert.equal(delivery.offer, undefined);
  assert.equal(delivery.messages?.length, 4);
  const serialized = JSON.stringify(delivery.messages);
  const promptIndex = serialized.indexOf('COPIAR PROMPT');
  const productIndex = serialized.indexOf('Gerador de Prompts — R$ 9,97');
  assert.ok(promptIndex >= 0 && productIndex > promptIndex);
  assert.match(serialized, /site da sua empresa/i);
  assert.match(serialized, /\/instagram\/prompt\?/);
  assert.match(serialized, /\/instagram\/product\?/);
  assert.doesNotMatch(serialized, /WhatsApp|comunidade|Laboratório|consultoria|áudio/i);
  assert.throws(() => buildSaraivaAudioScript(delivery.session), /sites_workshop_audio_forbidden/);
});

test('caminho Vender Sites adapta contexto e oferta sem questionário nem promessa exagerada', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites-sell',
  })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:SELL',
  })!;
  assert.equal(delivery.session.path, 'build');
  const serialized = JSON.stringify(delivery.messages);
  assert.match(serialized, /potenciais clientes/i);
  assert.match(serialized, /outros nichos e clientes/i);
  assert.doesNotMatch(serialized, /enriquecer|renda|garant|clientes garantidos|WhatsApp|Laboratório/i);
});

test('botão recomendado do produto é claro e as três opções respeitam 20 caracteres', () => {
  assert.equal(WEBSITE_PRODUCT_BUTTON_RECOMMENDED, 'VER GERADOR');
  assert.equal(WEBSITE_PRODUCT_BUTTON_OPTIONS.length, 3);
  assert.ok(WEBSITE_PRODUCT_BUTTON_OPTIONS.every((title) => title.length <= 20));
});

test('pergunta livre antes da escolha responde e reapresenta somente as duas intenções', async () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  assert.equal(shouldAdvanceInstagramFlow(entry.session, {
    text: 'preciso saber programar?',
  }), false);
  const reply = await generateConversationalFlowReply({
    inboundText: 'preciso saber programar?',
    session: entry.session,
    generateReply: async () => ({
      reply: 'Não. O @Sites transforma sua descrição em um site que você pode revisar e refinar.',
      source: 'bedrock',
    }),
  });
  assert.equal(reply.message.kind, 'quick_replies');
  if (reply.message.kind !== 'quick_replies') return;
  assert.match(reply.message.text, /não/i);
  assert.deepEqual(reply.message.quickReplies.map((button) => button.title), ['MINHA EMPRESA', 'VENDER SITES']);
  assert.equal(entry.session.stage, 'awaiting_intent');
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

test('falha de entrega retoma os quatro passos sem introduzir áudio ou outra oferta', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const delivery = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:INTENT:OWN',
  }, { firstName: 'Ana' })!;
  const paused = pauseInstagramFlow(delivery.session).session;
  assert.equal(shouldAdvanceInstagramFlow(paused, {
    payload: 'FLOW:SARAIVA:RETRY',
  }), true);
  const retried = advanceInstagramFlow(paused, {
    payload: 'FLOW:SARAIVA:RETRY',
  }, { firstName: 'Ana' })!;
  assert.equal(retried.event, 'technical_retry_requested');
  assert.equal(retried.session.stage, 'offering_product');
  assert.equal(retried.messages?.length, 4);
  assert.match(JSON.stringify(retried.messages), /COPIAR PROMPT/);
  assert.doesNotMatch(JSON.stringify(retried.messages), /WhatsApp|Laboratório|áudio/i);
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

test('lembrete de oferta só é usado quando a entrega gratuita tem checkpoint', () => {
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
  assert.equal(repeated.reasonCode, 'product_cta_already_sent');
  assert.equal(repeated.message.kind, 'text');
  if (repeated.message.kind !== 'text') return;
  assert.match(repeated.message.text, /prompt gratuito já está liberado/i);
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
