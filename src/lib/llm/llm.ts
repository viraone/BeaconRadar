import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * The single LLM entry point. Everything in the app that talks to a model goes
 * through `getLlm().generateJson(...)`, so swapping provider or model is a change
 * in this file (or in LLM_PROVIDER / LLM_MODEL) and nowhere else.
 *
 * Providers: deepseek (default for this project), anthropic, mock.
 *
 * Only structured JSON output is exposed on purpose: every caller validates with
 * a zod schema, so prompt injection from crawled text can at most produce a
 * wrong field, never an action.
 */
export type ProviderName = "deepseek" | "anthropic" | "mock";

export type JsonRequest<T> = {
  /** Stable instructions. Keep constant across calls for prompt caching. */
  system: string;
  /** The per-call input, including any untrusted page text, clearly delimited. */
  user: string;
  schema: z.ZodType<T>;
  /** Used for logging and error messages. */
  task: string;
  /** Used by the mock provider to produce a grounded, deterministic answer. */
  mock: () => T;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
};

export type JsonResult<T> = {
  data: T;
  model: string;
  provider: ProviderName;
  usage: { inputTokens: number; outputTokens: number };
};

export interface LlmProvider {
  readonly name: ProviderName;
  generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>>;
}

export class LlmRefusalError extends Error {
  constructor(public readonly category: string | null, explanation?: string | null) {
    super(`The model declined this request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}.`);
    this.name = "LlmRefusalError";
  }
}

export class LlmHttpError extends Error {
  constructor(public readonly status: number, body: string, provider: string) {
    super(`${provider} API error ${status}: ${body.slice(0, 300)}`);
    this.name = "LlmHttpError";
  }
}

export const DEFAULT_MODELS: Record<Exclude<ProviderName, "mock">, string> = {
  deepseek: "deepseek-flash",
  anthropic: "claude-opus-5-5",
};

// ---------------------------------------------------------------- mock

class MockLlm implements LlmProvider {
  readonly name = "mock" as const;
  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const data = req.schema.parse(req.mock());
    return { data, model: "mock", provider: "mock", usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

// ---------------------------------------------------------------- deepseek (OpenAI-compatible chat completions)

export type OpenAiCompatibleOptions = {
  name: "deepseek";
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * DeepSeek speaks the OpenAI chat-completions format. Its JSON mode
 * (`response_format: {type: "json_object"}`) guarantees syntactically valid JSON
 * but does not enforce a schema, so we put the JSON Schema in the system prompt,
 * validate with zod, and retry once with the validation errors if needed.
 */
export class OpenAiCompatibleLlm implements LlmProvider {
  readonly name: "deepseek";
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.name = opts.name;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
    const schemaJson = JSON.stringify(z.toJSONSchema(req.schema));
    const system =
      `${req.system}\n\n` +
      `Output format: respond with exactly one JSON object (json) that validates against the JSON Schema below. ` +
      `No prose, no markdown fences, no comments. Use null or empty arrays rather than inventing values.\n` +
      `JSON Schema:\n${schemaJson}`;
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: req.user },
    ];

    let lastProblem = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.chat(messages, req.maxTokens ?? 16_000);
      const content = (res.content ?? "").trim();

      if (res.finishReason === "length") {
        throw new Error(`LLM output for "${req.task}" was cut off at max_tokens; raise maxTokens.`);
      }
      if (res.finishReason === "content_filter") {
        throw new LlmRefusalError("content_filter");
      }

      let candidate: unknown;
      try {
        candidate = JSON.parse(stripFences(content));
      } catch {
        lastProblem = content ? "Response was not valid JSON." : "Response was empty.";
        messages.push({ role: "assistant", content: content || "(empty)" }, { role: "user", content: `${lastProblem} Return only the JSON object (json) described by the schema.` });
        continue;
      }
      const parsed = req.schema.safeParse(candidate);
      if (parsed.success) {
        return { data: parsed.data, model: res.model ?? this.opts.model, provider: this.name, usage: res.usage };
      }
      lastProblem = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).slice(0, 10).join("; ");
      messages.push({ role: "assistant", content }, { role: "user", content: `That JSON did not validate against the schema: ${lastProblem}. Return the corrected JSON object (json) only.` });
    }
    throw new Error(`LLM did not return schema-valid JSON for "${req.task}" after 2 attempts: ${lastProblem}`);
  }

  private async chat(messages: ChatMessage[], maxTokens: number): Promise<{ content: string | null; finishReason: string | null; model: string | null; usage: { inputTokens: number; outputTokens: number } }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${this.opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.opts.model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          temperature: 0.2,
          stream: false,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 401) throw new LlmHttpError(401, "invalid API key (check DEEPSEEK_API_KEY)", this.name);
        throw new LlmHttpError(res.status, body, this.name);
      }
      const json = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = json.choices?.[0];
      return {
        content: choice?.message?.content ?? null,
        finishReason: choice?.finish_reason ?? null,
        model: json.model ?? null,
        usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
      };
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Error(`${this.name} request timed out after ${this.timeoutMs}ms`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

function stripFences(s: string): string {
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : s;
}

// ---------------------------------------------------------------- anthropic

class AnthropicLlm implements LlmProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  constructor(private model: string, apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async generateJson<T>(req: JsonRequest<T>): Promise<JsonResult<T>> {
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
  switch (e.LLM_PROVIDER) {
    case "deepseek": {
      if (!e.DEEPSEEK_API_KEY) throw new Error("LLM_PROVIDER=deepseek but DEEPSEEK_API_KEY is empty. Add it to .env.local (or set LLM_PROVIDER=mock).");
      cached = new OpenAiCompatibleLlm({ name: "deepseek", baseUrl: e.DEEPSEEK_BASE_URL, apiKey: e.DEEPSEEK_API_KEY, model: e.LLM_MODEL ?? DEFAULT_MODELS.deepseek });
      break;
    }
    case "anthropic": {
      if (!e.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty.");
      cached = new AnthropicLlm(e.LLM_MODEL ?? DEFAULT_MODELS.anthropic, e.ANTHROPIC_API_KEY);
      break;
    }
    default:
      cached = new MockLlm();
  }
  return cached;
}

/** For tests: inject a provider. */
export function setLlmForTests(provider: LlmProvider | undefined) {
  cached = provider;
}

export const mockLlm: LlmProvider = new MockLlm();
