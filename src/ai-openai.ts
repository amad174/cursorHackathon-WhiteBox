import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewIssue } from "./review.js";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_SOURCE_CHARS = 14_000;
const MAX_TEST_CHARS = 8_000;

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n/* … truncated for API size … */\n`;
}

function buildUserPrompt(issue: ReviewIssue, sourceText: string, testText?: string): string {
  const rel = path.basename(issue.sourceFile);
  const testHint = testText
    ? `\n\nExisting sibling test file (extend or replace as needed):\n\`\`\`ts\n${truncate(testText, MAX_TEST_CHARS)}\n\`\`\``
    : "";
  return `You help with software QA. The following TypeScript module needs Vitest tests for the exported API.

**Issue:** ${issue.kind}
**Focus symbols:** ${issue.symbol}
**File:** ${rel}

**Module source:**
\`\`\`ts
${truncate(sourceText, MAX_SOURCE_CHARS)}
\`\`\`
${testHint}

Respond with:
1) A short bullet list (2–4 items) of meaningful test cases to add for ${issue.symbol}.
2) Then a single fenced code block \`\`\`ts ... \`\`\` containing a **complete** Vitest test file that imports from "./${path.basename(issue.sourceFile, ".ts")}.js" (ESM) and uses describe/it/expect. Only Vitest + the project imports—no extra libraries unless already implied by the source.`;
}

export type OpenAiChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
};

export async function fetchOpenAiChat(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  userContent: string;
  signal?: AbortSignal;
}): Promise<string> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.3,
      max_tokens: 2_048,
      messages: [
        {
          role: "system",
          content:
            "You write concise, practical Vitest tests and QA notes. Output follows the user format exactly.",
        },
        { role: "user", content: params.userContent },
      ],
    }),
    signal: params.signal,
  });
  const data = (await res.json()) as OpenAiChatResponse;
  if (!res.ok) {
    const msg = data.error?.message ?? res.statusText;
    throw new Error(`OpenAI API error (${res.status}): ${msg}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new Error("OpenAI returned empty content");
  return text.trim();
}

export async function aiSuggestionForIssue(issue: ReviewIssue): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const sourceText = await readFile(issue.sourceFile, "utf8");
  let testText: string | undefined;
  if (issue.testFile) {
    try {
      testText = await readFile(issue.testFile, "utf8");
    } catch {
      testText = undefined;
    }
  }
  const userContent = buildUserPrompt(issue, sourceText, testText);
  const signal = AbortSignal.timeout(90_000);
  return fetchOpenAiChat({ apiKey, baseUrl, model, userContent, signal });
}

export async function printAiSuggestionsForIssues(
  issues: ReviewIssue[],
  maxCalls: number
): Promise<void> {
  if (issues.length === 0) return;
  if (!process.env.OPENAI_API_KEY) {
    process.stdout.write("\n(AI) Skipped: set OPENAI_API_KEY to use --ai (optional OPENAI_MODEL, OPENAI_BASE_URL).\n");
    return;
  }
  const slice = issues.slice(0, Math.max(0, maxCalls));
  process.stdout.write("\n--- AI-assisted suggestions (OpenAI-compatible chat) ---\n\n");
  for (let i = 0; i < slice.length; i++) {
    const issue = slice[i];
    process.stdout.write(`[${i + 1}/${slice.length}] ${issue.kind} — ${issue.symbol}\n`);
    try {
      const text = await aiSuggestionForIssue(issue);
      process.stdout.write(`${text}\n\n`);
    } catch (e) {
      process.stderr.write(`(AI) Error: ${(e as Error).message}\n\n`);
    }
  }
  if (issues.length > slice.length) {
    process.stdout.write(`(AI) Note: ${issues.length - slice.length} more issue(s) not sent (see --ai-max).\n`);
  }
}
