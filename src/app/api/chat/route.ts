import { runChatTurn } from "@/lib/chat-pipeline";
import { ATTRIBUTION_HEADER, AUTHOR_ATTRIBUTION } from "@/lib/attribution";

export const runtime = "nodejs";

const creditHeaders = { [ATTRIBUTION_HEADER]: AUTHOR_ATTRIBUTION };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      sessionMemory?: string;
    };
    const message = String(body.message ?? "").trim();
    const sessionMemory = String(body.sessionMemory ?? "");
    if (!message) {
      return Response.json(
        { error: "message is required" },
        { status: 400, headers: creditHeaders },
      );
    }
    const result = await runChatTurn({ message, sessionMemory });
    return Response.json(result, { headers: creditHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500, headers: creditHeaders },
    );
  }
}
