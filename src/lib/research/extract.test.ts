import { describe, expect, it } from "vitest";
import { extractPage, pickInformativeLinks } from "./extract";

const html = `<!doctype html><html><head><title>Acme Robotics | Warehouse automation</title>
<meta name="description" content="Acme builds picking robots for mid-size 3PLs.">
<script>window.secret = 1</script><style>.x{}</style></head>
<body><nav><a href="/about">About</a><a href="/pricing">Pricing</a><a href="https://other.com/x">Ext</a><a href="/blog/post-1">Post</a><a href="/about#team">Team</a></nav>
<main><h1>Robots that pick</h1><p>We help   3PL operators cut labor cost.</p><h2>Customers</h2></main>
<script>console.log("no")</script></body></html>`;

describe("extractPage", () => {
  const page = extractPage(html, "https://acme.com/");
  it("reads title and description", () => {
    expect(page.title).toBe("Acme Robotics | Warehouse automation");
    expect(page.description).toBe("Acme builds picking robots for mid-size 3PLs.");
  });
  it("drops scripts/styles and collapses whitespace", () => {
    expect(page.text).toBe("Robots that pick We help 3PL operators cut labor cost. Customers");
    expect(page.text).not.toContain("secret");
  });
  it("collects headings", () => {
    expect(page.headings).toEqual(["Robots that pick", "Customers"]);
  });
  it("keeps only same-origin links, absolute, without hash", () => {
    expect(page.links).toEqual(["https://acme.com/about", "https://acme.com/pricing", "https://acme.com/blog/post-1"]);
  });
});

describe("pickInformativeLinks", () => {
  it("prefers about/product/pricing pages and skips blog, legal, auth", () => {
    const links = [
      "https://acme.com/blog/post-1", "https://acme.com/login", "https://acme.com/privacy",
      "https://acme.com/pricing", "https://acme.com/about", "https://acme.com/product/robots",
      "https://acme.com/customers", "https://acme.com/", "https://acme.com/brochure.pdf",
    ];
    const picked = pickInformativeLinks(links, "https://acme.com/", 3);
    expect(picked).toHaveLength(3);
    expect(picked).toContain("https://acme.com/about");
    expect(picked).toContain("https://acme.com/pricing");
    expect(picked.some((u) => /blog|login|privacy|pdf/.test(u))).toBe(false);
  });
});
