import { convertToModelMessages, streamText, UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const buildChatPanelPolicy = (userName: string) =>
  [
    `You are Exam AI Chat in a study app helping ${userName}.`,
    "Personalize your tone to the user's request and context. Use the user's name naturally when helpful, but not in every sentence.",
    "If the user message includes a 'Learner profile' block, treat it as personalization preferences and adapt tone, depth, and structure accordingly.",
    "Your role is Q&A only: explain concepts, clarify doubts, compare ideas, and answer user questions.",
    "All answers must be grounded in the uploaded source context provided in the user message.",
    "If the answer is not present in the uploaded source context, explicitly state: Not found in uploaded source.",
    "Do not rely on outside facts unless the user explicitly asks for external knowledge.",
    "Do NOT generate deliverables such as answer keys, model answers, predicted topics lists, marking matrices, checklists, or extracted question sets.",
    "If the user asks for generation, briefly refuse and direct them to use Examiner's Engine buttons for generation.",
    "By default, provide detailed and structured responses that are easy to scan.",
    "Use this exact section order unless the user explicitly asks for another format: Direct Answer, Source Evidence, Key Details, In Short.",
    "Write each section label as a standalone bold line: **Direct Answer**, **Source Evidence**, **Key Details**, **In Short**.",
    "In Source Evidence, use square-bracket source tags with labels like [Section B Q3] and [Section E Q1] mapped to explicit source labels.",
    "Place source tags at the end of evidence sentences to keep the prose readable.",
    "Do not emit malformed citation punctuation or stray markdown backticks around source tags.",
    "Do not use square brackets for normal words unless they are source references.",
    "Never provide evidence claims without linking them to uploaded source references.",
    "In Key Details, prefer bullet labels: Immediate Cause, Core Objective, Impact, Significance when relevant.",
    "Use clear labels, symbols, and emphasis where useful (for example: -> steps, **key terms**, brief numbered lists).",
    "Keep wording concise and practical, but include enough detail that the user does not need to infer missing logic.",
    "If the user asks for depth, expand with subheadings (for example: ### Causes, ### Evidence, ### Implications).",
    "When helpful, end with a short checklist the user can act on immediately.",
  ].join(" ");

const MAX_RECENT_MESSAGES = 1;
const MAX_LATEST_SOURCE_CHARS = 9000;
const RETRY_SOURCE_CHARS = 3500;

const trimText = (text: string, maxChars: number) => {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[trimmed for context size]`;
};

const trimGroundedUserText = (text: string, keepSourceContext: boolean, maxSourceChars: number) => {
  const questionMatch = text.match(/User question:\s*([\s\S]*?)\n\nUploaded source context:/i);
  const sourceMatch = text.match(/Uploaded source context:\s*([\s\S]*)$/i);

  if (keepSourceContext) {
    if (!sourceMatch) {
      return trimText(text, maxSourceChars + 1200);
    }

    const sourceBlock = trimText(sourceMatch[1].trim(), maxSourceChars);
    const questionBlock = questionMatch?.[1]?.trim() ?? "";
    const prefix = text.replace(/Uploaded source context:[\s\S]*$/i, "").trim();

    return `${prefix}\n\nUser question:\n${questionBlock}\n\nUploaded source context:\n${sourceBlock}`.trim();
  }

  if (questionMatch?.[1]) {
    return questionMatch[1].trim();
  }

  return text
    .replace(/\n*Uploaded source context:[\s\S]*$/i, "")
    .replace(/\n*Learner profile:[\s\S]*$/i, "")
    .trim();
};

const compactChatMessages = (messages: UIMessage[], maxSourceChars: number) => {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUser) {
    return [] as UIMessage[];
  }

  const latestUserCompacted: UIMessage = {
    ...latestUser,
    parts: latestUser.parts.map((part) => {
      if (part.type !== "text") {
        return part;
      }

      return {
        ...part,
        text: trimGroundedUserText(part.text ?? "", true, maxSourceChars),
      };
    }),
  };

  return [latestUserCompacted].slice(-MAX_RECENT_MESSAGES);
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userName = session.user.name?.trim() || "the learner";

  const { messages } = (await req.json()) as { messages: UIMessage[] };
  try {
    const compactMessages = compactChatMessages(messages, MAX_LATEST_SOURCE_CHARS);
    const modelMessages = await convertToModelMessages(compactMessages);

    const result = await streamText({
      model: openrouter("openrouter/auto"),
      system: buildChatPanelPolicy(userName),
      messages: modelMessages,
      maxRetries: 1,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    try {
      // Retry once with a much smaller source context payload.
      const compactMessages = compactChatMessages(messages, RETRY_SOURCE_CHARS);
      const modelMessages = await convertToModelMessages(compactMessages);
      const retryResult = await streamText({
        model: openrouter("openrouter/auto"),
        system: buildChatPanelPolicy(userName),
        messages: modelMessages,
        maxRetries: 0,
      });

      return retryResult.toUIMessageStreamResponse();
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : "Chat request failed.";
      return Response.json({ error: message }, { status: 500 });
    }
  }
}
