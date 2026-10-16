import { CREDIT_COSTS, PLANS, type Plan } from "@/config/credits";
import type { PlayType } from "@/lib/plays/types";

/** Credits each lead row costs for a given play type (all current plays: one search_result). */
export function costPerLead(type: PlayType): number {
  switch (type) {
    case "hiring_signal":
    case "decision_makers":
    case "local_business":
      return CREDIT_COSTS.search_result;
  }
}

/** Rows a play may write under the plan. */
export function effectiveRowLimit(requested: number, plan: Plan): number {
  return Math.max(0, Math.min(requested, PLANS[plan].rowsPerTable));
}

/** "Up to N credits" shown before approval. */
export function estimatePlayCredits(type: PlayType, requestedRows: number, plan: Plan): number {
  return effectiveRowLimit(requestedRows, plan) * costPerLead(type);
}
