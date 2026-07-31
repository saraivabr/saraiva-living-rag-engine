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
  resumeInstagramFlowMessage,
  SARAIVA_FLOW_ID,
  shouldAdvanceInstagramFlow,
  verifyTrackedFlowSignature,
} from '../src/instagram/automationFlow.js';
import { generateConversationalFlowReply } from '../src/instagram/conversationalFlow.js';
import {
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../src/campaignTrigger.js';
import { buildSafeProfileBrief } from '../src/instagram/profilePersonalization.js';
import { buildSaraivaAudioScript } from '../src/instagram/personalizedOffer.js';

const startedAt = new Date('2026-07-30T12:00:00.000Z');

test('comentário SARAIVA abre os dois caminhos prometidos no Reel', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    now: startedAt,
    correlationId: 'anonymous-test',
  });
  assert.ok(entry);
  assert.equal(entry.session.id, SARAIVA_FLOW_ID);
  assert.equal(entry.session.stage, 'awaiting_intent');
  assert.equal(entry.message.kind, 'quick_replies');
  if (entry.message.kind !== 'quick_replies') return;
  assert.deepEqual(entry.message.quickReplies.map((item) => item.title), [
    'QUERO TER UMA',
    'QUERO APRENDER',
  ]);
  assert.ok(Buffer.byteLength(entry.message.text, 'utf8') < 200);
  assert.equal(entry.publicReply, 'Te enviei duas opções no Direct.');
});

test('reel de sites abre fluxo direto sem perguntas de qualificação', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites',
  })!;
  assert.equal(entry.session.campaign, 'sites_workshop');
  assert.equal(entry.session.stage, 'awaiting_request');
  assert.equal(entry.message.kind, 'quick_replies');
  if (entry.message.kind !== 'quick_replies') return;
  assert.match(entry.message.text, /criar um site profissional com o ChatGPT/i);
  assert.deepEqual(entry.message.quickReplies, [{
    title: 'CRIAR MEU SITE',
    payload: 'FLOW:SITES:OPEN',
  }]);
  assert.doesNotMatch(
    JSON.stringify(entry),
    /qual (?:é|e) o seu negócio|cidade|nicho|nível atual|Cliente Pronto|loja\.saraiva\.ai|R\$19,90/i,
  );
});

test('um clique no fluxo de sites envia áudio e CTA direto para o WhatsApp', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-sites-offer',
  })!;
  assert.equal(shouldAdvanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:OPEN',
  }), true);
  const offer = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:OPEN',
  }, { firstName: 'Ana' })!;
  assert.equal(offer.session.stage, 'offering_community');
  assert.equal(offer.session.path, 'build');
  assert.equal(offer.event, 'site_creation_confirmed');
  assert.equal(offer.offer?.kind, 'community');
  assert.deepEqual(offer.offer?.card.buttons.map((button) => button.title), [
    'CRIAR MEU SITE NO WHATSAPP',
  ]);
  const script = buildSaraivaAudioScript(offer.session);
  assert.match(script, /^Ana,/);
  assert.match(script, /@Sites/);
  assert.match(script, /prompt-base/);
  assert.match(script, /Faz sentido pra você\?$/);
  assert.doesNotMatch(script, /qual|cidade|nicho|preço|checkout/i);
});

test('pergunta livre no fluxo de sites responde e reapresenta o mesmo botão', async () => {
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
  assert.deepEqual(reply.message.quickReplies.map((button) => button.title), ['CRIAR MEU SITE']);
  assert.equal(entry.session.stage, 'awaiting_request');
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

test('falha do card no reel de sites retoma o áudio e o card com um único retry', () => {
  const entry = createInstagramCommentFlow(WEBSITE_PROMPT_MEDIA_ID, { now: startedAt })!;
  const offer = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SITES:OPEN',
  }, { firstName: 'Ana' })!;
  const paused = pauseInstagramFlow(offer.session).session;
  assert.equal(shouldAdvanceInstagramFlow(paused, {
    payload: 'FLOW:SARAIVA:RETRY',
  }), true);
  const retried = advanceInstagramFlow(paused, {
    payload: 'FLOW:SARAIVA:RETRY',
  }, { firstName: 'Ana' })!;
  assert.equal(retried.event, 'technical_retry_requested');
  assert.equal(retried.offer?.kind, 'community');
  assert.equal(retried.offer?.card.kind, 'link_card');
  assert.equal(retried.offer?.card.buttons[0]?.title, 'CRIAR MEU SITE NO WHATSAPP');
});

