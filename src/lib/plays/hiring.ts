import { z } from "zod";
import { ATS_SEARCH_DOMAINS, boardKey, parseAtsUrl, type BoardRef, type BoardResult, type JobPosting } from "@/lib/research/ats";
import type { HiringParams, LeadDraft, PlayDefinition, PlayRunContext } from "./types";

const paramsSchema = z.object({
  roles: z.array(z.string().trim().min(2).max(80)).min(1).max(5),
  location: z.string().trim().max(80).optional(),
});

const STOPWORDS = new Set(["of", "and", "the", "a", "an", "&", "-", "/", "senior", "sr", "jr", "junior", "lead", "head", "director", "manager", "vp"]);

/** Words that must appear in a posting title for it to count as the role. */
export function roleTokens(role: string): string[] {
  const t = role.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
  return t.length ? t : role.toLowerCase().split(/\s+/).filter(Boolean);
}

export function titleMatchesRole(title: string, role: string): boolean {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ")} `;
  return roleTokens(role).every((tok) => t.includes(` ${tok} `) || t.includes(` ${tok}s `));
}

export function buildQueries(params: HiringParams): string[] {
  const loc = params.location ? ` ${params.location}` : "";
  return params.roles.map((r) => `"${r}"${loc} job`);
}

/** Company name from an ATS board when the API didn't give one: "mock-bistro" -> "Mock Bistro". */
export function companyFromBoard(ref: BoardRef): string {
  return ref.board.split(/[-_.]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export const hiringPlay: PlayDefinition<HiringParams> = {
  type: "hiring_signal",
  label: "Companies hiring for a role",
  description: "Finds companies with open roles that signal they need you, confirmed through the Greenhouse, Lever and Ashby job-board APIs. Every lead cites the posting.",
  runnable: true,

  parseParams(raw) {
    const p = paramsSchema.parse(raw);
    const roles = Array.from(new Set(p.roles.map((r) => r.trim()))).filter(Boolean);
    return { roles, ...(p.location ? { location: p.location } : {}) };
  },

  async run(ctx: PlayRunContext, params: HiringParams) {
    const notes: string[] = [];
    const boards = new Map<string, { ref: BoardRef; foundVia: string }>();

    // 1. Discover candidate job boards via search, restricted to ATS hosts.
    for (const q of buildQueries(params)) {
      let results;
      try {
        results = await ctx.search.search(q, { maxResults: 10, domains: ATS_SEARCH_DOMAINS });
      } catch (e) {
        notes.push(`search failed for ${q}: ${(e as Error).message}`);
        continue;
      }
      ctx.log(`search "${q}" -> ${results.length} results`);
      for (const r of results) {
        const ref = parseAtsUrl(r.url);
        if (ref && !boards.has(boardKey(ref))) boards.set(boardKey(ref), { ref, foundVia: r.url });
      }
      if (boards.size >= 40) break;
    }
    notes.push(`${boards.size} job boards discovered`);

    // 2. Confirm through the official API and keep postings that match a role.
    const leads: LeadDraft[] = [];
    for (const { ref, foundVia } of boards.values()) {
      if (leads.length >= ctx.maxLeads) break;
      let board: BoardResult;
      try {
        board = await ctx.ats.fetchBoard(ref);
      } catch (e) {
        notes.push(`${boardKey(ref)}: ${(e as Error).message}`);
        continue;
      }
      const matches: Array<{ job: JobPosting; role: string }> = [];
      for (const job of board.jobs) {
        const role = params.roles.find((r) => titleMatchesRole(job.title, r));
        if (role) matches.push({ job, role });
      }
      if (matches.length === 0) continue;
      matches.sort((a, b) => (b.job.postedAt ?? "").localeCompare(a.job.postedAt ?? ""));
      const top = matches[0];
      const company = board.companyName ?? companyFromBoard(ref);
      const others = matches.slice(1, 3).map((m) => m.job.title);
      leads.push({
        company,
        companyDomain: null,
        person: null,
        title: null,
        sourceUrls: Array.from(new Set([top.job.url, board.apiUrl.startsWith("http") ? board.apiUrl : foundVia])),
        fitReason:
          `Hiring "${top.job.title}"${top.job.location ? ` (${top.job.location})` : ""}` +
          `${top.job.postedAt ? `, posted ${top.job.postedAt.slice(0, 10)}` : ""}. Matches role "${top.role}".` +
          (others.length ? ` Also open: ${others.join("; ")}.` : "") +
          ` Confirmed via the ${ref.source} job-board API.`,
        signal: {
          kind: "job_posting",
          ats: ref.source,
          board: ref.board,
          title: top.job.title,
          location: top.job.location,
          postedAt: top.job.postedAt,
          url: top.job.url,
          matchedRole: top.role,
          matchingOpenRoles: matches.length,
        },
      });
    }
    return { leads, notes };
  },
};
