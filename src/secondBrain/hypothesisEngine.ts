import {
  saveHypothesis,
  getHypothesis,
  listHypotheses,
  saveKnowledgeInsight,
  listKnowledgeInsights,
  type SecondBrainHypothesis,
  type KnowledgeInsight,
} from './secondBrainStore.js';

export async function registerHypothesis(
  id: string,
  title: string,
  description: string,
  variableTested: 'private_reply' | 'audio_script' | 'cta_button',
  variantA: string,
  variantB?: string,
): Promise<SecondBrainHypothesis> {
  const hypothesis: SecondBrainHypothesis = {
    id,
    title,
    description,
    variableTested,
    variantA,
    variantB,
    exposures: 0,
    clicks: 0,
    conversionRate: 0,
    status: 'TESTING',
    startedAt: new Date().toISOString(),
  };
  await saveHypothesis(hypothesis);
  return hypothesis;
}

export async function recordExposure(id: string): Promise<void> {
  const hyp = await getHypothesis(id);
  if (!hyp) return;

  hyp.exposures += 1;
  hyp.conversionRate = hyp.exposures > 0 ? (hyp.clicks / hyp.exposures) * 100 : 0;
  await saveHypothesis(hyp);
}

export async function recordClick(id: string): Promise<void> {
  const hyp = await getHypothesis(id);
  if (!hyp) return;

  hyp.clicks += 1;
  hyp.conversionRate = hyp.exposures > 0 ? (hyp.clicks / hyp.exposures) * 100 : 0;

  if (hyp.exposures >= 100 && hyp.conversionRate >= 15.0 && hyp.status === 'TESTING') {
    hyp.status = 'VALIDATED';
    hyp.concludedAt = new Date().toISOString();
    await saveKnowledgeInsight({
      id: `KNOW-${Date.now()}`,
      topic: hyp.variableTested,
      insight: `Hipótese "${hyp.title}" validada com taxa de conversão de ${hyp.conversionRate.toFixed(1)}%.`,
      confidenceScore: 0.95,
      sourceHypothesisId: hyp.id,
      createdAt: new Date().toISOString(),
    });
  } else if (hyp.exposures >= 100 && hyp.conversionRate < 5.0 && hyp.status === 'TESTING') {
    hyp.status = 'REJECTED';
    hyp.concludedAt = new Date().toISOString();
  }

  await saveHypothesis(hyp);
}

export async function generateBrainSummary(): Promise<{
  activeHypotheses: SecondBrainHypothesis[];
  insights: KnowledgeInsight[];
}> {
  const hypotheses = await listHypotheses();
  const insights = await listKnowledgeInsights();
  return {
    activeHypotheses: hypotheses,
    insights,
  };
}
