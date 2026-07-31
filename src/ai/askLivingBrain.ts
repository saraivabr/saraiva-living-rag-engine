import { buildLivingRagContext } from './livingRagEngine.js';

export async function askLivingBrain(userQuestion: string): Promise<string> {
  const ragContext = await buildLivingRagContext(userQuestion);
  return `\n🧠 RESPOSTA DO SEU SEGUNDO CÉRABRO VIVO (SARAIVA AI):\n\nPerguntado: "${userQuestion}"\n\n${ragContext.promptAugmentation}`;
}
