import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Runs against the local Postgres (DATABASE_URL from .env.local). Skipped when
 * the database isn't reachable so `npm test` still works without Docker.
 */
const url = process.env.DATABASE_URL;
let reachable = false;
let mod: typeof import("@/lib/credits/ledger");
let dbmod: typeof import("@/lib/db/client");
let wsId: string;

beforeAll(async () => {
  if (!url) return;
  try {
    dbmod = await import("@/lib/db/client");
    await dbmod.db.execute("select 1");
    reachable = true;
    mod = await import("@/lib/credits/ledger");
    const [ws] = await dbmod.db.insert(dbmod.schema.workspaces).values({ name: "ledger-test" }).returning();
    wsId = ws.id;
  } catch {
    reachable = false;
  }
});

afterAll(async () => {
  if (reachable && wsId) await dbmod.db.delete(dbmod.schema.workspaces).where(eq(dbmod.schema.workspaces.id, wsId));
});

describe.skipIf(!url)("credit ledger (integration)", () => {
  it("grants, charges once per key, never goes negative", async () => {
    if (!reachable) return;
    await mod.grantCredits({ workspaceId: wsId, amount: 3, reason: "test grant", idempotencyKey: `grant:test:${wsId}` });
    await mod.grantCredits({ workspaceId: wsId, amount: 3, reason: "dup grant", idempotencyKey: `grant:test:${wsId}` });
    expect(await mod.getBalance(wsId)).toBe(3);

    const first = await mod.chargeOnce({ workspaceId: wsId, amount: 2, action: "search_result", reason: "lead A", idempotencyKey: `t:${wsId}:a` });
    expect(first).toEqual({ ok: true, charged: true, balance: 1 });

    const retry = await mod.chargeOnce({ workspaceId: wsId, amount: 2, action: "search_result", reason: "lead A again", idempotencyKey: `t:${wsId}:a` });
    expect(retry).toEqual({ ok: true, charged: false, balance: 1 });

    const tooMuch = await mod.chargeOnce({ workspaceId: wsId, amount: 2, action: "search_result", reason: "lead B", idempotencyKey: `t:${wsId}:b` });
    expect(tooMuch).toEqual({ ok: false, reason: "insufficient", balance: 1 });

    const last = await mod.chargeOnce({ workspaceId: wsId, amount: 1, action: "search_result", reason: "lead C", idempotencyKey: `t:${wsId}:c` });
    expect(last).toEqual({ ok: true, charged: true, balance: 0 });
    expect(await mod.getBalance(wsId)).toBe(0);
  });

  it("serializes concurrent charges so the balance never goes below zero", async () => {
    if (!reachable) return;
    await mod.grantCredits({ workspaceId: wsId, amount: 5, reason: "race grant", idempotencyKey: `grant:race:${wsId}` });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => mod.chargeOnce({ workspaceId: wsId, amount: 1, action: "search_result", reason: `race ${i}`, idempotencyKey: `t:${wsId}:race:${i}` })),
    );
    expect(results.filter((r) => r.ok && r.charged)).toHaveLength(5);
    expect(results.filter((r) => !r.ok)).toHaveLength(5);
    expect(await mod.getBalance(wsId)).toBe(0);
  });
});
