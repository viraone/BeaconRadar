import * as cheerio from "cheerio";

export type ExtractedPage = {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  /** Same-origin, de-duplicated, absolute links. */
  links: string[];
};

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, div, section, article, br, tr, td, th, dd, dt, blockquote, header, footer, nav, aside, figcaption, pre";
const STRIP = "script, style, noscript, svg, iframe, canvas, template, [hidden], [aria-hidden='true']";

/** HTML to clean text and metadata. No network, no JS execution. */
export function extractPage(html: string, pageUrl: string, maxChars = 20_000): ExtractedPage {
  const $ = cheerio.load(html);
  $(STRIP).remove();

  const title = clean($("title").first().text()) || clean($("meta[property='og:title']").attr("content") ?? "");
  const description = clean($("meta[name='description']").attr("content") ?? $("meta[property='og:description']").attr("content") ?? "");
  const headings = dedupe($("h1, h2, h3").map((_, el) => clean($(el).text())).get().filter(Boolean)).slice(0, 40);

  // cheerio's .text() glues block elements together ("pickWe help"); pad them first.
  $(BLOCKS).each((_, el) => { $(el).prepend(" ").append(" "); });
  const root = $("main").length ? $("main") : $("body");
  const text = clean(root.text()).slice(0, maxChars);

  const base = new URL(pageUrl);
  const links = dedupe(
    $("a[href]")
      .map((_, el) => $(el).attr("href") ?? "")
      .get()
      .map((href) => {
        try {
          const u = new URL(href, base);
          if (u.origin !== base.origin) return "";
          u.hash = "";
          u.search = "";
          return u.toString();
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );

  return { url: pageUrl, title, description, headings, text, links };
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

/** Rank same-site links by how likely they explain the business. */
export function pickInformativeLinks(links: string[], homeUrl: string, max = 5): string[] {
  const home = new URL(homeUrl);
  const score = (u: string) => {
    const path = new URL(u).pathname.toLowerCase();
    if (path === "/" || path === "") return -1;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|webp)$/.test(path)) return -1;
    if (/(login|signin|signup|register|privacy|terms|legal|cookie|careers?|jobs|blog\/|news\/|tag\/|category\/|wp-|cart|checkout|account)/.test(path)) return -1;
    let s = 0;
    if (/about|company|who-we-are|our-story|team/.test(path)) s += 6;
    if (/product|platform|solution|service|features|how-it-works|offering/.test(path)) s += 6;
    if (/pricing|plans/.test(path)) s += 5;
    if (/customers|case-stud|testimonial|success|clients|industries|use-cases|for-/.test(path)) s += 5;
    if (/^\/[^/]+\/?$/.test(path)) s += 1; // shallow pages are usually marketing pages
    s -= Math.min(path.split("/").length - 2, 3) * 0.5;
    return s;
  };
  return links
    .filter((u) => u !== home.toString() && u !== home.origin + "/")
    .map((u) => ({ u, s: score(u) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.u);
}
