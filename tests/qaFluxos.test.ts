import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditarCampanha,
  auditarCatalogo,
  campanhasSemCaminho,
  CAMINHOS_PADRAO,
} from '../src/qa/auditarFluxos.js';
import { CAMPANHAS, campanhaPorMedia, formatarPreco } from '../src/catalogo/campanhas.js';
import { WEBSITE_PROMPT_MEDIA_ID } from '../src/campaignTrigger.js';

test('o funil de sites entrega o prompt e não tem problema ALTO', () => {
  const relatorio = auditarCampanha(
    WEBSITE_PROMPT_MEDIA_ID,
    [...CAMINHOS_PADRAO[WEBSITE_PROMPT_MEDIA_ID]],
  );

  assert.ok(relatorio.passos.some((p) => p.entregou), 'o prompt precisa ser entregue');
  const altos = relatorio.achados.filter((a) => a.gravidade === 'ALTO');
  assert.deepEqual(altos, [], `regressão no funil de sites: ${JSON.stringify(altos, null, 2)}`);
});

test('o prompt sai como texto no Direct, antes de qualquer oferta', () => {
  const relatorio = auditarCampanha(
    WEBSITE_PROMPT_MEDIA_ID,
    [...CAMINHOS_PADRAO[WEBSITE_PROMPT_MEDIA_ID]],
  );
  const entrega = relatorio.passos.findIndex((p) => p.entregou);
  const oferta = relatorio.passos.findIndex((p) => p.ofertou);

  assert.ok(entrega > -1);
  // Cobrar antes de entregar o que o post prometeu é o erro que já custou
  // 22 cliques indo parar numa página de venda.
  assert.ok(oferta === -1 || oferta >= entrega, 'ofertou antes de entregar');
});

test('toda campanha ativa do catálogo tem caminho de QA', () => {
  assert.deepEqual(campanhasSemCaminho(CAMINHOS_PADRAO), []);
});

test('nenhuma entrega gratuita aponta para página de venda', () => {
  const proibido = /quero-o-prompt|checkout|comprar|assinar/iu;
  for (const c of CAMPANHAS) {
    if (!c.promessa.gratuito || !c.promessa.url) continue;
    assert.doesNotMatch(
      c.promessa.url,
      proibido,
      `${c.id} anuncia entrega gratuita apontando para venda`,
    );
  }
});

test('um produto tem um nome e um preço só', () => {
  const precos = new Map<string, Set<number>>();
  for (const c of CAMPANHAS) {
    if (!c.oferta) continue;
    const set = precos.get(c.oferta.produto) ?? new Set<number>();
    set.add(c.oferta.precoCentavos);
    precos.set(c.oferta.produto, set);
  }
  for (const [produto, valores] of precos) {
    assert.equal(
      valores.size,
      1,
      `${produto} declarado com ${[...valores].map(formatarPreco).join(' e ')}`,
    );
  }
});

test('dois posts diferentes nunca compartilham o mesmo mediaId', () => {
  const vistos = new Set<string>();
  for (const c of CAMPANHAS) {
    assert.ok(!vistos.has(c.mediaId), `${c.mediaId} declarado duas vezes`);
    vistos.add(c.mediaId);
  }
});

test('a auditoria de catálogo não inventa problema onde não existe', () => {
  const achados = auditarCatalogo();
  // As pendências do catálogo são declaradas de propósito e viram MEDIO.
  // Qualquer ALTO aqui é divergência real entre declaração e código.
  const altos = achados.filter((a) => a.gravidade === 'ALTO');
  assert.deepEqual(altos, [], `divergência catálogo x código: ${JSON.stringify(altos, null, 2)}`);
});

test('o catálogo encontra a campanha pelo id do post', () => {
  const c = campanhaPorMedia(WEBSITE_PROMPT_MEDIA_ID);
  assert.equal(c?.id, 'prompt-de-sites');
  assert.equal(c?.oferta?.precoCentavos, 1_990);
  assert.equal(formatarPreco(c!.oferta!.precoCentavos), 'R$ 19,90');
});
