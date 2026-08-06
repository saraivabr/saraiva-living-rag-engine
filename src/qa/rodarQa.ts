import {
  auditarCampanha,
  auditarCatalogo,
  campanhasSemCaminho,
  conferirLinks,
  CAMINHOS_PADRAO,
  type AchadoQa,
} from './auditarFluxos.js';
import { campanhasAtivas, formatarPreco } from '../catalogo/campanhas.js';

const CONFERIR_LINKS = process.argv.includes('--links');
const SO_ACHADOS = process.argv.includes('--resumo');

const ICONE: Record<AchadoQa['gravidade'], string> = { ALTO: '✗', MEDIO: '!', BAIXO: '·' };

async function main(): Promise<void> {
  const todos: AchadoQa[] = [];

  console.log(`\n${'='.repeat(72)}`);
  console.log('CATÁLOGO — o código faz o que a declaração promete?');
  console.log('='.repeat(72));
  const doCatalogo = [...auditarCatalogo(), ...campanhasSemCaminho(CAMINHOS_PADRAO)];
  todos.push(...doCatalogo);
  if (!doCatalogo.length) console.log('\n  Catálogo e código em acordo.');
  for (const a of doCatalogo) {
    console.log(`\n  ${ICONE[a.gravidade]} [${a.gravidade}] ${a.campanha}: ${a.problema}`);
    console.log(`     ${a.evidencia}`);
  }

  for (const campanha of campanhasAtivas()) {
    const caminho = CAMINHOS_PADRAO[campanha.mediaId as keyof typeof CAMINHOS_PADRAO] ?? [];
    const relatorio = auditarCampanha(campanha.mediaId, [...caminho]);
    todos.push(...relatorio.achados);

    console.log(`\n${'='.repeat(72)}`);
    console.log(`${campanha.descricao}`);
    console.log(`post ${campanha.mediaId} · campanha "${relatorio.campanha}" · ${campanha.id}`);
    console.log(`promete: ${campanha.promessa.label}`);
    console.log(`entrega: ${campanha.promessa.entrega}${campanha.promessa.gratuito ? ' (gratuito)' : ''}`);
    if (campanha.oferta) {
      console.log(`vende  : ${campanha.oferta.produto} — ${formatarPreco(campanha.oferta.precoCentavos)}`);
    }
    console.log('='.repeat(72));

    if (!SO_ACHADOS) {
      for (const [i, passo] of relatorio.passos.entries()) {
        const marcas = [passo.entregou ? 'ENTREGUE' : '', passo.ofertou ? 'OFERTOU' : '']
          .filter(Boolean).join(' + ');
        console.log(`\n[${i + 1}] ${passo.entrada}   → ${passo.estagio}${marcas ? `  (${marcas})` : ''}`);
        for (const m of passo.mensagens) {
          console.log(`    ${m.split('\n').join('\n    ')}`);
        }
      }
    }

    if (relatorio.linksEncontrados.length) {
      console.log(`\n  links no caminho: ${relatorio.linksEncontrados.join(', ')}`);
      if (CONFERIR_LINKS) {
        for (const achado of await conferirLinks(relatorio.linksEncontrados)) {
          console.log(`    ${ICONE[achado.gravidade]} ${achado.problema}`);
          if (achado.gravidade === 'ALTO') todos.push(achado);
        }
      }
    }

    if (relatorio.achados.length) {
      console.log('\n  ACHADOS:');
      for (const a of relatorio.achados) {
        console.log(`    ${ICONE[a.gravidade]} [${a.gravidade}] ${a.problema}`);
        console.log(`       ${a.evidencia}`);
      }
    } else {
      console.log('\n  Nenhum problema no caminho feliz.');
    }
  }

  const altos = todos.filter((a) => a.gravidade === 'ALTO');
  console.log(`\n${'='.repeat(72)}`);
  console.log(`RESULTADO: ${altos.length} problema(s) ALTO, ${todos.length - altos.length} demais`);
  console.log('='.repeat(72));
  process.exit(altos.length ? 1 : 0);
}

main().catch((erro: unknown) => {
  console.error('QA falhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
