import { seedHandbookVectors } from "@/lib/chat-pipeline";
import { getRedis } from "@/lib/redis-client";
import { dropSearchIndexes } from "@/lib/redis-search";
import { ATTRIBUTION_HEADER, AUTHOR_ATTRIBUTION } from "@/lib/attribution";

export const runtime = "nodejs";

const creditHeaders = { [ATTRIBUTION_HEADER]: AUTHOR_ATTRIBUTION };

export async function GET() {
  return Response.json(
    {
      ok: true,
      hint: "POST JSON { reset?: boolean } to (re)seed handbook vectors in Redis.",
    },
    { headers: creditHeaders },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { reset?: boolean };
    const redis = await getRedis();
    if (body.reset) {
      await dropSearchIndexes(redis);
    }
    const { chunks } = await seedHandbookVectors();
    return Response.json({ ok: true, chunks }, { headers: creditHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500, headers: creditHeaders },
    );
  }
}
