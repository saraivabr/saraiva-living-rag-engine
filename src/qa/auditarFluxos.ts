import {
  advanceInstagramFlow,
  createInstagramCommentFlow,
  shouldAdvanceInstagramFlow,
  SARAIVA_FLOW_PAYLOAD,
  type InstagramFlowSession,
  type InstagramInteractiveMessage,
} from '../instagram/automationFlow.js';
import { resolveKnownMediaPromise } from '../socialSelling/flow.js';
import {
  matchesMediaCampaignTrigger,
  PROSPECTING_FLOW_MEDIA_ID,
  WEBSITE_PROMPT_MEDIA_ID,
} from '../campaignTrigger.js';
import { CAMPANHAS, campanhaPorMedia, formatarPreco } from '../catalogo/campanhas.js';

/**
 * QA determinístico dos funis do Instagram.
 *
 * Percorre a máquina de estados como uma pessoa percorreria, imprime cada
 * mensagem que ela recebe e valida o que costuma quebrar em silêncio:
 * link prometido que não confere, oferta antes da entrega, beco sem saída e
 * promessa que não bate com o que o post anunciou.
 *
 *   npm run qa:fluxos
 *   npm run qa:fluxos -- --links   (também confere cada URL em produção)
 */

export interface PassoQa {
  entrada: string;
  mensagens: string[];
  estagio: string;
  entregou: boolean;
  ofertou: boolean;
}

export interface AchadoQa {
  gravidade: 'ALTO' | 'MEDIO' | 'BAIXO';
  campanha: string;
  problema: string;
  evidencia: string;
}

export interface RelatorioQa {
  campanha: string;
  mediaId: string;
  promessaDoPost: string;
  passos: PassoQa[];
  linksEncontrados: string[];
  achados: AchadoQa[];
}