test('escolha consulta nome confiável e pede o objetivo', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const step = advanceInstagramFlow(entry.session, {
    payload: 'FLOW:SARAIVA:READY',
  }, {
    firstName: 'Fellipe',
    profileFacts: [],
  });
  assert.equal(step?.session.stage, 'awaiting_goal');
  assert.equal(step?.reasonCode, 'intent_selected');
  assert.equal(step?.message.kind, 'text');
});

test('sem nome confiável pergunta diretamente antes de oferecer', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const requested = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:READY' });
  assert.equal(requested?.session.stage, 'awaiting_name');
  assert.equal(requested?.reasonCode, 'name_confirmation_required');

  const named = advanceInstagramFlow(requested!.session, { text: 'bruna saraiva' });
  assert.equal(named?.session.firstName, 'Bruna');
  assert.equal(named?.session.stage, 'awaiting_goal');
});

test('nome em frase natural e caminhos digitados avançam sem perder o trilho', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, { now: startedAt })!;
  const requested = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:READY' })!;
  const named = advanceInstagramFlow(requested.session, { text: 'Pode me chamar de carolina' })!;
  assert.equal(named.session.firstName, 'Carolina');
  assert.equal(named.session.stage, 'awaiting_goal');
  assert.equal(named.session.path, 'ready');
  assert.equal(shouldAdvanceInstagramFlow(named.session, { text: 'conseguir mais clientes' }), true);
});

test('ramo ferramenta pronta qualifica e envia direto para a comunidade no WhatsApp', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-platform',
  })!;
  const path = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:READY' }, { firstName: 'Ana' })!;
  const offer = advanceInstagramFlow(path.session, { text: 'conseguir clientes para minha consultoria' })!;
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

test('ramo aprender termina no mesmo convite rastreável do WhatsApp', () => {
  const entry = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
    now: startedAt,
    correlationId: 'corr-community',
  })!;
  const path = advanceInstagramFlow(entry.session, { payload: 'FLOW:SARAIVA:BUILD' }, { firstName: 'Leo' })!;
  const offer = advanceInstagramFlow(path.session, { text: 'Criar um sistema de prospecção' })!;
  assert.equal(offer.offer?.path, 'build');
  assert.deepEqual(offer?.offer?.card.buttons.map((button) => button.title), [
    'ENTRAR NA COMUNIDADE',
  ]);
  assert.equal(offer.session.stage, 'offering_community');
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
  assert.match(script, /comunidade gratuita do WhatsApp/i);
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

  assert.match(script, /^Ana, pelo que você me falou, você quer prospectar clientes/);
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
});

test('destino final preserva exatamente o convite do WhatsApp', () => {
  const previous = process.env.INSTAGRAM_WHATSAPP_COMMUNITY_URL;
  process.env.INSTAGRAM_WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/Invite123?s=cl&p=i&ilr=2';
  try {
    const session = createInstagramCommentFlow(PROSPECTING_FLOW_MEDIA_ID, {
      now: startedAt,
      correlationId: 'corr-whatsapp',
    })!.session;
    assert.equal(
      createCommunityDestinationUrl(session),
      'https://chat.whatsapp.com/Invite123?s=cl&p=i&ilr=2',
    );
  } finally {
    if (previous === undefined) delete process.env.INSTAGRAM_WHATSAPP_COMMUNITY_URL;
    else process.env.INSTAGRAM_WHATSAPP_COMMUNITY_URL = previous;
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
