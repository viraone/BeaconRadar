import type { BoardRef, BoardResult, JobPosting } from "./types";

/** Ashby Job Posting API (public, no key). https://developers.ashbyhq.com/docs/public-job-posting-api */
export async function fetchAshbyBoard(ref: BoardRef, fetchJson: (url: string) => Promise<unknown>): Promise<BoardResult> {
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.board)}`;
  const data = (await fetchJson(apiUrl)) as { jobs?: Array<{ title?: string; jobUrl?: string; location?: string; publishedAt?: string; isListed?: boolean }> };
  const raw = Array.isArray(data?.jobs) ? data.jobs : [];
  const jobs: JobPosting[] = raw
    .filter((j) => j.isListed !== false && typeof j.title === "string" && typeof j.jobUrl === "string")
    .map((j) => ({
      source: "ashby",
      board: ref.board,
      title: j.title!.trim(),
      url: j.jobUrl!,
      location: j.location?.trim() || null,
      postedAt: j.publishedAt ?? null,
    }));
  return { source: "ashby", board: ref.board, companyName: null, apiUrl, jobs };
}
