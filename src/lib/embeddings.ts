import OpenAI from "openai";

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export type EmbeddingUsage = {
  promptTokens: number;
  totalTokens: number;
};

export async function embedText(text: string): Promise<{
  embedding: number[];
  usage: EmbeddingUsage;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const client = new OpenAI({ apiKey });
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const vec = res.data[0]?.embedding;
  if (!vec) {
    throw new Error("Embedding response was empty");
  }
  const pt = res.usage?.prompt_tokens ?? 0;
  const tt = res.usage?.total_tokens ?? pt;
  return {
    embedding: vec,
    usage: { promptTokens: pt, totalTokens: tt },
  };
}
