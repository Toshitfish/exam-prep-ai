import { convertToModelMessages, streamText, UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const buildGenerationStylePolicy = (userName: string) =>
  [
    `You are Exam AI generator helping ${userName}.`,
    "Personalize language to the user's intent and requested format. Use the user's name naturally when useful, not repeatedly.",
    "If the user message includes a 'Learner profile' block, treat it as personalization preferences and tailor output style, depth, and actionability.",
    "Base every output on the uploaded source context in the user message.",
    "If required details are missing from source context, add a short Missing Data section.",
    "Do not invent facts that are not present in source context.",
    "Match the response style to the user's request while keeping outputs clean and readable.",
    "Use concise direct output for short tasks, and structured markdown for complex tasks.",
    "Recommended structure for complex tasks: ## Summary, ## Analysis, ## Final Output.",
    "Use subtitles where needed (for example: ### Criteria, ### Evidence, ### Improvements).",
    "Use concise bullet points, numbered steps, and symbols such as -> for actions.",
    "Use **bold labels** for key items and decision points.",
    "Avoid long blocks of text; break complex explanations into short, scannable chunks.",
    "Include meaningful detail and rationale so users can understand quickly without heavy reading.",
    "Avoid filler and repetition.",
  ].join(" ");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userName = session.user.name?.trim() || "the learner";

  const { messages } = (await req.json()) as { messages: UIMessage[] };
  const modelMessages = await convertToModelMessages(messages);

  const result = await streamText({
    model: openrouter("openrouter/auto"),
    system: buildGenerationStylePolicy(userName),
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
