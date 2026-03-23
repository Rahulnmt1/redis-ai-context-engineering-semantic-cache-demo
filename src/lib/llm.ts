import OpenAI from "openai";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export async function generateAnswer(input: {
  userMessage: string;
  systemPreamble: string;
  contextBlock: string;
}): Promise<{ answer: string; usage: LlmUsage }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: input.systemPreamble,
      },
      {
        role: "user",
        content: `${input.contextBlock}\n\nEmployee question:\n${input.userMessage}`,
      },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Chat completion was empty");
  }
  const u = completion.usage;
  const usage: LlmUsage = {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? (u?.prompt_tokens ?? 0) + (u?.completion_tokens ?? 0),
  };
  return { answer: text, usage };
}
