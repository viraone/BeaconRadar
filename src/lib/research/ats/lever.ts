import type { BoardRef, BoardResult, JobPosting } from "./types";

/** Lever Postings API (public, no key). https://github.com/lever/postings-api */
export async function fetchLeverBoard(ref: BoardRef, fetchJson: (url: string) => Promise<unknown>): Promise<BoardResult> {
  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(ref.board)}?mode=json`;
  const data = (await fetchJson(apiUrl)) as Array<{ text?: string; hostedUrl?: string; categories?: { location?: string; team?: string }; createdAt?: number }>;
  const raw = Array.isArray(data) ? data : [];
  const jobs: JobPosting[] = raw
    .filter((j) => typeof j.text === "string" && typeof j.hostedUrl === "string")
    .map((j) => ({
      source: "lever",
      board: ref.board,
      title: j.text!.trim(),
      url: j.hostedUrl!,
      location: j.categories?.location?.trim() || null,
      postedAt: typeof j.createdAt === "number" ? new Date(j.createdAt).toISOString() : null,
    }));
  // Lever's postings API does not return the company name; the board slug is the best we have.
  return { source: "lever", board: ref.board, companyName: null, apiUrl, jobs };
}
