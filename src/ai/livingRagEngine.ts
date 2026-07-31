import { defaultKnowledgeStore } from './semanticVectorStore.js';
import { listKnowledgeInsights, listHypotheses } from '../secondBrain/secondBrainStore.js';

export interface LivingRagContext {
  relevantKnowledge: string[];
  validatedRules: string[];
  promptAugmentation: string;
}

export async function buildLivingRagContext(userMessage: string): Promise<LivingRagContext> {
  const semanticResults = await defaultKnowledgeStore.searchSimilar(userMessage, 3);
  const relevantKnowledge = semanticResults.map(
    (item) => `[Tópico: ${item.topic.toUpperCase()}] ${item.content} (Similaridade: ${(item.similarity * 100).toFixed(1)}%)`
  );

  const knowledgeInsights = await listKnowledgeInsights();
  const hypotheses = await listHypotheses();

  const validatedRules = knowledgeInsights.map((k) => `[REGRA VALIDADA DIÁRIA] ${k.insight}`);

  const activeTesting = hypotheses
    .filter((h) => h.status === 'TESTING')
    .map((h) => `[TESTE A/B EM ANDAMENTO] Na variável ${h.variableTested}: dar preferência ao tom da variante "${h.title}"`);

  let promptAugmentation = `\n--- BANCO DE DADOS SEMÂNTICO & RAG VIVO (TEMPO REAL) ---\n`;
  
  if (relevantKnowledge.length > 0) {
    promptAugmentation += `CONHECIMENTOS MAIS PRÓXIMOS (VETORES):\n${relevantKnowledge.join('\n')}\n\n`;
  }

  if (validatedRules.length > 0) {
    promptAugmentation += `REGRAS DE CONVERSÃO VALIDADAS PELO SEGUNDO CÉRABRO:\n${validatedRules.join('\n')}\n\n`;
  }

  if (activeTesting.length > 0) {
    promptAugmentation += `DIRETRIZES DE TESTE A/B ATIVAS:\n${activeTesting.join('\n')}\n`;
  }

  promptAugmentation += `------------------------------------------------------\n`;

  return {
    relevantKnowledge,
    validatedRules,
    promptAugmentation,
  };
}
