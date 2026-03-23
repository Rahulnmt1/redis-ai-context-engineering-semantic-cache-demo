import { randomUUID } from "crypto";
import { embedText } from "@/lib/embeddings";
import { generateAnswer } from "@/lib/llm";
import { HANDBOOK_CHUNKS } from "@/lib/handbook";
import { floatsToBuffer } from "@/lib/vector";
import { getRedis } from "@/lib/redis-client";
import {
  INDEX_HANDBOOK,
  INDEX_SEMANTIC_CACHE,
  cacheDocKey,
  describeKnnSearchCommand,
  ensureSearchIndexes,
  handbookDocKey,
  knnSearch,
  type KnnRow,
} from "@/lib/redis-search";

const HANDBOOK_KNN_K = 3;
const HANDBOOK_RETURN_FIELDS = ["section", "content", "chunk_id"] as const;

export type RetrievedChunk = {
  chunkId: string;
  section: string;
  content: string;
  distance: number;
  /** Redis HASH key for this hit (e.g. handbook:pto-accrual). */
  redisHashKey: string;
  /** RediSearch command used for this retrieval round (identical for each row in the list). */
  vectorQueryExecuted: string;
};

export type ContextPacket = {
  systemPreamble: string;
  sessionMemory: string;
  retrievedChunks: RetrievedChunk[];
  contextBlock: string;
};

/** OpenAI-reported token usage for this HTTP turn (chat route only). */
export type TurnTokenUsage = {
  embeddingPromptTokens: number;
  embeddingTotalTokens: number;
  llmPromptTokens?: number;
  llmCompletionTokens?: number;
  llmTotalTokens?: number;
  /**
   * On cache hit: chat `total_tokens` from when this answer was first generated
   * (skipped LLM call — approximate savings vs a fresh completion for that cached path).
   */
  llmTokensSavedVsFreshCall?: number;
};

export type ChatResult = {
  answer: string;
  contextPacket: ContextPacket;
  semanticCache: {
    hit: boolean;
    distance?: number;
    matchedQuery?: string;
    redisKey?: string;
    maxDistance: number;
  };
  llmCalled: boolean;
  usage: TurnTokenUsage;
  redis: {
    handbookIndex: string;
    cacheIndex: string;
  };
};

const SYSTEM_PREAMBLE = [
  "You are a concise internal HR assistant for a fictional company.",
  "Answer using ONLY the handbook excerpts provided in the user message context.",
  "If the answer is not contained in the excerpts, say you do not have that information in the handbook.",
  "End with a short 'Sources:' line listing section titles you used.",
].join(" ");

function buildContextBlock(input: {
  retrievedChunks: RetrievedChunk[];
  sessionMemory: string;
}): string {
  const mem = input.sessionMemory.trim()
    ? `Session memory (may be empty):\n${input.sessionMemory.trim()}`
    : "Session memory: (none yet for this session)";
  const chunks = input.retrievedChunks
    .map(
      (c, idx) =>
        `Excerpt ${idx + 1} [${c.section}] (chunk_id=${c.chunkId})\n${c.content}`,
    )
    .join("\n\n");
  return `${mem}\n\nHandbook excerpts:\n${chunks}`;
}

/** Default ~0.27: “full-time … per year?” vs “new hires?” embeds at ~0.26; 0.22 misses that pair. */
function maxCacheDistance(): number {
  const raw = process.env.SEMANTIC_CACHE_MAX_DISTANCE;
  const n = raw ? Number.parseFloat(raw) : 0.27;
  return Number.isFinite(n) ? n : 0.27;
}

/** Top-K neighbors in the cache index; pick the closest under threshold (not only rank-1). */
function semanticCacheTopK(): number {
  const raw = process.env.SEMANTIC_CACHE_TOP_K;
  const n = raw ? Number.parseInt(raw, 10) : 10;
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(n, 50);
}

function bestCacheHit(rows: KnnRow[], threshold: number): KnnRow | undefined {
  const candidates = rows.filter(
    (r) => r.distance <= threshold && Boolean(r.fields.answer),
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) => (a.distance <= b.distance ? a : b));
}

