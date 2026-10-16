import { describe, expect, it } from "vitest";
import { isSuppressed } from "./suppression";

const entries = [
  { email: "Jane@Acme.com", domain: null },
  { email: null, domain: "blocked.io" },
];

describe("isSuppressed", () => {
  it("matches email case-insensitively", () => {
    expect(isSuppressed({ email: "jane@acme.com", companyDomain: null }, entries)).toBe(true);
    expect(isSuppressed({ email: "john@acme.com", companyDomain: null }, entries)).toBe(false);
  });
  it("matches company domain and subdomains", () => {
    expect(isSuppressed({ email: null, companyDomain: "blocked.io" }, entries)).toBe(true);
    expect(isSuppressed({ email: null, companyDomain: "www.blocked.io" }, entries)).toBe(true);
    expect(isSuppressed({ email: null, companyDomain: "eu.blocked.io" }, entries)).toBe(true);
    expect(isSuppressed({ email: null, companyDomain: "notblocked.io" }, entries)).toBe(false);
  });
  it("matches the email's domain against a domain entry", () => {
    expect(isSuppressed({ email: "x@blocked.io", companyDomain: null }, entries)).toBe(true);
  });
  it("is false with nothing to match", () => {
    expect(isSuppressed({ email: null, companyDomain: null }, entries)).toBe(false);
    expect(isSuppressed({ email: "a@b.com", companyDomain: "b.com" }, [])).toBe(false);
  });
});
