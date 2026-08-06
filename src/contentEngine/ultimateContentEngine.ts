import { defaultKnowledgeStore } from '../ai/semanticVectorStore.js';
import { listKnowledgeInsights, listHypotheses } from '../secondBrain/secondBrainStore.js';

export interface ContentGenerationEngineInput {
  targetAudience: string;
  niche: string;
  coreOffer: string;
  mainPainPoint: string;
}

export interface GeneratedContentScript {
  title: string;
  hook0to3s: string;
  demonstration3to12s: string;
  confrontation12to22s: string;
  cta22to30s: string;
  visualDirections: string[];
  suggestedTriggerWord: string;
}

export class UltimateContentGenerationEngine {
  async generateViralScript(input: ContentGenerationEngineInput): Promise<GeneratedContentScript> {
    // 1. Busca semântica de padrões de engajamento no banco semântico
    const semanticHits = await defaultKnowledgeStore.searchSimilar(
      `${input.niche} ${input.mainPainPoint} ${input.coreOffer}`,
      2
    );

    // 2. Consulta insights e aprendizados validados no Segundo Cérebro
    const insights = await listKnowledgeInsights();
    const hypotheses = await listHypotheses();

    const topInsights = insights.slice(0, 3).map((i) => i.insight).join(' | ');

    // 3. Monta a Engenharia Social de 4 Blocos da Criação de Conteúdo Incrível
    const hook0to3s = `Enquanto a maioria das empresas de ${input.niche} perde clientes por ${input.mainPainPoint}, este sistema resolve em segundos.`;
    
    const demonstration3to12s = `Veja como funciona na prática: a inteligência analisa a necessidade de ${input.targetAudience} e entrega a solução para ${input.coreOffer} sem atrito.`;
    
    const confrontation12to22s = `Continuar tentando fazer isso manualmente ou com métodos antigos é um ralo de tempo e receita. A chave está em ter uma estrutura que trabalha 24/7.`;
    
    const suggestedTriggerWord = input.niche.toLowerCase().includes('site') ? 'SITE' : 'ESTRUTURA';

    const cta22to30s = `Comenta ${suggestedTriggerWord} aqui embaixo que te mando os bastidores e o modelo completo direto no seu Direct.`;

    return {
      title: `Roteiro de Alta Conversão: ${input.niche} (${input.targetAudience})`,
      hook0to3s,
      demonstration3to12s,
      confrontation12to22s,
      cta22to30s,
      visualDirections: [
        '0-3s: Gravação de tela com texto gigante de contraste',
        '3-12s: Mostrar a ferramenta/IA executando a tarefa ao vivo',
        '12-22s: Saraiva na câmera com tom de voz firme e seguro',
        '22-30s: Apontar para baixo com a palavra-chave em destaque',
      ],
      suggestedTriggerWord,
    };
  }
}

export const contentGenerationEngine = new UltimateContentGenerationEngine();