export async function runChatTurn(input: {
  message: string;
  sessionMemory: string;
}): Promise<ChatResult> {
  const redis = await getRedis();
  await ensureSearchIndexes(redis);

  const { embedding: queryEmbedding, usage: queryEmbedUsage } = await embedText(
    input.message,
  );
  const cacheRows = await knnSearch(
    redis,
    INDEX_SEMANTIC_CACHE,
    queryEmbedding,
    semanticCacheTopK(),
    ["original_query", "answer"],
  );
  const threshold = maxCacheDistance();
  const best = bestCacheHit(cacheRows, threshold);
  const nearest = cacheRows[0];
  if (best && best.fields.answer) {
    const savedRaw = await redis.hGet(best.key, "llm_total_tokens");
    const parsedSaved = savedRaw ? Number.parseInt(savedRaw, 10) : 0;
    const llmTokensSavedVsFreshCall =
      Number.isFinite(parsedSaved) && parsedSaved > 0 ? parsedSaved : 0;
    return {
      answer: best.fields.answer,
      contextPacket: {
        systemPreamble: SYSTEM_PREAMBLE,
        sessionMemory: input.sessionMemory,
        retrievedChunks: [],
        contextBlock:
          "(Semantic cache hit — the model was not called; prior answer reused.)",
      },
      semanticCache: {
        hit: true,
        distance: best.distance,
        matchedQuery: best.fields.original_query,
        redisKey: best.key,
        maxDistance: threshold,
      },
      llmCalled: false,
      usage: {
        embeddingPromptTokens: queryEmbedUsage.promptTokens,
        embeddingTotalTokens: queryEmbedUsage.totalTokens,
        llmTokensSavedVsFreshCall,
      },
      redis: {
        handbookIndex: INDEX_HANDBOOK,
        cacheIndex: INDEX_SEMANTIC_CACHE,
      },
    };
  }

  const vectorQueryExecuted = describeKnnSearchCommand({
    indexName: INDEX_HANDBOOK,
    k: HANDBOOK_KNN_K,
    returnFields: [...HANDBOOK_RETURN_FIELDS],
  });
  const rows = await knnSearch(
    redis,
    INDEX_HANDBOOK,
    queryEmbedding,
    HANDBOOK_KNN_K,
    [...HANDBOOK_RETURN_FIELDS],
  );
  const retrieved: RetrievedChunk[] = rows.map((r) => ({
    chunkId: r.fields.chunk_id ?? "",
    section: r.fields.section ?? "",
    content: r.fields.content ?? "",
    distance: r.distance,
    redisHashKey: r.key,
    vectorQueryExecuted,
  }));

  const contextPacket: ContextPacket = {
    systemPreamble: SYSTEM_PREAMBLE,
    sessionMemory: input.sessionMemory,
    retrievedChunks: retrieved,
    contextBlock: buildContextBlock({
      retrievedChunks: retrieved,
      sessionMemory: input.sessionMemory,
    }),
  };

  const { answer, usage: llmUsage } = await generateAnswer({
    userMessage: input.message,
    systemPreamble: SYSTEM_PREAMBLE,
    contextBlock: contextPacket.contextBlock,
  });

  const id = randomUUID();
  const key = cacheDocKey(id);
  await redis.hSet(key, {
    original_query: input.message,
    answer,
    embedding: floatsToBuffer(queryEmbedding),
    llm_prompt_tokens: String(llmUsage.promptTokens),
    llm_completion_tokens: String(llmUsage.completionTokens),
    llm_total_tokens: String(llmUsage.totalTokens),
  });

  return {
    answer,
    contextPacket,
    semanticCache: {
      hit: false,
      distance: nearest?.distance,
      matchedQuery: nearest?.fields.original_query,
      redisKey: key,
      maxDistance: threshold,
    },
    llmCalled: true,
    usage: {
      embeddingPromptTokens: queryEmbedUsage.promptTokens,
      embeddingTotalTokens: queryEmbedUsage.totalTokens,
      llmPromptTokens: llmUsage.promptTokens,
      llmCompletionTokens: llmUsage.completionTokens,
      llmTotalTokens: llmUsage.totalTokens,
    },
    redis: {
      handbookIndex: INDEX_HANDBOOK,
      cacheIndex: INDEX_SEMANTIC_CACHE,
    },
  };
}

export async function seedHandbookVectors(): Promise<{ chunks: number }> {
  const redis = await getRedis();
  await ensureSearchIndexes(redis);

  for (const chunk of HANDBOOK_CHUNKS) {
    const textForEmbedding = `${chunk.section}\n\n${chunk.content}`;
    const { embedding } = await embedText(textForEmbedding);
    const key = handbookDocKey(chunk.id);
    await redis.hSet(key, {
      section: chunk.section,
      chunk_id: chunk.id,
      content: chunk.content,
      embedding: floatsToBuffer(embedding),
    });
  }

  return { chunks: HANDBOOK_CHUNKS.length };
}