const URL_REGEX = /(?:https?:\/\/|(?<![\w@.])(?:www\.)?[a-z0-9-]+\.(?:ai|com|br|app)\b)[^\s"')]*/giu;

/** Compara host e caminho, ignorando query, barra final e maiúsculas. */
function mesmaUrl(esquerda: string, direita: string): boolean {
  const normaliza = (bruto: string): string | undefined => {
    try {
      const url = new URL(bruto.startsWith('http') ? bruto : `https://${bruto}`);
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
    } catch {
      return undefined;
    }
  };
  const a = normaliza(esquerda);
  const b = normaliza(direita);
  return Boolean(a && b && a === b);
}

/** true quando a URL não tem caminho: `https://prompt.saraiva.ai` ou `.../`. */
function ehRaizNua(bruto: string): boolean {
  try {
    const url = new URL(bruto.startsWith('http') ? bruto : `https://${bruto}`);
    return url.pathname === '/' && !url.search;
  } catch {
    return false;
  }
}

function textoDe(mensagem: InstagramInteractiveMessage): string {
  if (mensagem.kind === 'text') return mensagem.text;
  if (mensagem.kind === 'quick_replies') {
    return `${mensagem.text}\n   [${mensagem.quickReplies.map((r) => r.title).join('] [')}]`;
  }
  if (mensagem.kind === 'link_card') {
    const botoes = mensagem.buttons
      .map((b) => (b.type === 'web_url' ? `${b.title} -> ${b.url}` : b.title))
      .join(' | ');
    return `CARD: ${mensagem.title}\n   ${mensagem.subtitle}\n   [${botoes}]`;
  }
  if (mensagem.kind === 'audio') return `AUDIO: ${mensagem.url}`;
  return JSON.stringify(mensagem);
}

/** Percorre um funil inteiro e devolve tudo que a pessoa recebeu no caminho. */
export function auditarCampanha(
  mediaId: string,
  caminho: Array<{ rotulo: string; payload?: string; texto?: string }>,
  opcoes: { seguidor?: boolean } = {},
): RelatorioQa {
  const promessa = resolveKnownMediaPromise(mediaId);
  const entrada = createInstagramCommentFlow(mediaId, { correlationId: 'qa-determinista' });
  const passos: PassoQa[] = [];
  const achados: AchadoQa[] = [];
  const campanha = entrada?.session.campaign || '(sem fluxo de botão)';

  if (!entrada) {
    return {
      campanha,
      mediaId,
      promessaDoPost: promessa?.label || '(nenhuma)',
      passos: [],
      linksEncontrados: [],
      achados: [{
        gravidade: 'ALTO',
        campanha,
        problema: 'Post não tem fluxo de botão: quem comenta cai no caminho genérico.',
        evidencia: `mediaId ${mediaId}`,
      }],
    };
  }

  // A entrada também pode mandar várias mensagens (entrega + instrução de uso).
  passos.push({
    entrada: 'comenta a palavra-chave',
    mensagens: [
      `PÚBLICO: ${entrada.publicReply}`,
      ...(entrada.messages || [entrada.message]).map(textoDe),
    ],
    estagio: entrada.session.stage,
    entregou: Boolean(entrada.session.promptDeliveredAt),
    ofertou: Boolean(entrada.session.productOfferedAt),
  });

  let sessao: InstagramFlowSession = entrada.session;
  for (const etapa of caminho) {
    const gatilho = { payload: etapa.payload, text: etapa.texto };

    // O lambda.ts consulta shouldAdvanceInstagramFlow ANTES de avançar a
    // máquina de estados: quando ela recusa, quem responde é o Motor. Pular
    // esse portão faz o QA acusar laços que não existem em produção.
    if (!shouldAdvanceInstagramFlow(sessao, gatilho)) {
      passos.push({
        entrada: etapa.rotulo,
        mensagens: ['→ resposta gerada pelo Motor (IA conversacional), fora da máquina de estados'],
        estagio: sessao.stage,
        entregou: Boolean(sessao.promptDeliveredAt),
        ofertou: Boolean(sessao.productOfferedAt),
      });
      continue;
    }

    const passo = advanceInstagramFlow(
      sessao,
      gatilho,
      { followStatus: opcoes.seguidor === false ? 'not_following' : 'following', firstName: 'Ana' },
    );
    if (!passo) {
      achados.push({
        gravidade: 'ALTO',
        campanha,
        problema: 'A máquina de estados devolveu vazio no meio do caminho.',
        evidencia: `entrada "${etapa.rotulo}" no estágio ${sessao.stage}`,
      });
      break;
    }
    // O card da oferta não viaja em step.message: ele vem em step.offer.card e
    // é enviado à parte pelo lambda.ts. Sem ler os dois canais, o QA acusa
    // "mensagem manda tocar um botão que não existe" quando o botão existe.
    const mensagens = (passo.messages || [passo.message]).map(textoDe);
    if (passo.offer?.card) mensagens.push(textoDe(passo.offer.card));
    passos.push({
      entrada: etapa.rotulo,
      mensagens,
      estagio: passo.session.stage,
      entregou: Boolean(passo.session.promptDeliveredAt),
      ofertou: Boolean(passo.session.productOfferedAt),
    });
    sessao = passo.session;
  }

  const tudo = passos.flatMap((p) => p.mensagens).join('\n');
  const linksEncontrados = [...new Set(tudo.match(URL_REGEX) || [])];

  // --- as verificações que importam ---

  // O que conta como "entregue" depende do tipo declarado no catálogo. Cobrar
  // promptDeliveredAt de uma campanha de comunidade seria exigir o campo do
  // funil errado e acusar problema onde não existe.
  const declarada = campanhaPorMedia(mediaId);
  const tipoEntrega = declarada?.promessa.entrega ?? 'texto-no-direct';
  const entregouEmAlgumPasso = tipoEntrega === 'texto-no-direct'
    ? passos.some((p) => p.entregou)
    : passos.some((p) => p.mensagens.some((m) => m.startsWith('CARD:')));

  if (!entregouEmAlgumPasso) {
    achados.push({
      gravidade: 'ALTO',
      campanha,
      problema: `Caminho feliz inteiro sem entrega do tipo "${tipoEntrega}".`,
      evidencia: `último estágio: ${sessao.stage}`,
    });
  }

  // Marcar a entrega é o que torna o funil mensurável. Sem isso, não dá para
  // dizer quantos receberam o que o post prometeu — foi assim que 24 pessoas
  // ficaram presas no portão de seguidor sem ninguém perceber.
  if (entregouEmAlgumPasso && !passos.some((p) => p.entregou)) {
    achados.push({
      gravidade: 'MEDIO',
      campanha,
      problema: 'Entrega acontece mas não fica marcada na sessão: funil não mensurável.',
      evidencia: `tipo "${tipoEntrega}" nunca grava promptDeliveredAt`,
    });
  }

  const indiceEntrega = passos.findIndex((p) => p.entregou);
  const indiceOferta = passos.findIndex((p) => p.ofertou);
  if (indiceOferta > -1 && indiceEntrega > -1 && indiceOferta < indiceEntrega) {
    achados.push({
      gravidade: 'ALTO',
      campanha,
      problema: 'Ofereceu produto pago ANTES de entregar o que o post prometeu.',
      evidencia: `oferta no passo ${indiceOferta + 1}, entrega no passo ${indiceEntrega + 1}`,
    });
  }

  const ultimo = passos.at(-1);
  if (ultimo && ultimo.mensagens.join(' ').includes('Quer rever os caminhos?')) {
    achados.push({
      gravidade: 'MEDIO',
      campanha,
      problema: 'Caminho feliz termina no laço genérico "Quer rever os caminhos?".',
      evidencia: `estágio final: ${ultimo.estagio}`,
    });
  }

  // A promessa do post e o que a conversa entrega precisam falar do MESMO
  // assunto. É aqui que mora o erro mais caro: prometer prompt e entregar
  // página de venda, prometer automação e entregar convite de comunidade.
  if (promessa) {
    const substantivos = promessa.label
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/\W+/)
      .filter((p) => p.length >= 5 && !['usado', 'video', 'criar', 'para'].includes(p));
    const entregue = tudo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ecoou = substantivos.filter((p) => entregue.includes(p));
    if (substantivos.length && !ecoou.length) {
      achados.push({
        gravidade: 'ALTO',
        campanha,
        problema: 'A entrega não menciona nada do que o post prometeu.',
        evidencia: `post promete "${promessa.label}"; nenhuma dessas palavras aparece na conversa`,
      });
    }
  }

  if (promessa) {
    const prometeuGratis = /gratuit|de graça|liberado/iu.test(promessa.privateReply);
    const linkDaPromessa = (promessa.privateReply.match(URL_REGEX) || [])[0];
    if (prometeuGratis && linkDaPromessa && /quero-o-prompt|checkout|comprar/iu.test(linkDaPromessa)) {
      achados.push({
        gravidade: 'ALTO',
        campanha,
        problema: 'A promessa diz "gratuito" mas o link aponta para página de venda.',
        evidencia: linkDaPromessa,
      });
    }
    // Raiz nua é onde mora a landing comercial, em qualquer domínio da casa.
    // O filtro por nome de página não pega isso: "prompt.saraiva.ai" passa
    // limpo por /quero-o-prompt|checkout|comprar/ e abre a página de R$ 19,90.
    if (prometeuGratis && linkDaPromessa && ehRaizNua(linkDaPromessa)) {
      achados.push({
        gravidade: 'ALTO',
        campanha,
        problema: 'Entrega gratuita aponta para a raiz do domínio, onde fica a landing paga.',
        evidencia: linkDaPromessa,
      });
    }
  }

  return {
    campanha,
    mediaId,
    promessaDoPost: promessa?.label || '(nenhuma)',
    passos,
    linksEncontrados,
    achados,
  };
}

