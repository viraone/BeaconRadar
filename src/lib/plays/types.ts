import type { schema } from "@/lib/db/client";
import type { AtsClient } from "@/lib/research/ats";
import type { SearchProvider } from "@/lib/research/search";
import type { LlmProvider } from "@/lib/llm/llm";

export type PlayType = "hiring_signal" | "decision_makers" | "local_business";

export type HiringParams = {
  /** Role titles that signal need, e.g. ["Marketing Manager", "Community Manager"]. 1-5. */
  roles: string[];
  /** Optional location hint added to search queries, e.g. "Seattle". */
  location?: string;
};

export type PlayParams = HiringParams | Record<string, unknown>;

/** A lead as a play produces it; the runner adds ids, charges credits and writes it. */
export type LeadDraft = {
  company: string;
  companyDomain: string | null;
  person: string | null;
  title: string | null;
  sourceUrls: string[];
  fitReason: string;
  signal: Record<string, unknown>;
};

export type PlayRunContext = {
  play: typeof schema.plays.$inferSelect;
  icp: typeof schema.companyProfiles.$inferSelect;
  /** Stop producing once this many leads have been accepted. */
  maxLeads: number;
  search: SearchProvider;
  ats: AtsClient;
  llm: LlmProvider;
  log: (msg: string) => void;
};

export interface PlayDefinition<P = PlayParams> {
  type: PlayType;
  label: string;
  description: string;
  runnable: boolean;
  /** Validate/normalize params from the recommender or the user. Throw on bad input. */
  parseParams(raw: unknown): P;
  /** Produce lead drafts. Must stop at ctx.maxLeads. Every draft needs >= 1 source URL. */
  run(ctx: PlayRunContext, params: P): Promise<{ leads: LeadDraft[]; notes: string[] }>;
}
