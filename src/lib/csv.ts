/**
 * Minimal RFC 4180 CSV writer with spreadsheet formula-injection protection.
 * Cells starting with = + - @ or tab/CR are prefixed with a single quote so
 * Excel/Sheets treat them as text (CWE-1236).
 */
export function escapeCsvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  // CRLF line endings per RFC 4180; UTF-8 BOM so Excel opens non-ASCII correctly.
  return "﻿" + rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}
