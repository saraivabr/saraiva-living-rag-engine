/**
 * Catálogo de campanhas — a fonte única de verdade do funil.
 *
 * POR QUE ISSO EXISTE
 *
 * Até aqui, uma campanha vivia espalhada em cinco arquivos: o id do post e a
 * palavra-gatilho em campaignTrigger, a promessa em socialSelling/flow, as
 * mensagens e os cards em instagram/automationFlow, o destino dos links em
 * lambda, e o preço na loja. Ninguém conseguia olhar num lugar só e responder
 * "o que este post promete, o que ele entrega e o que ele vende".
 *
 * O preço disso foi medido: o link do prompt anunciado como gratuito apontava
 * para a página de R$ 19,90 e 22 pessoas clicaram; três nomes de produto e dois
 * preços circularam em 28 horas; um mesmo post gerou duas promessas diferentes.
 * Nenhum desses erros é burrice — são o resultado inevitável de espalhar a
 * verdade em cinco lugares que ninguém compara.
 *
 * COMO USAR
 *
 * Toda campanha nova se declara aqui primeiro. `npm run qa:fluxos` confere se o
 * código faz o que a declaração promete e falha quando os dois divergem. A
 * declaração é a intenção; o código é a execução; o QA é o juiz.
 */

export type EntregaTipo =
  /** O conteúdo prometido chega como texto no próprio Direct. */
  | 'texto-no-direct'
  /** O conteúdo prometido está atrás de um link. */
  | 'link'
  /** A entrega é entrar num grupo ou comunidade. */
  | 'comunidade';

export interface OfertaCampanha {
  /** Nome exato do produto. O MESMO em toda peça: DM, página, checkout, anúncio. */
  produto: string;
  precoCentavos: number;
  url: string;
  /** Onde o conteúdo comprado realmente mora. Sem isso, é promessa vazia. */
  entregueEm: string;
}

export interface Campanha {
  id: string;
  descricao: string;
  mediaId: string;
  shortcode?: string;
  gatilhos: readonly string[];
  status: 'ativa' | 'encerrada' | 'rascunho';

  promessa: {
    /** O que o post anunciou, na língua de quem comentou. */
    label: string;
    entrega: EntregaTipo;
    gratuito: boolean;
    /** Obrigatório quando entrega é 'link' ou 'comunidade'. */
    url?: string;
  };

  /** O que a campanha vende depois de entregar o gratuito. Opcional. */
  oferta?: OfertaCampanha;

  /** O que ainda falta para a campanha estar honesta. Vazio = pronta. */
  pendencias?: readonly string[];
}

/** Único produto com conteúdo escrito e checkout provado hoje. */
export const BIBLIOTECA: OfertaCampanha = {
  produto: 'Biblioteca Secreta de Prompts',
  precoCentavos: 1_990,
  url: 'https://prompt.saraiva.ai/quero-o-prompt',
  entregueEm: 'storefront/app/data/promptLibrary.ts (24 prompts, 4 categorias)',
};

export const CAMPANHAS: readonly Campanha[] = Object.freeze([
  {
    id: 'prompt-de-sites',
    descricao: 'Reel do prompt que cria sites no ChatGPT com @Sites.',
    mediaId: '18130447453725127',
    shortcode: 'DbUd5FKRVxf',
    gatilhos: ['saraiva'],
    status: 'ativa',
    promessa: {
      label: 'prompt usado no vídeo para criar o site',
      entrega: 'texto-no-direct',
      gratuito: true,
      // Tem de bater com PROMPT_GRATUITO_URL em socialSelling/flow.ts. O QA
      // compara os dois: catálogo e código divergiam aqui sem ninguém notar,
      // porque a auditoria só conferia o label da promessa, nunca a URL.
      url: 'https://prompt.saraiva.ai/prompt-do-video',
    },
    oferta: BIBLIOTECA,
  },
  {
    id: 'automacao-de-prospeccao',
    descricao: 'Reel da automação que acha empresas por nicho, cidade e ticket.',
    mediaId: '18299164084305199',
    shortcode: 'DbZhCk6OQ0s',
    gatilhos: ['saraiva'],
    status: 'ativa',
    promessa: {
      label: 'automacao de prospeccao por nicho, cidade e ticket',
      entrega: 'comunidade',
      gratuito: true,
      url: 'https://saraiva.ai',
    },
    pendencias: [
      'DECISÃO SUA: o post promete uma automação de prospecção e a conversa '
      + 'entrega convite para o Laboratório. São coisas diferentes. Ou a '
      + 'comunidade passa a entregar a automação nomeada, ou o post muda a '
      + 'promessa. Nenhuma das duas é decisão de engenharia.',
      'O card da comunidade é enviado, mas a sessão não grava marca de entrega. '
      + 'Sem isso não dá para medir quantos receberam — foi essa cegueira que '
      + 'deixou 24 pessoas presas no portão de seguidor sem ninguém perceber.',
    ],
  },
]);

export function campanhaPorMedia(mediaId: string): Campanha | undefined {
  return CAMPANHAS.find((c) => c.mediaId === mediaId);
}

export function campanhasAtivas(): readonly Campanha[] {
  return CAMPANHAS.filter((c) => c.status === 'ativa');
}

export function formatarPreco(centavos: number): string {
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
}
