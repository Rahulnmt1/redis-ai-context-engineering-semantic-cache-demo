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
  ensureSearchIndexes,
  handbookDocKey,
  knnSearch,
} from "@/lib/redis-search";

export type RetrievedChunk = {
  chunkId: string;
  section: string;
  content: string;
  distance: number;
};

export type ContextPacket = {
  systemPreamble: string;
  sessionMemory: string;
  retrievedChunks: RetrievedChunk[];
  contextBlock: string;
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

function maxCacheDistance(): number {
  const raw = process.env.SEMANTIC_CACHE_MAX_DISTANCE;
  const n = raw ? Number.parseFloat(raw) : 0.22;
  return Number.isFinite(n) ? n : 0.22;
}

export async function runChatTurn(input: {
  message: string;
  sessionMemory: string;
}): Promise<ChatResult> {
  const redis = await getRedis();
  await ensureSearchIndexes(redis);

  const queryEmbedding = await embedText(input.message);
  const cacheRows = await knnSearch(
    redis,
    INDEX_SEMANTIC_CACHE,
    queryEmbedding,
    1,
    ["original_query", "answer"],
  );
  const best = cacheRows[0];
  const threshold = maxCacheDistance();
  if (best && best.distance <= threshold && best.fields.answer) {
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
      redis: {
        handbookIndex: INDEX_HANDBOOK,
        cacheIndex: INDEX_SEMANTIC_CACHE,
      },
    };
  }

  const rows = await knnSearch(
    redis,
    INDEX_HANDBOOK,
    queryEmbedding,
    3,
    ["section", "content", "chunk_id"],
  );
  const retrieved: RetrievedChunk[] = rows.map((r) => ({
    chunkId: r.fields.chunk_id ?? "",
    section: r.fields.section ?? "",
    content: r.fields.content ?? "",
    distance: r.distance,
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

  const answer = await generateAnswer({
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
  });

  return {
    answer,
    contextPacket,
    semanticCache: {
      hit: false,
      distance: best?.distance,
      matchedQuery: best?.fields.original_query,
      redisKey: key,
      maxDistance: threshold,
    },
    llmCalled: true,
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
    const embedding = await embedText(textForEmbedding);
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
