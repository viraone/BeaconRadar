import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "@/lib/env";

/**
 * The single LLM entry point. Everything in the app that talks to a model goes
 * through `getLlm().generateJson(...)`, so swapping provider or model is a change
 * in this file (or in LLM_PROVIDER / LLM_MODEL) and nowhere else.
 *
 * Only structured JSON output is exposed on purpose: every caller validates with
 * a zod schema, so prompt injection from crawled text can at most produce a
 * wrong field, never an action.
 */
export type JsonRequest<T> = {
  /** Stable instructions. Keep constant across calls for prompt caching. */
  system: string;
  /** The per-call input, including any untrusted page text, clearly delimited. */
  user: string;
  schema: z.ZodType<T>;
  /** Used for logging and as the schema name sent to the model. */
  task: string;
  /** Used by the mock provider to produce a grounded, deterministic answer. */
  mock: () => T;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
};

export type JsonResult<T> = {
  data: T;
  model: string;
  provider: "anthropic" | "mock";
  usage: { inputTokens: number; outputTokens: number };
};

export interface LlmProvider {
  readonly name: "anthropic" | "mock";
  generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
}

export class LlmRefusalError extends Error {
  constructor(public readonly category: string | null, explanation?: string | null) {
    super(`The model declined this request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}.`);
    this.name = "LlmRefusalError";
  }
}

// ---------------------------------------------------------------- providers

class MockLlm implements LlmProvider {
  readonly name = "mock" as const;
  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const data = req.schema.parse(req.mock());
    return { data, model: "mock", provider: "mock", usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

class AnthropicLlm implements LlmProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  constructor(private model: string, apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    // Beta surface so we can enable server-side refusal fallbacks ("default" routes
    // declined requests to a model that will answer). Thinking is adaptive by
    // default on current models; `effort` is the depth control.
    const message = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: req.maxTokens ?? 16_000,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
      output_config: { format: zodOutputFormat(req.schema), effort: req.effort ?? "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (message.stop_reason === "refusal") {
      const details = message.stop_details && "category" in message.stop_details ? message.stop_details : null;
      throw new LlmRefusalError(details?.category ?? null, details?.explanation ?? null);
    }
    if (message.stop_reason === "max_tokens") {
      throw new Error(`LLM output for "${req.task}" was cut off at max_tokens; raise maxTokens.`);
    }
    if (message.parsed_output == null) {
      throw new Error(`LLM returned no parseable JSON for "${req.task}".`);
    }
    return {
      data: message.parsed_output as T,
      model: message.model,
      provider: "anthropic",
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }
}

// ---------------------------------------------------------------- factory

let cached: LlmProvider | undefined;

export function getLlm(): LlmProvider {
  if (cached) return cached;
  const e = env();
  if (e.LLM_PROVIDER === "anthropic") {
    if (!e.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty.");
    cached = new AnthropicLlm(e.LLM_MODEL, e.ANTHROPIC_API_KEY);
  } else {
    cached = new MockLlm();
  }
  return cached;
}

/** For tests: inject a provider. */
export function setLlmForTests(provider: LlmProvider | undefined) {
  cached = provider;
}

export const mockLlm: LlmProvider = new MockLlm();
