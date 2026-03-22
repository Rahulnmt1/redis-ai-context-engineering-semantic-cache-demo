import { createClient } from "redis";
import type { RedisClientType } from "redis";

const g = globalThis as typeof globalThis & { __companyLeavesRedis?: RedisClientType };

export async function getRedis(): Promise<RedisClientType> {
  if (!g.__companyLeavesRedis) {
    const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    const client = createClient({ url });
    client.on("error", (err) => {
      console.error("[redis]", err);
    });
    g.__companyLeavesRedis = client as unknown as RedisClientType;
  }
  const c = g.__companyLeavesRedis;
  if (!c.isOpen) {
    await c.connect();
  }
  return c;
}