/** Confere se cada link prometido responde e não é uma página de venda disfarçada. */
export async function conferirLinks(links: string[]): Promise<AchadoQa[]> {
  const achados: AchadoQa[] = [];
  for (const bruto of links) {
    const url = bruto.startsWith('http') ? bruto : `https://${bruto}`;
    try {
      const resposta = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      });
      if (!resposta.ok) {
        achados.push({
          gravidade: 'ALTO',
          campanha: 'links',
          problema: `Link prometido responde HTTP ${resposta.status}.`,
          evidencia: url,
        });
        continue;
      }
      const corpo = await resposta.text();
      const titulo = corpo.match(/<title[^>]*>(.*?)<\/title>/su)?.[1]?.trim() || '(sem título)';
      const temPreco = /R\$\s?\d/u.test(corpo);
      achados.push({
        gravidade: 'BAIXO',
        campanha: 'links',
        problema: `OK — ${titulo}${temPreco ? ' [contém preço]' : ''}`,
        evidencia: url,
      });
    } catch (erro) {
      achados.push({
        gravidade: 'ALTO',
        campanha: 'links',
        problema: `Link prometido não abriu: ${(erro as Error).message}`,
        evidencia: url,
      });
    }
  }
  return achados;
}

/**
 * Compara o catálogo declarado com o que o código realmente faz.
 *
 * O catálogo é a intenção; o código é a execução. Divergência entre os dois é
 * exatamente o que produziu os erros mais caros: link "gratuito" apontando para
 * checkout, três nomes para o mesmo produto, promessa que ninguém entrega.
 */
