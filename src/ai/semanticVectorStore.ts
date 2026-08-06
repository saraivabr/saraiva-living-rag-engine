import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockRuntime = new BedrockRuntimeClient({
  region: process.env.BEDROCK_SALES_REGION?.trim() || 'us-east-1',
});

const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v1';

export interface SemanticVectorChunk {
  id: string;
  topic: string;
  content: string;
  vector?: number[];
  metadata?: Record<string, string>;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const payload = JSON.stringify({ inputText: text });
    const command = new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(payload),
    });

    const response = await bedrockRuntime.send(command);
    const result = JSON.parse(Buffer.from(response.body).toString('utf-8'));
    return result.embedding as number[];
  } catch (error) {
    return fallbackSimpleVector(text);
  }
}

const PT_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
  'em', 'no', 'na', 'nos', 'nas', 'com', 'para', 'por', 'que', 'e', 'ou', 'como',
  'se', 'ao', 'aos', 'sao', 'foi', 'ser', 'ter', 'mas', 'tambem', 'muito',
  'mais', 'menos', 'sem', 'sob', 'sobre', 'entre', 'ate', 'pelo', 'pela', 'pelos',
  'pelas', 'este', 'esta', 'isso', 'isto', 'aquele', 'aquela', 'seu', 'sua', 'seus',
  'suas', 'eu', 'tu', 'ele', 'ela', 'voce', 'voces', 'eles', 'elas', 'minha', 'meu',
  'nosso', 'nossa', 'ha', 'ja', 'so', 'entao', 'assim', 'nao',
]);

function stemPortuguesePlural(word: string): string {
  return word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
}

// Espa\u00e7o de buckets grande o bastante para manter colis\u00f5es de hash raras entre
// palavras n\u00e3o relacionadas; com poucos buckets (ex: 64) at\u00e9 frases curtas e sem
// nenhuma palavra em comum colidem e rankeiam conte\u00fado irrelevante como mais similar.
const FALLBACK_VECTOR_SIZE = 512;

export function fallbackSimpleVector(text: string): number[] {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = normalized
    .split(/\W+/)
    .filter(Boolean)
    .filter((word) => !PT_STOPWORDS.has(word))
    .map(stemPortuguesePlural);
  const vector = new Array(FALLBACK_VECTOR_SIZE).fill(0);
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % FALLBACK_VECTOR_SIZE;
    vector[idx] += 1;
  }
  return vector;
}

export class SemanticVectorStore {
  private chunks: SemanticVectorChunk[] = [];
  private readonly embed: (text: string) => Promise<number[]>;

  constructor(embed: (text: string) => Promise<number[]> = generateEmbedding) {
    this.embed = embed;
  }

  async addChunk(id: string, topic: string, content: string, metadata?: Record<string, string>): Promise<SemanticVectorChunk> {
    const vector = await this.embed(content);
    const chunk: SemanticVectorChunk = { id, topic, content, vector, metadata };
    this.chunks.push(chunk);
    return chunk;
  }

  async searchSimilar(queryText: string, topK = 3): Promise<Array<SemanticVectorChunk & { similarity: number }>> {
    const queryVector = await this.embed(queryText);
    const scored = this.chunks.map((chunk) => {
      const similarity = chunk.vector ? cosineSimilarity(queryVector, chunk.vector) : 0;
      return { ...chunk, similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  getChunks(): SemanticVectorChunk[] {
    return [...this.chunks];
  }
}

export const defaultKnowledgeStore = new SemanticVectorStore();
