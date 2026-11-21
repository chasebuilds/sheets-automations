import type { Grid } from "../core/table";

/**
 * Minimal shapes of the Apps Script services we use. Real SpreadsheetApp / GmailApp objects
 * satisfy these, and tests pass in-memory fakes instead.
 */
export interface RangeLike {
  getValues(): unknown[][];
  setValues(values: unknown[][]): unknown;
}

export interface SheetLike {
  getName(): string;
  getLastRow(): number;
  getLastColumn(): number;
  getRange(row: number, col: number, numRows: number, numCols: number): RangeLike;
}

export interface SpreadsheetLike {
  getSheetByName(name: string): SheetLike | null;
  insertSheet(name: string): SheetLike;
}

export interface MailOptions {
  htmlBody?: string;
  name?: string;
  attachments?: unknown[];
}

export interface MailLike {
  sendEmail(to: string, subject: string, body: string, options?: MailOptions): unknown;
}

export interface PropsLike {
  get(key: string): string | null;
  set(key: string, value: string): unknown;
}

export interface DocsLike {
  /** Copies a Docs template, replaces {{placeholders}}, returns the new doc id. */
  createFromTemplate(templateId: string, name: string, replacements: Record<string, string>): string;
  /** Saves the doc as a PDF next to it and returns its id and link. */
  exportPdf(docId: string, fileName: string): { id: string; url: string };
}

export interface Env {
  sheets: SpreadsheetLike;
  mail: MailLike;
  props: PropsLike;
  docs: DocsLike;
  now(): Date;
  log(message: string): void;
}

export function readGrid(sheet: SheetLike): Grid {
  const rows = sheet.getLastRow();
  const cols = sheet.getLastColumn();
  if (rows < 1 || cols < 1) return [];
  return sheet.getRange(1, 1, rows, cols).getValues();
}

export function appendRows(sheet: SheetLike, rows: unknown[][]): void {
  const first = rows[0];
  if (!first) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, first.length).setValues(rows);
}

export function setCell(sheet: SheetLike, row: number, col: number, value: unknown): void {
  sheet.getRange(row, col, 1, 1).setValues([[value]]);
}

/** Returns the sheet or throws an error the owner can act on. */
export function requireSheet(ss: SpreadsheetLike, name: string): SheetLike {
  const s = ss.getSheetByName(name);
  if (!s) throw new Error(`Sheet "${name}" not found. Check the tab name.`);
  return s;
}

export function getOrCreateSheet(ss: SpreadsheetLike, name: string, headers: string[]): SheetLike {
  const existing = ss.getSheetByName(name);
  if (existing) return existing;
  const s = ss.insertSheet(name);
  s.getRange(1, 1, 1, headers.length).setValues([headers]);
  return s;
}
