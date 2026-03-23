# OpenAI token table — column meanings (plain language)

The **OpenAI tokens (this session)** panel lists one row per question you send. The numbers are **tokens**: how OpenAI measures **how much text** they processed.

**Billed total ≈** adds **OpenAI question parsing tokens + Token used by OpenAI for prompt + response** for the session — a rough idea of what you are charged for **through this chat UI**. It does **not** include embeddings used when you click **Seed Redis** (handbook chunks indexed separately).

---

## OpenAI question parsing tokens

When you type a question, the app sends **that text** to OpenAI. OpenAI **reads** your words and does work to turn them into a **numeric description** of what the sentence is about (think of a hidden “meaning barcode”).

That step is **separate** from the assistant writing a chat reply. In everyday terms:

> *“Please analyze this exact question so we can compare it to other questions and to the handbook.”*

**What the number means:** how much of your question OpenAI had to process for **that** step **on this turn**.

**Why it appears every time:** each new question needs this processing so the app can:

1. Check the **semantic cache** (“have we already answered something *like this*?”).
2. If not, search the **handbook** in Redis for relevant paragraphs.

So you see this column on **every** row — **even when the answer is reused from cache** and no new chat reply is generated.

**One-line summary:** *Tokens used to understand and encode **this** user question so the app can search the cache and the handbook.*

**Short question → smaller number. Long question → bigger number.**

---

## Token used by OpenAI for prompt + response

**What the number means:** tokens OpenAI used for the **chat reply** path: the **instructions + context + your question** sent to the model (**prompt**) and the **assistant’s answer** (**completion**), reported as **`total_tokens`** for that API call.

**When it is zero:** on a **semantic cache hit**, the app does **not** call the chat model again, so this column is **0** for that turn.

**One-line summary:** *Tokens for the actual “write the answer” step — only when the LLM runs this turn.*

---

## Token skipped by OpenAI for prompt + response

**What the number means:** on a **cache hit**, there is **no** new chat completion call **this turn**, so you do not spend prompt+completion tokens for a fresh answer.

The UI shows a number from the **first time** that cached answer was created: we stored OpenAI’s **`total_tokens`** for that earlier chat call on the Redis cache entry. It is an **estimate** of “about how big a repeat chat call would have been,” not something OpenAI measures on the hit turn itself.

**When it is zero:** on a **miss**, or if an old cache entry has no stored usage.

**One-line summary:** *Approximate chat (prompt + reply) tokens you did **not** spend this turn because the answer came from cache — value from the original stored completion.*

---

## Related code

- Per-turn usage is returned from `POST /api/chat` (`usage` in `src/lib/chat-pipeline.ts`).
- Embedding usage: `src/lib/embeddings.ts`
- Chat usage: `src/lib/llm.ts`
- Cache entries store `llm_total_tokens` for hit-turn reporting.
