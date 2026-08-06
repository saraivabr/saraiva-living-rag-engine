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

function fallbackSimpleVector(text: string): number[] {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = normalized.split(/\W+/).filter(Boolean);
  const vector = new Array(64).fill(0);
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % 64;
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
