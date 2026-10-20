/*
 * Spreadsheet export (CSV) that opens cleanly in Excel, Google Sheets and
 * LibreOffice: UTF-8 with a byte-order mark (so names like "Ngwo’s" survive in
 * Excel), CRLF line endings, and quoting where needed.
 */

export type CsvCell = string | number | null | undefined;

import { watDate } from "@/lib/utils";
/**
 * Quotes a cell when needed, and defuses spreadsheet formulas: a cell that
 * starts with =, @ or a tab — or with + or - followed by something other than a
 * number (phone numbers like +237… stay as they are) — gets a leading apostrophe
 * so that it shows as text instead of running as a formula.
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s().]*$)/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A safe file name: letters, numbers and dashes, with today's date. */
export function csvFilename(name: string, date = new Date()) {
  const base = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "export";
  return `ncuda-${base}-${watDate(date)}.csv`;
}
