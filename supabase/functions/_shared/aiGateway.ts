// Canonical Lovable AI Gateway client.
// Every model call goes through here: one base URL, one key read, one model
// default set, one failure vocabulary. No prompt logic lives in this file.

import { type FailureKind, providerFailureKind } from "./errors.ts";

const BASE = "https://ai.gateway.lovable.dev/v1";

export const MODELS = {
  fast: "google/gemini-2.5-flash",
  reasoning: "google/gemini-2.5-pro",
  lite: "google/gemini-2.5-flash-lite",
  embedding: "openai/text-embedding-3-small",
} as const;

export type GatewayResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: FailureKind; status: number; detail?: string };

function apiKey(): string {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  return key;
}

async function post<T>(path: string, body: unknown): Promise<GatewayResult<T>> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error(`[vanta] ai gateway ${path} ${r.status}: ${detail.slice(0, 300)}`);
    return { ok: false, kind: providerFailureKind(r.status), status: r.status };
  }
  return { ok: true, data: (await r.json()) as T };
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  model?: string;
  temperature?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  max_completion_tokens?: number;
};

/** Raw chat completion (full gateway response) for callers that need tool calls. */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<GatewayResult<any>> {
  const { model = MODELS.fast, ...rest } = options;
  return await post<any>("/chat/completions", { model, messages, ...rest });
}

/** Chat completion reduced to its text content. */
export async function chatText(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<GatewayResult<string>> {
  const res = await chatCompletion(messages, options);
  if (!res.ok) return res;
  const content: string = res.data?.choices?.[0]?.message?.content?.trim() ?? "";
  return { ok: true, data: content };
}

/** Single-input embedding vector. */
export async function embedText(
  input: string,
  model: string = MODELS.embedding,
): Promise<GatewayResult<number[]>> {
  const res = await post<any>("/embeddings", { model, input });
  if (!res.ok) return res;
  return { ok: true, data: (res.data?.data?.[0]?.embedding ?? []) as number[] };
}

/** Batch embeddings, order preserved. */
export async function embedBatch(
  inputs: string[],
  model: string = MODELS.embedding,
): Promise<GatewayResult<number[][]>> {
  const res = await post<any>("/embeddings", { model, input: inputs });
  if (!res.ok) return res;
  const rows = (res.data?.data ?? []) as { embedding: number[] }[];
  return { ok: true, data: rows.map((r) => r.embedding) };
}

/** Strip ```json fences and parse. Returns null when the model did not comply. */
export function parseJsonBlock<T = unknown>(text: string): T | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
