import OpenAI from "openai";

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

export async function generateAnswer(input: {
  userMessage: string;
  systemPreamble: string;
  contextBlock: string;
}): Promise<string> {
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
  return text;
}
