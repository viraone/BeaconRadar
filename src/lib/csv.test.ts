import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("passes plain values through", () => {
    expect(escapeCsvCell("Acme")).toBe("Acme");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(escapeCsvCell("Acme, Inc")).toBe('"Acme, Inc"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });
  it("neutralizes spreadsheet formulas", () => {
    expect(escapeCsvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(escapeCsvCell("+1 555")).toBe("'+1 555");
    expect(escapeCsvCell("-5")).toBe("'-5");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
  });
});

describe("toCsv", () => {
  it("writes a BOM, CRLF rows and a trailing newline", () => {
    expect(toCsv([["a", "b"], ["1", "x,y"]])).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});
