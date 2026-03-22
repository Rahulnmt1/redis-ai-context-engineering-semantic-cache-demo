"use client";

import { useCallback, useState } from "react";

type RetrievedChunk = {
  chunkId: string;
  section: string;
  content: string;
  distance: number;
};

type ContextPacket = {
  systemPreamble: string;
  sessionMemory: string;
  retrievedChunks: RetrievedChunk[];
  contextBlock: string;
};

type ChatApiResponse = {
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
  redis: { handbookIndex: string; cacheIndex: string };
};

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionMemory, setSessionMemory] = useState(
    "Employee asked about PTO earlier in this session (demo memory line).",
  );
  const [lastContext, setLastContext] = useState<ContextPacket | null>(null);
  const [lastCache, setLastCache] = useState<ChatApiResponse["semanticCache"] | null>(
    null,
  );
  const [llmCalls, setLlmCalls] = useState(0);
  const [cacheHits, setCacheHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionMemory }),
      });
      const data = (await res.json()) as ChatApiResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
      setLastContext(data.contextPacket);
      setLastCache(data.semanticCache);
      if (data.llmCalled) setLlmCalls((c) => c + 1);
      else setCacheHits((c) => c + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `⚠️ ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionMemory]);

  const seed = useCallback(async (reset: boolean) => {
    setSeedStatus("Seeding…");
    setError(null);
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset }),
      });
      const data = (await res.json()) as { ok?: boolean; chunks?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Seed failed");
      setSeedStatus(`Indexed ${data.chunks} handbook chunks in Redis.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setSeedStatus(null);
      setError(msg);
    }
  }, []);

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Company Leaves — Context engineering & semantic cache
            </h1>
            <p className="text-sm text-zinc-400">
              Redis 8 (official image) + RediSearch vectors · OpenAI embeddings & chat
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => seed(false)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Seed Redis
            </button>
            <button
              type="button"
              onClick={() => seed(true)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              Reset + seed
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 lg:grid-cols-12">
        <section className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 lg:col-span-4">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Chat</h2>
            <p className="text-xs text-zinc-500">
              Try a question, then rephrase it to trigger a semantic cache hit.
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="min-h-[280px] flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-800 bg-black/30 p-3">
              {messages.length === 0 && (
                <p className="text-sm text-zinc-500">
                  Ask: &quot;How many PTO days do new hires get?&quot; then: &quot;What is
                  annual vacation accrual?&quot;
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={
                    m.role === "user"
                      ? "ml-6 rounded-lg bg-sky-900/40 px-3 py-2 text-sm text-sky-50"
                      : "mr-6 rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100"
                  }
                >
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
                    {m.role}
                  </span>
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="mr-6 animate-pulse rounded-lg bg-zinc-800/50 px-3 py-4 text-sm text-zinc-500">
                  Thinking…
                </div>
              )}
            </div>
            {error && (
              <p className="text-xs text-red-400">
                {error} — check <code className="text-red-300">OPENAI_API_KEY</code> and Redis.
              </p>
            )}
            {seedStatus && <p className="text-xs text-emerald-400">{seedStatus}</p>}
            <label className="text-xs font-medium text-zinc-400">
              Session memory (context engineering)
              <textarea
                value={sessionMemory}
                onChange={(e) => setSessionMemory(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-600"
              />
            </label>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Ask about leave policy…"
                className="flex-1 rounded-lg border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-600"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={loading}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 lg:col-span-4">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Context inspector</h2>
            <p className="text-xs text-zinc-500">
              The briefing packet: rules, memory, and retrieved handbook excerpts for the last
              turn.
            </p>
          </div>
          <div className="max-h-[560px] space-y-4 overflow-y-auto p-4 text-sm">
            {!lastContext && (
              <p className="text-zinc-500">Send a message to populate the inspector.</p>
            )}
            {lastContext && (
              <>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    System preamble
                  </h3>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
                    {lastContext.systemPreamble}
                  </pre>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Session memory
                  </h3>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
                    {lastContext.sessionMemory || "(empty)"}
                  </pre>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Retrieved chunks (vector search)
                  </h3>
                  {lastContext.retrievedChunks.length === 0 ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      None on this turn (often a semantic cache hit).
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {lastContext.retrievedChunks.map((c) => (
                        <li
                          key={c.chunkId}
                          className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-300"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-zinc-400">
                            <span className="font-medium text-sky-300">{c.section}</span>
                            <span className="font-mono text-[10px]">
                              cos-dist {c.distance.toFixed(4)}
                            </span>
                          </div>
                          <p className="text-zinc-400">{c.content}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Context block sent with the question
                  </h3>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-black/40 p-3 text-[11px] text-zinc-400">
                    {lastContext.contextBlock}
                  </pre>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 lg:col-span-4">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Semantic cache rail</h2>
            <p className="text-xs text-zinc-500">
              Redis vector index on prior queries. Hit if nearest neighbor cosine distance ≤{" "}
              <code className="text-zinc-400">
                {lastCache ? lastCache.maxDistance.toFixed(3) : "…"}
              </code>{" "}
              (<code className="text-zinc-400">SEMANTIC_CACHE_MAX_DISTANCE</code>).
            </p>
          </div>
          <div className="space-y-4 p-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">LLM calls</p>
                <p className="text-2xl font-semibold text-white">{llmCalls}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                  Cache hits
                </p>
                <p className="text-2xl font-semibold text-emerald-400">{cacheHits}</p>
              </div>
            </div>
            {!lastCache && (
              <p className="text-xs text-zinc-500">Run a query to see hit/miss diagnostics.</p>
            )}
            {lastCache && (
              <div
                className={
                  lastCache.hit
                    ? "rounded-lg border border-emerald-700/60 bg-emerald-950/40 p-4"
                    : "rounded-lg border border-amber-700/50 bg-amber-950/30 p-4"
                }
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                  {lastCache.hit ? "Hit" : "Miss"}
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  Nearest cached query cosine distance:{" "}
                  <span className="font-mono text-zinc-200">
                    {lastCache.distance !== undefined
                      ? lastCache.distance.toFixed(4)
                      : "n/a"}
                  </span>
                </p>
                {lastCache.matchedQuery && (
                  <p className="mt-2 text-xs text-zinc-400">
                    Neighbor text:{" "}
                    <span className="text-zinc-200">&quot;{lastCache.matchedQuery}&quot;</span>
                  </p>
                )}
                {lastCache.redisKey && (
                  <p className="mt-2 break-all font-mono text-[11px] text-zinc-500">
                    {lastCache.redisKey}
                  </p>
                )}
              </div>
            )}
            <div className="rounded-lg border border-dashed border-zinc-700 p-3 text-xs text-zinc-500">
              <p className="font-medium text-zinc-400">Webinar beats</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Seed handbook vectors (one-time per environment).</li>
                <li>Show inspector changing when the question changes.</li>
                <li>Rephrase the same intent and watch a cache hit (no retrieval / no LLM).</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
