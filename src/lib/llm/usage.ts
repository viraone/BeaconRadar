import { and, desc, eq, gte, sql } from "drizzle-orm";
import { priceFor } from "@/config/llm-pricing";
import { db, schema } from "@/lib/db/client";
import { env } from "@/lib/env";

/** USD upper-bound estimate for one call; null when the model has no known price. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export type UsageRecord = { workspaceId: string | null; provider: string; model: string; task: string; inputTokens: number; outputTokens: number };

/** Fire-and-forget insert; never throws into the caller. */
export async function recordUsage(u: UsageRecord): Promise<void> {
  try {
    const cost = estimateCostUsd(u.model, u.inputTokens, u.outputTokens) ?? 0;
    await db.insert(schema.llmUsage).values({ ...u, estimatedCostUsd: cost.toFixed(6) });
  } catch (e) {
    console.error("[llm] could not record usage", (e as Error).message);
  }
}

export type UsageSummary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  byTask: Array<{ task: string; calls: number; tokens: number; estimatedCostUsd: number }>;
  byModel: Array<{ model: string; calls: number; estimatedCostUsd: number }>;
  since: Date;
};

export async function loadUsageSummary(workspaceId: string, days = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const where = and(eq(schema.llmUsage.workspaceId, workspaceId), gte(schema.llmUsage.createdAt, since));
  const [tot] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.llmUsage.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.llmUsage.outputTokens}),0)::int`,
      cost: sql<string>`coalesce(sum(${schema.llmUsage.estimatedCostUsd}),0)`,
    })
    .from(schema.llmUsage)
    .where(where);
  const byTask = await db
    .select({ task: schema.llmUsage.task, calls: sql<number>`count(*)::int`, tokens: sql<number>`sum(${schema.llmUsage.inputTokens} + ${schema.llmUsage.outputTokens})::int`, cost: sql<string>`sum(${schema.llmUsage.estimatedCostUsd})` })
    .from(schema.llmUsage)
    .where(where)
    .groupBy(schema.llmUsage.task)
    .orderBy(desc(sql`sum(${schema.llmUsage.estimatedCostUsd})`));
  const byModel = await db
    .select({ model: schema.llmUsage.model, calls: sql<number>`count(*)::int`, cost: sql<string>`sum(${schema.llmUsage.estimatedCostUsd})` })
    .from(schema.llmUsage)
    .where(where)
    .groupBy(schema.llmUsage.model);
  return {
    calls: tot?.calls ?? 0,
    inputTokens: tot?.inputTokens ?? 0,
    outputTokens: tot?.outputTokens ?? 0,
    estimatedCostUsd: Number(tot?.cost ?? 0),
    byTask: byTask.map((r) => ({ task: r.task, calls: r.calls, tokens: r.tokens, estimatedCostUsd: Number(r.cost) })),
    byModel: byModel.map((r) => ({ model: r.model, calls: r.calls, estimatedCostUsd: Number(r.cost) })),
    since,
  };
}

export type ProviderBalance = { provider: "deepseek"; currency: string; total: number; toppedUp: number; granted: number; available: boolean } | null;

/** Live DeepSeek balance (GET /user/balance). Null when not configured or unreachable. */
export async function fetchProviderBalance(timeoutMs = 4000): Promise<ProviderBalance> {
  const e = env();
  if (e.LLM_PROVIDER !== "deepseek" || !e.DEEPSEEK_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${e.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/user/balance`, { headers: { authorization: `Bearer ${e.DEEPSEEK_API_KEY}` }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { is_available?: boolean; balance_infos?: Array<{ currency: string; total_balance: string; granted_balance: string; topped_up_balance: string }> };
    const b = json.balance_infos?.find((x) => x.currency === "USD") ?? json.balance_infos?.[0];
    if (!b) return null;
    return { provider: "deepseek", currency: b.currency, total: Number(b.total_balance), toppedUp: Number(b.topped_up_balance), granted: Number(b.granted_balance), available: Boolean(json.is_available) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
