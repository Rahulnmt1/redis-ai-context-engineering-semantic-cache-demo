import type { RedisClientType } from "redis";
import { floatsToBuffer } from "@/lib/vector";

export const INDEX_HANDBOOK = "idx_company_handbook";
export const INDEX_SEMANTIC_CACHE = "idx_semantic_cache";

const PREFIX_HANDBOOK = "handbook:";
const PREFIX_CACHE = "scache:";

const VECTOR_DIM = 1536;
const VECTOR_FIELD = "embedding";

export type KnnRow = {
  key: string;
  /** RediSearch cosine *distance* for COSINE metric (lower is more similar). */
  distance: number;
  fields: Record<string, string>;
};

function decodeRedisString(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Parse FT.SEARCH array response (DIALECT 2, KNN AS vector_score). */
export function parseFtSearch(raw: unknown): KnnRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: KnnRow[] = [];
  let i = 1;
  while (i < raw.length) {
    const key = decodeRedisString(raw[i++]);
    const fieldList = raw[i++];
    const fields: Record<string, string> = {};
    let distance = Number.POSITIVE_INFINITY;
    if (Array.isArray(fieldList)) {
      for (let j = 0; j + 1 < fieldList.length; j += 2) {
        const fname = decodeRedisString(fieldList[j]);
        const fval = decodeRedisString(fieldList[j + 1]);
        if (fname === "vector_score") {
          const d = Number.parseFloat(fval);
          if (!Number.isNaN(d)) distance = d;
        } else {
          fields[fname] = fval;
        }
      }
    }
    out.push({ key, fields, distance });
  }
  return out;
}

async function indexExists(client: RedisClientType, name: string): Promise<boolean> {
  const listed = await client.sendCommand(["FT._LIST"]);
  if (!Array.isArray(listed)) return false;
  return listed.some((x) => decodeRedisString(x) === name);
}

export async function ensureSearchIndexes(client: RedisClientType): Promise<void> {
  if (!(await indexExists(client, INDEX_HANDBOOK))) {
    await client.sendCommand([
      "FT.CREATE",
      INDEX_HANDBOOK,
      "ON",
      "HASH",
      "PREFIX",
      "1",
      PREFIX_HANDBOOK,
      "SCHEMA",
      "section",
      "TEXT",
      "chunk_id",
      "TAG",
      "content",
      "TEXT",
      VECTOR_FIELD,
      "VECTOR",
      "HNSW",
      "6",
      "TYPE",
      "FLOAT32",
      "DIM",
      String(VECTOR_DIM),
      "DISTANCE_METRIC",
      "COSINE",
    ]);
  }

  if (!(await indexExists(client, INDEX_SEMANTIC_CACHE))) {
    await client.sendCommand([
      "FT.CREATE",
      INDEX_SEMANTIC_CACHE,
      "ON",
      "HASH",
      "PREFIX",
      "1",
      PREFIX_CACHE,
      "SCHEMA",
      "original_query",
      "TEXT",
      "answer",
      "TEXT",
      VECTOR_FIELD,
      "VECTOR",
      "HNSW",
      "6",
      "TYPE",
      "FLOAT32",
      "DIM",
      String(VECTOR_DIM),
      "DISTANCE_METRIC",
      "COSINE",
    ]);
  }
}

export async function dropSearchIndexes(client: RedisClientType): Promise<void> {
  for (const idx of [INDEX_HANDBOOK, INDEX_SEMANTIC_CACHE]) {
    if (await indexExists(client, idx)) {
      try {
        await client.sendCommand(["FT.DROPINDEX", idx, "DD"]);
      } catch {
        await client.sendCommand(["FT.DROPINDEX", idx]);
      }
    }
  }
}

export async function knnSearch(
  client: RedisClientType,
  indexName: string,
  vector: number[],
  k: number,
  returnFields: string[],
): Promise<KnnRow[]> {
  const blob = floatsToBuffer(vector);
  const ret = ["RETURN", String(returnFields.length + 1), ...returnFields, "vector_score"];
  const raw = await client.sendCommand([
    "FT.SEARCH",
    indexName,
    `*=>[KNN ${k} @${VECTOR_FIELD} $q AS vector_score]`,
    "PARAMS",
    "2",
    "q",
    blob,
    ...ret,
    "DIALECT",
    "2",
  ]);
  return parseFtSearch(raw);
}

export function handbookDocKey(chunkId: string): string {
  return `${PREFIX_HANDBOOK}${chunkId}`;
}

export function cacheDocKey(id: string): string {
  return `${PREFIX_CACHE}${id}`;
}

export { PREFIX_HANDBOOK, PREFIX_CACHE, VECTOR_DIM, VECTOR_FIELD };
