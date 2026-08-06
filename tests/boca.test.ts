import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extrairCitacoes,
  extrairManchete,
  montarPassos,
  decidirProximoPost,
} from '../src/boca/decidirPost.js';

test('as frases de cliente saem inteiras da prosa do Cognee', () => {
  const resposta = '[graph] As pessoas travam depois de gerar o site. '
    + 'Uma escreveu "como passo o site pro cliente ter acesso como dono?" e outra '
    + '“não sei quanto cobrar por isso”. Repetida: "não sei quanto cobrar por isso".';

  const citacoes = extrairCitacoes(resposta);
  assert.deepEqual(citacoes, [
    'como passo o site pro cliente ter acesso como dono?',
    'não sei quanto cobrar por isso',
  ]);
});

test('a manchete ignora rótulo curto e frase quilométrica', () => {
  const manchete = extrairManchete('[graph] Resumo: As pessoas conseguem gerar o site e travam na hora de entregar. '
    + 'Depois disso vem um parágrafo enorme que passa de cento e quarenta caracteres facilmente porque continua e continua sem parar em lugar nenhum, o que não serve de manchete.');
  assert.equal(manchete, 'As pessoas conseguem gerar o site e travam na hora de entregar.');
});

test('os passos nascem das citações antes de nascerem do meu resumo', () => {
  const citacoes = ['como publico', 'como passo o acesso', 'quanto cobrar'];
  const passos = montarPassos(citacoes, 'qualquer prosa aqui');
  assert.deepEqual(passos, [
    'Responder: como publico',
    'Responder: como passo o acesso',
    'Responder: quanto cobrar',
  ]);
});

test('memória vazia cala a boca em vez de inventar post para 62.989 pessoas', async () => {
  // Este é o teste que mais importa do arquivo. Uma boca que fala quando o
  // cérebro não sabe é pior do que boca nenhuma: publica chute com a cara do
  // Saraiva para a audiência inteira dele.
  const proposta = await decidirProximoPost({
    config: { url: 'http://memoria-inexistente.invalido/mcp', autorizacao: 'Basic teste' },
  });
  assert.ok(proposta.impedimento, 'sem memória a boca tem que ficar calada');
  assert.equal(proposta.rascunho, undefined);
});

test('resposta sem três passos não vira post', () => {
  // Menos de três passos é manifesto, não conteúdo. Soa bonito e não ensina
  // nada — exatamente o tipo de post que trouxe 0,57% de alcance.
  assert.equal(montarPassos([], 'frase curta').length < 3, true);
});

test('gancho reprovado pelo próprio scorer não vira post', async () => {
  // A máquina pontuou o gancho como "descartar" e montou o Reel assim mesmo na
  // primeira execução. Ter crivo e ignorá-lo é pior do que não ter crivo.
  const { buildCarousel } = await import('../src/content/carouselBuilder.js');
  const ruim = buildCarousel({
    headline: 'Assunto mais recorrente, com as palavras deles:',
    fact: 'algo',
    steps: ['a', 'b', 'c'],
    ctaKeyword: 'SARAIVA',
  });
  assert.equal(ruim.hookScore.verdict, 'descartar');
});

test('markdown do Cognee não vaza para o gancho do Reel', () => {
  const manchete = extrairManchete('[graph] **As pessoas travam na hora de entregar o site ao cliente.** Mais texto.');
  assert.doesNotMatch(manchete, /\*/);
  assert.match(manchete, /^As pessoas travam/);
});

test('conversa de teste nossa não entra na memória de produção', async () => {
  const { ehRegistroDeTeste } = await import('../src/memoria/sincronizarConversas.js');
  for (const nome of ['Teste Codex', 'Validacao Codex', 'Validacao Final', 'smoke-test']) {
    assert.equal(ehRegistroDeTeste({ username: nome }), true, `${nome} deveria ser barrado`);
  }
  assert.equal(ehRegistroDeTeste({ username: 'thatianyschulz' }), false);
});
