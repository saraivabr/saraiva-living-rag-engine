/**
 * Catálogo Determinístico de Conteúdos do Instagram
 *
 * Todos os conteúdos entregues pelo respondedor devem obrigatoriamente
 * fazer parte deste catálogo. URLs externas vindas via webhook não são aceitas.
 */

export interface InstagramContentDelivery {
  type: 'text' | 'audio' | 'image' | 'video' | 'file' | 'card';
  text?: string;
  scriptTemplate?: string;
  url?: string;
}

export interface InstagramContentDefinition {
  id: string;
  keywords: string[];
  title: string;
  description: string;
  delivery: InstagramContentDelivery;
  requiresFollow: boolean;
  active: boolean;
  nextAction?: string;
}

const CATALOG: Record<string, InstagramContentDefinition> = {
  PROMPT: {
    id: 'PROMPT',
    keywords: ['prompt', 'prompts', 'comando', 'instrucao'],
    title: 'Prompt de Automação',
    description: 'Prompt estruturado para criação de assistentes conversacionais.',
    delivery: {
      type: 'text',
      text: 'Aqui está o prompt completo para configurar sua automação no ChatGPT:\n\n1. Defina a persona e objetivo.\n2. Especifique os estados da conversa.\n3. Configure as respostas padrão para gatilhos.',
    },
    requiresFollow: true,
    active: true,
  },
  MAPA: {
    id: 'MAPA',
    keywords: ['mapa', 'fluxo', 'diagrama', 'arquitetura'],
    title: 'Mapa do Fluxo Conversacional',
    description: 'Diagrama visual com a arquitetura de conversão do Instagram.',
    delivery: {
      type: 'text',
      text: 'Aqui está o mapa mental e arquitetura visual do fluxo conversacional de alta conversão.',
    },
    requiresFollow: true,
    active: true,
  },
  AULA: {
    id: 'AULA',
    keywords: ['aula', 'video', 'workshop', 'treinamento'],
    title: 'Aula Prática de IA',
    description: 'Treinamento em vídeo sobre automação e vendas no Instagram.',
    delivery: {
      type: 'text',
      text: 'Assista à aula prática sobre como integrar Zernio e Instagram.',
    },
    requiresFollow: true,
    active: true,
  },
  AUTOMACAO: {
    id: 'AUTOMAÇÃO',
    keywords: ['automacao', 'automação', 'bot', 'script'],
    title: 'Estrutura de Automação',
    description: 'Código e templates de configuração da automação.',
    delivery: {
      type: 'text',
      text: 'Aqui estão os templates de automação prontos para importar.',
    },
    requiresFollow: true,
    active: true,
  },
  PROSPECCAO: {
    id: 'PROSPECÇÃO',
    keywords: ['prospeccao', 'prospecção', 'clientes', 'vendas'],
    title: 'Guia de Prospecção Ativa',
    description: 'Método para atração e conversão de novos clientes no Direct.',
    delivery: {
      type: 'text',
      text: 'Aqui está o roteiro de prospecção ativa via Direct do Instagram.',
    },
    requiresFollow: true,
    active: true,
  },
  COMUNIDADE: {
    id: 'COMUNIDADE',
    keywords: ['comunidade', 'grupo', 'vip', 'whatsapp'],
    title: 'Comunidade Saraiva no WhatsApp',
    description: 'Acesso à comunidade exclusiva de criadores e automação.',
    delivery: {
      type: 'text',
      text: 'Entre na Comunidade Saraiva no WhatsApp para receber atualizações e novos templates.',
    },
    requiresFollow: false,
    active: true,
  },
};

/**
 * Resolve o conteúdo correspondente a uma ID ou palavra-chave.
 * Retorna undefined se o conteúdo não existir ou estiver desativado.
 */
export function getContentDefinition(keywordOrId: string): InstagramContentDefinition | undefined {
  const normalized = keywordOrId
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  for (const item of Object.values(CATALOG)) {
    if (!item.active) continue;

    const matchId = item.id.toLowerCase() === normalized;
    const matchKeyword = item.keywords.some(
      (kw) => kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === normalized
    );

    if (matchId || matchKeyword) {
      return item;
    }
  }

  return undefined;
}

/**
 * Retorna todos os conteúdos ativos no catálogo.
 */
export function listActiveContents(): InstagramContentDefinition[] {
  return Object.values(CATALOG).filter((item) => item.active);
}
