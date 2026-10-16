import { eq, sql } from "drizzle-orm";
import { db, schema, type Db } from "@/lib/db/client";
import type { CreditAction } from "@/config/credits";

export type ChargeInput = {
  workspaceId: string;
  /** Positive number of credits to spend. */
  amount: number;
  action: CreditAction;
  reason: string;
  refType?: string;
  refId?: string;
  /** Deterministic per logical charge, e.g. `lead:<id>:search_result`. */
  idempotencyKey: string;
};

export type ChargeResult = { ok: true; charged: boolean; balance: number } | { ok: false; reason: "insufficient"; balance: number };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Spend credits exactly once per idempotency key, never below zero.
 * Locks the workspace row so concurrent charges serialize.
 *  - charged=true: a new ledger row was written
 *  - charged=false: this key was already charged (retry); balance unchanged
 */
export async function chargeOnce(input: ChargeInput, tx?: Tx): Promise<ChargeResult> {
  const run = async (t: Tx): Promise<ChargeResult> => {
    if (input.amount <= 0) throw new Error("amount must be positive");
    await t.execute(sql`select 1 from workspaces where id = ${input.workspaceId} for update`);

    const [existing] = await t
      .select({ id: schema.creditLedger.id })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);
    const balance = await balanceIn(t, input.workspaceId);
    if (existing) return { ok: true, charged: false, balance };
    if (balance < input.amount) return { ok: false, reason: "insufficient", balance };

    await t.insert(schema.creditLedger).values({
      workspaceId: input.workspaceId,
      delta: -input.amount,
      action: input.action,
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true, charged: true, balance: balance - input.amount };
  };
  return tx ? run(tx) : db.transaction(run);
}

export async function grantCredits(input: { workspaceId: string; amount: number; reason: string; idempotencyKey: string; action?: CreditAction }): Promise<void> {
  await db
    .insert(schema.creditLedger)
    .values({ workspaceId: input.workspaceId, delta: input.amount, action: input.action ?? "grant", reason: input.reason, idempotencyKey: input.idempotencyKey })
    .onConflictDoNothing();
}

export async function getBalance(workspaceId: string): Promise<number> {
  return balanceIn(db, workspaceId);
}

async function balanceIn(t: Pick<Db, "select">, workspaceId: string): Promise<number> {
  const [row] = await t
    .select({ balance: sql<number>`coalesce(sum(${schema.creditLedger.delta}), 0)::int` })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.workspaceId, workspaceId));
  return row?.balance ?? 0;
}
