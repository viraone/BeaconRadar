/**
 * Single source of truth for credit costs and plan limits.
 * Charges happen only for results actually found (see lib/credits in Phase 4).
 */
export const CREDIT_COSTS = {
  /** one lead row written to a leads table */
  search_result: 1,
  /** an email address found by an enrichment provider */
  enrich_found: 2,
  /** an email verified as deliverable */
  verify: 1,
  /** one outreach draft generated */
  draft: 1,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export const PLANS = {
  free: { rowsPerTable: 30, canExport: false, signupGrant: 100 },
  pro: { rowsPerTable: 500, canExport: true, signupGrant: 0 },
} as const;

export type Plan = keyof typeof PLANS;
