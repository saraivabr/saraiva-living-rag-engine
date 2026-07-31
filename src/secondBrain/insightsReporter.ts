import { generateBrainSummary } from './hypothesisEngine.js';

export async function exportSecondBrainMarkdownReport(): Promise<string> {
  const { activeHypotheses, insights } = await generateBrainSummary();

  let markdown = `# 🧠 Relatório do Segundo Cérebro (Saraiva AI Second Brain)\n\n`;
  markdown += `*Gerado em: ${new Date().toLocaleString('pt-BR')}*\n\n`;
  markdown += `--- \n\n`;

  markdown += `## 🔬 1. Hipóteses & Experimentos Ativos\n\n`;
  if (activeHypotheses.length === 0) {
    markdown += `*Nenhuma hipótese cadastrada no momento. O sistema está rodando no modo padrão Doug Deep Core.*\n\n`;
  } else {
    markdown += `| ID | Título | Variável | Exposições | Cliques | Taxa CTR | Status |\n`;
    markdown += `| :--- | :--- | :--- | :---: | :---: | :---: | :---: |\n`;
    for (const h of activeHypotheses) {
      markdown += `| \`${h.id}\` | ${h.title} | \`${h.variableTested}\` | ${h.exposures} | ${h.clicks} | **${h.conversionRate.toFixed(1)}%** | **${h.status}** |\n`;
    }
    markdown += `\n`;
  }

  markdown += `## 📚 2. Base de Conhecimento Validada (Knowledge Store)\n\n`;
  if (insights.length === 0) {
    markdown += `*Base de conhecimento em consolidação inicial. Aprendizados validados aparecerão aqui conforme as hipóteses atingirem significância estatística.*\n\n`;
  } else {
    for (const k of insights) {
      markdown += `- **[${k.topic.toUpperCase()}]** ${k.insight} *(Confiança: ${(k.confidenceScore * 100).toFixed(0)}%)*\n`;
    }
    markdown += `\n`;
  }

  return markdown;
}