export function auditarCatalogo(): AchadoQa[] {
  const achados: AchadoQa[] = [];

  for (const campanha of CAMPANHAS) {
    if (campanha.status !== 'ativa') continue;

    for (const gatilho of campanha.gatilhos) {
      // Lista de fallback vazia de propósito: o gatilho tem que estar
      // registrado para o post, não vir de um default genérico.
      if (!matchesMediaCampaignTrigger(campanha.mediaId, gatilho, [])) {
        achados.push({
          gravidade: 'ALTO',
          campanha: campanha.id,
          problema: 'Gatilho declarado no catálogo não ativa a campanha no código.',
          evidencia: `"${gatilho}" no post ${campanha.mediaId}`,
        });
      }
    }

    const promessaNoCodigo = resolveKnownMediaPromise(campanha.mediaId);
    if (!promessaNoCodigo) {
      achados.push({
        gravidade: 'ALTO',
        campanha: campanha.id,
        problema: 'Catálogo declara a campanha, mas o código não resolve promessa para o post.',
        evidencia: campanha.mediaId,
      });
    } else if (promessaNoCodigo.label !== campanha.promessa.label) {
      achados.push({
        gravidade: 'MEDIO',
        campanha: campanha.id,
        problema: 'A promessa do catálogo e a do código estão escritas diferente.',
        evidencia: `catálogo "${campanha.promessa.label}" · código "${promessaNoCodigo.label}"`,
      });
    }

    // A auditoria comparava só o LABEL. O endereço — que é o que a pessoa
    // realmente abre — passava sem conferência, e catálogo e código ficaram
    // apontando para domínios diferentes sem ninguém notar. Um link errado
    // custa mais caro que um nome escrito diferente.
    if (promessaNoCodigo && campanha.promessa.url) {
      const urlNoCodigo = (promessaNoCodigo.privateReply.match(URL_REGEX) || [])[0];
      if (urlNoCodigo && !mesmaUrl(urlNoCodigo, campanha.promessa.url)) {
        achados.push({
          gravidade: 'ALTO',
          campanha: campanha.id,
          problema: 'A URL declarada no catálogo não é a que o código entrega.',
          evidencia: `catálogo "${campanha.promessa.url}" · código "${urlNoCodigo}"`,
        });
      }
    }

    if (campanha.promessa.gratuito && campanha.promessa.url
      && /quero-o-prompt|checkout|comprar|assinar/iu.test(campanha.promessa.url)) {
      achados.push({
        gravidade: 'ALTO',
        campanha: campanha.id,
        problema: 'Entrega declarada como gratuita aponta para uma página de venda.',
        evidencia: campanha.promessa.url,
      });
    }

    // 'comunidade' é a única entrega em que a raiz é o destino legítimo: o
    // convite abre a home. Link e texto-no-direct precisam de caminho próprio.
    if (campanha.promessa.gratuito && campanha.promessa.url
      && campanha.promessa.entrega !== 'comunidade'
      && ehRaizNua(campanha.promessa.url)) {
      achados.push({
        gravidade: 'ALTO',
        campanha: campanha.id,
        problema: 'Entrega gratuita declarada na raiz do domínio, onde fica a landing paga.',
        evidencia: campanha.promessa.url,
      });
    }

    if (campanha.promessa.entrega !== 'texto-no-direct' && !campanha.promessa.url) {
      achados.push({
        gravidade: 'ALTO',
        campanha: campanha.id,
        problema: `Entrega "${campanha.promessa.entrega}" precisa de url e não tem.`,
        evidencia: campanha.id,
      });
    }

    for (const pendencia of campanha.pendencias ?? []) {
      achados.push({
        gravidade: 'MEDIO',
        campanha: campanha.id,
        problema: 'Pendência declarada no catálogo.',
        evidencia: pendencia,
      });
    }
  }

  // Um produto, um nome, um preço. Foi a falta disso que fez circularem
  // "Biblioteca Saraiva", "Biblioteca Secreta" e "Gerador de Prompts" em 28h.
  const porProduto = new Map<string, Set<number>>();
  for (const c of CAMPANHAS) {
    if (!c.oferta) continue;
    const precos = porProduto.get(c.oferta.produto) ?? new Set<number>();
    precos.add(c.oferta.precoCentavos);
    porProduto.set(c.oferta.produto, precos);
  }
  for (const [produto, precos] of porProduto) {
    if (precos.size > 1) {
      achados.push({
        gravidade: 'ALTO',
        campanha: 'catálogo',
        problema: 'O mesmo produto está declarado com preços diferentes.',
        evidencia: `${produto}: ${[...precos].map(formatarPreco).join(' e ')}`,
      });
    }
  }

  const porMedia = new Map<string, string[]>();
  for (const c of CAMPANHAS) {
    porMedia.set(c.mediaId, [...(porMedia.get(c.mediaId) ?? []), c.id]);
  }
  for (const [mediaId, ids] of porMedia) {
    if (ids.length > 1) {
      achados.push({
        gravidade: 'ALTO',
        campanha: 'catálogo',
        problema: 'Duas campanhas disputam o mesmo post.',
        evidencia: `${mediaId}: ${ids.join(', ')}`,
      });
    }
  }

  return achados;
}

