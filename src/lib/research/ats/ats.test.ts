import { describe, expect, it } from "vitest";
import { fetchAshbyBoard } from "./ashby";
import { fetchGreenhouseBoard } from "./greenhouse";
import { fetchLeverBoard } from "./lever";
import { parseAtsUrl } from "./types";

describe("parseAtsUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/123", { source: "greenhouse", board: "acme" }],
    ["https://job-boards.greenhouse.io/Acme", { source: "greenhouse", board: "acme" }],
    ["https://boards.greenhouse.io/embed/job_board?for=acme", { source: "greenhouse", board: "acme" }],
    ["https://jobs.lever.co/acme/8f2-abc?lever-origin=applied", { source: "lever", board: "acme" }],
    ["https://jobs.ashbyhq.com/acme/0d2b-1", { source: "ashby", board: "acme" }],
  ])("%s", (url, expected) => {
    expect(parseAtsUrl(url)).toEqual(expected);
  });
  it.each(["https://acme.com/careers", "https://www.linkedin.com/jobs/view/1", "not a url", "https://boards.greenhouse.io/"])("rejects %s", (url) => {
    expect(parseAtsUrl(url)).toBeNull();
  });
});

describe("board clients normalize official API responses", () => {
  it("greenhouse", async () => {
    const r = await fetchGreenhouseBoard({ source: "greenhouse", board: "acme" }, async () => ({
      jobs: [
        { id: 1, title: " Marketing Manager ", absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1", location: { name: "Seattle, WA" }, first_published: "2026-01-02T00:00:00Z", company_name: "Acme" },
        { id: 2, title: "No URL" },
      ],
    }));
    expect(r.companyName).toBe("Acme");
    expect(r.apiUrl).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs");
    expect(r.jobs).toEqual([{ source: "greenhouse", board: "acme", title: "Marketing Manager", url: "https://job-boards.greenhouse.io/acme/jobs/1", location: "Seattle, WA", postedAt: "2026-01-02T00:00:00Z" }]);
  });
  it("lever (array response, no company name)", async () => {
    const r = await fetchLeverBoard({ source: "lever", board: "acme" }, async () => [
      { id: "x", text: "Community Manager", hostedUrl: "https://jobs.lever.co/acme/x", categories: { location: "Portland" }, createdAt: 1700000000000 },
    ]);
    expect(r.companyName).toBeNull();
    expect(r.jobs[0]).toMatchObject({ source: "lever", title: "Community Manager", location: "Portland", postedAt: "2023-11-14T22:13:20.000Z" });
  });
  it("lever error object yields no jobs", async () => {
    const r = await fetchLeverBoard({ source: "lever", board: "nope" }, async () => ({ ok: false, error: "Document not found" }));
    expect(r.jobs).toEqual([]);
  });
  it("ashby drops unlisted jobs", async () => {
    const r = await fetchAshbyBoard({ source: "ashby", board: "acme" }, async () => ({
      jobs: [
        { id: "1", title: "Ops Lead", jobUrl: "https://jobs.ashbyhq.com/acme/1", location: "Austin", publishedAt: "2026-02-01T00:00:00Z", isListed: true },
        { id: "2", title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/acme/2", isListed: false },
      ],
    }));
    expect(r.jobs.map((j) => j.title)).toEqual(["Ops Lead"]);
  });
  it("null (404) responses yield no jobs", async () => {
    expect((await fetchGreenhouseBoard({ source: "greenhouse", board: "x" }, async () => null)).jobs).toEqual([]);
    expect((await fetchAshbyBoard({ source: "ashby", board: "x" }, async () => null)).jobs).toEqual([]);
  });
});
