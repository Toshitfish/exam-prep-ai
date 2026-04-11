import { convertToModelMessages, streamText, UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const CHAT_PANEL_POLICY = [
  "You are Exam AI Chat in a study app.",
  "Your role is Q&A only: explain concepts, clarify doubts, compare ideas, and answer user questions.",
  "All answers must be grounded in the uploaded source context provided in the user message.",
  "If the answer is not present in the uploaded source context, explicitly state: Not found in uploaded source.",
  "Do not rely on outside facts unless the user explicitly asks for external knowledge.",
  "Do NOT generate deliverables such as answer keys, model answers, predicted topics lists, marking matrices, checklists, or extracted question sets.",
  "If the user asks for generation, briefly refuse and direct them to use Examiner's Engine buttons for generation.",
  "Always format responses for high readability using markdown headings and bullet points.",
  "Default response structure: ## Summary, ## Analysis, ## What To Do Next.",
  "Under each section, use short bullets instead of dense paragraphs.",
  "Use clear labels, symbols, and emphasis where useful (for example: -> steps, **key terms**, brief numbered lists).",
  "Keep wording concise and practical, but include enough detail that the user does not need to infer missing logic.",
  "If the user asks for depth, expand the Analysis section with subheadings (for example: ### Causes, ### Evidence, ### Implications).",
  "When helpful, end with a short checklist the user can act on immediately.",
].join(" ");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages } = (await req.json()) as { messages: UIMessage[] };
  const modelMessages = await convertToModelMessages(messages);

  const result = await streamText({
    model: openrouter("openrouter/auto"),
    system: CHAT_PANEL_POLICY,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