/** Campanha declarada mas sem caminho de teste é campanha não auditada. */
export function campanhasSemCaminho(caminhos: Record<string, unknown>): AchadoQa[] {
  return CAMPANHAS
    .filter((c) => c.status === 'ativa' && !caminhos[c.mediaId])
    .map((c) => ({
      gravidade: 'MEDIO' as const,
      campanha: c.id,
      problema: 'Campanha ativa sem caminho de QA declarado: ninguém testa esse funil.',
      evidencia: c.mediaId,
    }));
}

export { campanhaPorMedia };

export const CAMINHOS_PADRAO = {
  [WEBSITE_PROMPT_MEDIA_ID]: [
    // A entrega já sai no primeiro contato. O que resta testar é a troca de
    // versão: quem recebeu a de clientes e pede a da própria empresa.
    { rotulo: 'toca MINHA EMPRESA', payload: SARAIVA_FLOW_PAYLOAD.sitesOwnBusiness },
  ],
  [PROSPECTING_FLOW_MEDIA_ID]: [
    { rotulo: 'toca VER ESTRUTURA', payload: SARAIVA_FLOW_PAYLOAD.open },
    { rotulo: 'responde o nome', texto: 'Ana' },
    { rotulo: 'toca QUERO TER UMA', payload: SARAIVA_FLOW_PAYLOAD.ready },
    { rotulo: 'toca FALTAM CLIENTES', payload: SARAIVA_FLOW_PAYLOAD.goalProspect },
    { rotulo: 'responde o negócio', texto: 'agência de marketing' },
  ],
} as const;
