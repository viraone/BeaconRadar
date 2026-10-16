import type { BoardRef, BoardResult, JobPosting } from "./types";

/** Greenhouse Job Board API (public, no key). https://developers.greenhouse.io/job-board.html */
export async function fetchGreenhouseBoard(ref: BoardRef, fetchJson: (url: string) => Promise<unknown>): Promise<BoardResult> {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs`;
  const data = (await fetchJson(apiUrl)) as { jobs?: Array<{ title?: string; absolute_url?: string; location?: { name?: string }; first_published?: string; updated_at?: string; company_name?: string }> };
  const raw = Array.isArray(data?.jobs) ? data.jobs : [];
  const jobs: JobPosting[] = raw
    .filter((j) => typeof j.title === "string" && typeof j.absolute_url === "string")
    .map((j) => ({
      source: "greenhouse",
      board: ref.board,
      title: j.title!.trim(),
      url: j.absolute_url!,
      location: j.location?.name?.trim() || null,
      postedAt: j.first_published ?? j.updated_at ?? null,
    }));
  const companyName = raw.find((j) => j.company_name)?.company_name?.trim() ?? null;
  return { source: "greenhouse", board: ref.board, companyName, apiUrl, jobs };
}
