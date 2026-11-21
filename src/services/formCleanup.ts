import { cleanResponses, dedupeKey } from "../core/cleaner";
import { toTable } from "../core/table";
import { str } from "../core/values";
import { appendRows, getOrCreateSheet, readGrid, requireSheet, type Env } from "./ports";

export const FORM_SHEET = "Form Responses 1";
export const MASTER_SHEET = "Master";
export const REJECTED_SHEET = "Rejected";
export const MASTER_HEADERS = ["Received", "Name", "Email", "Phone", "Message", "Source Row"];
export const REJECTED_HEADERS = ["Source Row", "Reason", "Checked At"];
const LAST_ROW_KEY = "formCleanup.lastRow";

export interface FormCleanupReport {
  added: number;
  duplicates: number;
  rejected: number;
}

/** Moves new form rows into a cleaned master sheet. Safe to run repeatedly. */
export function cleanFormResponses(env: Env): FormCleanupReport {
  const form = requireSheet(env.sheets, FORM_SHEET);
  const master = getOrCreateSheet(env.sheets, MASTER_SHEET, MASTER_HEADERS);
  const rejected = getOrCreateSheet(env.sheets, REJECTED_SHEET, REJECTED_HEADERS);

  const lastDone = Number(env.props.get(LAST_ROW_KEY) ?? "1");
  const formTable = toTable(readGrid(form), ["Timestamp", "Name", "Email", "Phone", "Message"], FORM_SHEET);
  const fresh = formTable.records.filter((r) => r.row > lastDone);

  const masterTable = toTable(readGrid(master), ["Email", "Phone"], MASTER_SHEET);
  const existing = masterTable.records.map((r) =>
    dedupeKey(str(r.v["email"]).toLowerCase(), str(r.v["phone"])),
  );

  const result = cleanResponses(fresh, existing);

  appendRows(
    master,
    result.added.map((a) => [a.received ?? "", a.name, a.email, a.phone, a.message, a.sourceRow]),
  );
  const now = env.now();
  appendRows(
    rejected,
    result.rejected.map((x) => [x.row, x.reason, now]),
  );

  const maxRow = formTable.records.reduce((m, r) => Math.max(m, r.row), lastDone);
  env.props.set(LAST_ROW_KEY, String(maxRow));

  env.log(
    `Form cleanup: ${result.added.length} added, ${result.duplicates.length} duplicates, ${result.rejected.length} rejected`,
  );
  return { added: result.added.length, duplicates: result.duplicates.length, rejected: result.rejected.length };
}
