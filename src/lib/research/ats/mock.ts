import type { AtsClient, BoardRef, BoardResult } from "./types";
import { boardKey } from "./types";

/**
 * Fixture job boards for offline development. Company names are obviously fake
 * and every URL is on the real ATS hosts so URL parsing is exercised, but nothing
 * is fetched. Shown in the UI as MOCK data.
 */
export const MOCK_BOARDS: Array<{ source: BoardRef["source"]; board: string; host: string; companyName: string; jobs: Array<{ title: string; url: string; location: string; postedAt: string }> }> = [
  {
    source: "greenhouse", board: "mockbistro", host: "job-boards.greenhouse.io", companyName: "Mock Bistro Group (MOCK)",
    jobs: [
      { title: "Marketing Manager", url: "https://job-boards.greenhouse.io/mockbistro/jobs/1001", location: "Seattle, WA", postedAt: "2026-10-01T00:00:00Z" },
      { title: "Line Cook", url: "https://job-boards.greenhouse.io/mockbistro/jobs/1002", location: "Seattle, WA", postedAt: "2026-10-02T00:00:00Z" },
    ],
  },
  {
    source: "lever", board: "mockfit", host: "jobs.lever.co", companyName: "MockFit Studios (MOCK)",
    jobs: [
      { title: "Community Manager", url: "https://jobs.lever.co/mockfit/2001", location: "Portland, OR", postedAt: "2026-09-28T00:00:00Z" },
      { title: "Front Desk Associate", url: "https://jobs.lever.co/mockfit/2002", location: "Portland, OR", postedAt: "2026-09-30T00:00:00Z" },
    ],
  },
  {
    source: "ashby", board: "mockvenue", host: "jobs.ashbyhq.com", companyName: "Mock Venue Co (MOCK)",
    jobs: [
      { title: "Events Marketing Manager", url: "https://jobs.ashbyhq.com/mockvenue/3001", location: "Remote - US", postedAt: "2026-10-05T00:00:00Z" },
      { title: "Head of Operations", url: "https://jobs.ashbyhq.com/mockvenue/3002", location: "Austin, TX", postedAt: "2026-10-06T00:00:00Z" },
    ],
  },
  {
    source: "greenhouse", board: "mockretail", host: "boards.greenhouse.io", companyName: "Mock Retail Collective (MOCK)",
    jobs: [
      { title: "Growth Marketing Manager", url: "https://boards.greenhouse.io/mockretail/jobs/4001", location: "Vancouver, BC", postedAt: "2026-10-07T00:00:00Z" },
      { title: "Software Engineer", url: "https://boards.greenhouse.io/mockretail/jobs/4002", location: "Vancouver, BC", postedAt: "2026-10-07T00:00:00Z" },
    ],
  },
];

export class MockAtsClient implements AtsClient {
  async fetchBoard(ref: BoardRef): Promise<BoardResult> {
    const b = MOCK_BOARDS.find((x) => boardKey(x) === boardKey(ref));
    if (!b) return { source: ref.source, board: ref.board, companyName: null, apiUrl: `mock://${boardKey(ref)}`, jobs: [] };
    return {
      source: b.source,
      board: b.board,
      companyName: b.companyName,
      apiUrl: `mock://${boardKey(ref)}`,
      jobs: b.jobs.map((j) => ({ source: b.source, board: b.board, title: j.title, url: j.url, location: j.location, postedAt: j.postedAt })),
    };
  }
}
