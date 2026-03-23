# Demo query sets

These sequences were **tested end-to-end** with this repo. Use **Reset + seed** before each clean run so the semantic cache starts empty.

- Default **`SEMANTIC_CACHE_MAX_DISTANCE`** in code is **0.27**; a stricter **0.22** in `.env` still works for **Query Set 1** step 3 / Alt3 and **Query Set 2** as written.
- Semantic cache compares **embeddings** of the user question. For parental leave, avoid casual rewrites (“new baby”, “maximum length”) that sit near cosine distance **~0.33** vs step 1 (miss under 0.27). Prefer the **step 3 / Alt3** lines below.

---

## Query Set 1 — Employee leaves

| Steps | Query | Narration |
| :--- | :--- | :--- |
| **1** | How many PTO days do full-time employees get per year? | **Context engineering:** inspector shows system preamble, session memory, 3 handbook chunks, each with Redis key, RediSearch KNN query, and cos-dist, then the assembled context block. **Semantic cache:** miss → LLM runs. |
| **2** | Can unused PTO roll over? | Different topic → new retrieval (different chunks / distances). Cache: miss again. |
| **3** | How many PTO days do new hires get? | Same intent as step 1 → **cache hit** (with default **0.27** threshold): inspector shows no chunks / “semantic cache hit”; Cache hits increments, LLM calls unchanged. |
| **Alt3** | What is the annual PTO accrual for full-time employees? | Same as step 3 if you want a tighter paraphrase (also works with default threshold). |

---

## Query Set 2 — Parental leave

| Steps | Query | Narration |
| :--- | :--- | :--- |
| **1** | How much parental leave is available for birth or adoption? | **Context engineering:** preamble + memory + 3 handbook chunks (expect **Parental leave** strong), Redis keys, KNN query, cos-dist, context block. **Semantic cache:** miss → LLM. |
| **2** | Does sick time come out of my PTO balance? | Different topic → new retrieval (**Sick time vs PTO**). Cache: miss again. |
| **3** | How long is parental leave for adoption or birth? | Same intent as step 1 → **cache hit** at **0.22** / **0.27** (≈0.10 vs step 1): no chunks / cache-hit note; cache counter up, LLM calls unchanged. |
| **Alt3** | What parental leave is offered for birth and adoption? | Same as step 3 (≈0.08 vs step 1). |

---

## Query Set 3 — PTO carryover

| Steps | Query | Narration |
| :--- | :--- | :--- |
| **1** | How many unused PTO days can roll over into the next calendar year? | **Context engineering:** chunks centered on **PTO — Carryover** (5 days, March 31, etc.). Cache: miss → LLM. |
| **2** | Do company holidays count against my PTO balance? | Different topic → **Company holidays** / related chunks. Cache: miss. |
| **3** | What is the cap on PTO rollover to the following year? | Same intent as step 1 → **cache hit** (same pattern as Set 1 step 3). |
| **Alt3** | Up to how many PTO days can carry over yearly? | Shorter paraphrase; same as step 3 if it still hits. |

If set 3 step 3 misses in your environment, try Alt3 or tighten wording toward *rollover / carry over / unused PTO / next year*.
