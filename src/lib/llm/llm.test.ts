import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmHttpError, OpenAiCompatibleLlm } from "./llm";

const schema = z.object({ name: z.string(), count: z.number().int() });

type Call = { body: Record<string, unknown>; headers: Record<string, string> };

function fakeApi(responses: Array<{ status?: number; content?: string | null; finish?: string; raw?: string }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = JSON.parse(String(init?.body));
    calls.push({ body, headers });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r.status && r.status >= 400) return new Response(r.raw ?? "err", { status: r.status });
    return new Response(
      JSON.stringify({
        model: "deepseek-flash",
        choices: [{ message: { content: r.content ?? null }, finish_reason: r.finish ?? "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function provider(fetchImpl: typeof fetch) {
  return new OpenAiCompatibleLlm({ name: "deepseek", baseUrl: "https://api.deepseek.com/", apiKey: "k", model: "deepseek-flash", fetchImpl });
}

const req = { task: "t", system: "You extract things.", user: "Extract.", schema, mock: () => ({ name: "m", count: 0 }) };

describe("OpenAiCompatibleLlm (DeepSeek)", () => {
  it("sends JSON mode, the schema in the system prompt, bearer auth, and returns validated data", async () => {
    const api = fakeApi([{ content: '{"name":"Acme","count":3}' }]);
    const res = await provider(api.fetchImpl).generateJson(req);
    expect(res).toEqual({ data: { name: "Acme", count: 3 }, model: "deepseek-flash", provider: "deepseek", usage: { inputTokens: 10, outputTokens: 5 } });
    expect(api.calls).toHaveLength(1);
    const { body, headers } = api.calls[0];
    expect(headers.authorization).toBe("Bearer k");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("deepseek-flash");
    const sys = (body.messages as Array<{ role: string; content: string }>)[0];
    expect(sys.role).toBe("system");
    expect(sys.content).toContain("You extract things.");
    expect(sys.content).toMatch(/json/i);
    expect(sys.content).toContain('"count"');
  });

  it("strips markdown fences", async () => {
    const api = fakeApi([{ content: '```json\n{"name":"A","count":1}\n```' }]);
    expect((await provider(api.fetchImpl).generateJson(req)).data).toEqual({ name: "A", count: 1 });
  });

  it("retries once with validation errors when the JSON does not match the schema", async () => {
    const api = fakeApi([{ content: '{"name":"A","count":"three"}' }, { content: '{"name":"A","count":3}' }]);
    const res = await provider(api.fetchImpl).generateJson(req);
    expect(res.data.count).toBe(3);
    expect(api.calls).toHaveLength(2);
    const msgs = api.calls[1].body.messages as Array<{ role: string; content: string }>;
    expect(msgs.at(-1)?.role).toBe("user");
    expect(msgs.at(-1)?.content).toContain("count");
  });

  it("retries once on empty content, then fails clearly", async () => {
    const api = fakeApi([{ content: "" }, { content: "" }]);
    await expect(provider(api.fetchImpl).generateJson(req)).rejects.toThrow(/after 2 attempts.*empty/i);
    expect(api.calls).toHaveLength(2);
  });

  it("surfaces truncation", async () => {
    const api = fakeApi([{ content: '{"name":"A"', finish: "length" }]);
    await expect(provider(api.fetchImpl).generateJson(req)).rejects.toThrow(/max_tokens/);
  });

  it("surfaces HTTP errors with a key hint on 401", async () => {
    const api = fakeApi([{ status: 401 }]);
    await expect(provider(api.fetchImpl).generateJson(req)).rejects.toBeInstanceOf(LlmHttpError);
    await expect(provider(api.fetchImpl).generateJson(req)).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });
});
