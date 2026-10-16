export type AtsSource = "greenhouse" | "lever" | "ashby";

export type JobPosting = {
  source: AtsSource;
  board: string;
  title: string;
  url: string;
  location: string | null;
  postedAt: string | null;
};

export type BoardResult = {
  source: AtsSource;
  board: string;
  companyName: string | null;
  /** The official API URL the postings came from (cited as a source). */
  apiUrl: string;
  jobs: JobPosting[];
};

export type BoardRef = { source: AtsSource; board: string };

export interface AtsClient {
  fetchBoard(ref: BoardRef): Promise<BoardResult>;
}

export const ATS_SEARCH_DOMAINS = ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"];

/**
 * Recognise a job-board URL and return which official API can confirm it.
 * Returns null for anything else (we never guess).
 */
export function parseAtsUrl(raw: string): BoardRef | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  const slug = (s: string | undefined) => (s && /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(s) ? s.toLowerCase() : null);

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io" || host === "boards.eu.greenhouse.io" || host === "job-boards.eu.greenhouse.io") {
    // /{token}, /{token}/jobs/{id}, /embed/job_board?for={token}
    if (parts[0] === "embed") {
      const token = slug(u.searchParams.get("for") ?? undefined);
      return token ? { source: "greenhouse", board: token } : null;
    }
    const token = slug(parts[0]);
    return token ? { source: "greenhouse", board: token } : null;
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    const token = slug(parts[0]);
    return token ? { source: "lever", board: token } : null;
  }
  if (host === "jobs.ashbyhq.com") {
    const token = slug(parts[0]);
    return token ? { source: "ashby", board: token } : null;
  }
  return null;
}

export function boardKey(ref: BoardRef): string {
  return `${ref.source}:${ref.board}`;
}
