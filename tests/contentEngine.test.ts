import assert from 'node:assert/strict';
import test from 'node:test';
import { rankHooks, scoreHook } from '../src/content/hookFormula.js';
import { buildCarousel } from '../src/content/carouselBuilder.js';
import { ingestFindings, rankPautas, draftFromPauta } from '../src/content/pipeline.js';

const VENCEDOR = '🚨 A META ACABOU DE COLOCAR "FUNCIONÁRIOS DE IA" DENTRO DO WHATSAPP BUSINESS!';
const PERDEDOR = 'Nem toda IA serve pra mesma coisa.';

test('o gancho de 69.317 de alcance pontua acima do de 73', () => {
  const bom = scoreHook(VENCEDOR);
  const ruim = scoreHook(PERDEDOR);
  assert.ok(bom.total > ruim.total, `${bom.total} deveria superar ${ruim.total}`);
  assert.equal(bom.verdict, 'publicar');
  assert.equal(ruim.verdict, 'descartar');
});

test('aforismo e reprovado; o mesmo tema com numero e fato passa', () => {
  assert.equal(scoreHook('Nem toda IA serve pra mesma coisa.').breakdown.aforismo, -30);
  const reescrito = scoreHook('A META LIBEROU 3 MODOS DE IA NO WHATSAPP BUSINESS HOJE');
  assert.equal(reescrito.breakdown.aforismo, undefined);
  assert.equal(reescrito.verdict, 'publicar');
});

test('pergunta na abertura e penalizada', () => {
  assert.equal(scoreHook('VOCE JA VIU O QUE A META FEZ COM O WHATSAPP?').breakdown.pergunta, -25);
});

test('emoji de alerta nao pontua: aparecia igual nos melhores e nos piores', () => {
  const com = scoreHook('🚨 O WHATSAPP MUDOU O JOGO');
  const sem = scoreHook('O WHATSAPP MUDOU O JOGO');
  assert.equal(com.total, sem.total);
});

test('rankHooks ordena do mais forte para o mais fraco', () => {
  const ordenado = rankHooks([
    { headline: PERDEDOR },
    { headline: VENCEDOR },
  ]);
  assert.equal(ordenado[0].headline, VENCEDOR);
});

test('carrossel entrega 10 slides com o bloco salvavel nos 7-9', () => {
  const draft = buildCarousel({
    headline: VENCEDOR,
    fact: 'A Meta liberou agentes de IA nativos dentro do WhatsApp Business.',
    whoLoses: 'Quem responde cliente no braco depois das 18h',
    steps: [
      'Abra o WhatsApp Business e ative o agente em Ferramentas.',
      'Cole seu catalogo e as 10 perguntas que mais chegam.',
      'Coloque um humano para revisar as 20 primeiras conversas.',
    ],
    ctaKeyword: 'agente',
  });
  assert.equal(draft.slides.length, 10);
  assert.deepEqual(draft.slides.slice(6, 9).map((s) => s.role), ['passo 1', 'passo 2', 'passo 3']);
  assert.equal(draft.slides[9].role, 'cta');
  assert.match(draft.slides[9].text, /comenta AGENTE/u);
  assert.equal(draft.ctaKeyword, 'AGENTE');
});

test('carrossel sem tres passos avisa que virou manifesto', () => {
  const draft = buildCarousel({
    headline: VENCEDOR,
    fact: 'A Meta liberou agentes de IA no WhatsApp Business.',
    steps: ['unico passo'],
    ctaKeyword: 'agente',
  });
  assert.equal(draft.slides.length, 10);
  assert.ok(draft.warnings.some((w) => /manifesto ilustrado/u.test(w)));
  assert.ok(draft.slides.some((s) => s.text === '[FALTA PASSO CONCRETO]'));
});

test('legenda fica na faixa de 400 a 900 caracteres', () => {
  const draft = buildCarousel({
    headline: VENCEDOR,
    fact: 'A Meta liberou agentes de IA nativos dentro do WhatsApp Business para pequenos negocios no Brasil.',
    whoLoses: 'Quem responde cliente no braco depois das 18h e perde venda de madrugada',
    steps: [
      'Abra o WhatsApp Business e ative o agente dentro de Ferramentas de negocio.',
      'Cole seu catalogo e as 10 perguntas que mais chegam no seu direct hoje.',
      'Coloque um humano para revisar as 20 primeiras conversas antes de soltar.',
    ],
    ctaKeyword: 'agente',
  });
  assert.ok(draft.captionLength >= 400 && draft.captionLength <= 900,
    `legenda com ${draft.captionLength} chars fora da faixa util`);
  assert.deepEqual(draft.warnings, []);
  assert.equal(draft.hashtags.length, 5);
});

test('ingestFindings achata JSON aninhado e remove duplicata', () => {
  const findings = ingestFindings({
    results: [
      { platform: 'reddit', items: [{ title: 'A META LANCOU AGENTES NO WHATSAPP', upvotes: 900, url: 'https://a' }] },
      { platform: 'hn', items: [{ title: 'a meta lancou agentes no whatsapp', points: 40 }] },
      { platform: 'x', items: [{ title: 'curto' }] },
    ],
  });
  assert.equal(findings.length, 1, 'duplicata e titulo curto devem sair');
  assert.equal(findings[0].engagement, 900);
  assert.equal(findings[0].url, 'https://a');
});

test('prioridade combina gancho e tracao, com o gancho pesando mais', () => {
  const ranked = rankPautas([
    { headline: 'Nem toda IA serve pra mesma coisa hoje em dia', engagement: 1000 },
    { headline: 'A META LIBEROU 3 AGENTES DE IA NO WHATSAPP HOJE', engagement: 10 },
  ]);
  assert.match(ranked[0].headline, /META LIBEROU/u);
});

test('draft so libera para a fila se politica e gancho passarem', () => {
  const [pauta] = rankPautas([{ headline: VENCEDOR, engagement: 100 }]);
  const ok = draftFromPauta(pauta, {
    fact: 'A Meta liberou agentes de IA nativos dentro do WhatsApp Business para pequenos negocios no Brasil.',
    whoLoses: 'Quem responde cliente no braco depois das 18h e perde venda de madrugada',
    steps: [
      'Abra o WhatsApp Business e ative o agente dentro de Ferramentas de negocio.',
      'Cole seu catalogo e as 10 perguntas que mais chegam no seu direct hoje.',
      'Coloque um humano para revisar as 20 primeiras conversas antes de soltar.',
    ],
    ctaKeyword: 'agente',
  }, '2026-08-06T17:30:00.000Z');
  assert.equal(ok.readyToQueue, true);

  const foraDaJanela = draftFromPauta(pauta, {
    fact: 'A Meta liberou agentes de IA nativos dentro do WhatsApp Business para pequenos negocios no Brasil.',
    whoLoses: 'Quem responde cliente no braco depois das 18h e perde venda de madrugada',
    steps: [
      'Abra o WhatsApp Business e ative o agente dentro de Ferramentas de negocio.',
      'Cole seu catalogo e as 10 perguntas que mais chegam no seu direct hoje.',
      'Coloque um humano para revisar as 20 primeiras conversas antes de soltar.',
    ],
    ctaKeyword: 'agente',
  }, '2026-08-07T02:00:00.000Z');
  assert.equal(foraDaJanela.readyToQueue, false, '23h de SP deve barrar');
});
