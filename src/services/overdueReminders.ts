import {
  planReminders,
  reminderBody,
  reminderSubject,
  type LogEntry,
  type Plan,
  type ReminderConfig,
} from "../core/reminders";
import { colIndex, toTable } from "../core/table";
import { str, toDate } from "../core/values";
import { appendRows, getOrCreateSheet, readGrid, requireSheet, setCell, type Env } from "./ports";

export const DUE_SHEET = "Invoices Due";
export const LOG_SHEET = "Send Log";
export const LOG_HEADERS = ["Sent At", "Email", "Invoice #", "Days Overdue", "Reminder #", "Result"];
const REQUIRED = ["Client", "Email", "Invoice #", "Amount", "Due Date", "Paid", "Opt Out", "Last Reminded"];

export interface ReminderRunConfig extends Omit<ReminderConfig, "today"> {
  businessName: string;
  /** Plan and log nothing, send nothing. Used to preview a run. */
  dryRun?: boolean;
}

export function sendOverdueReminders(env: Env, cfg: ReminderRunConfig): Plan {
  const sheet = requireSheet(env.sheets, DUE_SHEET);
  const log = getOrCreateSheet(env.sheets, LOG_SHEET, LOG_HEADERS);
  const table = toTable(readGrid(sheet), REQUIRED, DUE_SHEET);

  const logEntries: LogEntry[] = [];
  for (const r of toTable(readGrid(log), ["Sent At", "Email", "Invoice #", "Result"], LOG_SHEET).records) {
    const sentAt = toDate(r.v["sent at"]);
    // Only successful sends count toward the reminder limits.
    if (sentAt && str(r.v["result"]) === "sent") {
      logEntries.push({ email: str(r.v["email"]), invoice: str(r.v["invoice #"]), sentAt });
    }
  }

  const today = env.now();
  const plan = planReminders(table.records, logEntries, { ...cfg, today });
  if (cfg.dryRun) {
    env.log(`Dry run: would send ${plan.send.length}, skip ${plan.skipped.length}`);
    return plan;
  }

  const lastCol = colIndex(table.headers, "Last Reminded");
  for (const rem of plan.send) {
    let result = "sent";
    try {
      env.mail.sendEmail(rem.email, reminderSubject(rem, cfg.businessName), reminderBody(rem, cfg.businessName), {
        name: cfg.businessName,
      });
      setCell(sheet, rem.row, lastCol, today);
    } catch (e) {
      result = `error: ${e instanceof Error ? e.message : "unknown"}`;
    }
    appendRows(log, [[today, rem.email, rem.invoice, rem.daysOverdue, rem.reminderNumber, result]]);
  }
  env.log(`Reminders: ${plan.send.length} attempted, ${plan.skipped.length} skipped`);
  return plan;
}
