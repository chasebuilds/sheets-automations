import { daysBetween, formatCents, isTruthyFlag, isValidEmail, num, str, toCents, toDate } from "./values";
import type { Rec } from "./table";

export interface ReminderConfig {
  today: Date;
  /** Wait at least this many days between reminders for one invoice. */
  minDaysBetween: number;
  /** Stop after this many reminders for one invoice. */
  maxReminders: number;
  /** Cap per run, so one run cannot burn the daily Gmail quota. */
  maxPerRun: number;
  tzOffsetMinutes?: number;
}

export interface LogEntry {
  email: string;
  invoice: string;
  sentAt: Date;
}

export interface Reminder {
  row: number;
  client: string;
  email: string;
  invoice: string;
  amountCents: number;
  dueDate: Date;
  daysOverdue: number;
  reminderNumber: number;
}

export type SkipReason =
  | "paid"
  | "opted out"
  | "not overdue"
  | "no due date"
  | "bad amount"
  | "bad email"
  | "reminded recently"
  | "max reminders reached"
  | "run cap reached";

export interface Plan {
  send: Reminder[];
  skipped: { row: number; reason: SkipReason }[];
}

export function planReminders(rows: Rec[], log: LogEntry[], cfg: ReminderConfig): Plan {
  const plan: Plan = { send: [], skipped: [] };
  const tz = cfg.tzOffsetMinutes ?? 0;
  const logKey = (email: string, invoice: string) => `${email.toLowerCase()}|${invoice}`;
  const byKey = new Map<string, Date[]>();
  for (const l of log) {
    const k = logKey(l.email, l.invoice);
    byKey.set(k, [...(byKey.get(k) ?? []), l.sentAt]);
  }

  for (const r of rows) {
    const skip = (reason: SkipReason) => plan.skipped.push({ row: r.row, reason });
    if (isTruthyFlag(r.v["paid"])) {
      skip("paid");
      continue;
    }
    if (isTruthyFlag(r.v["opt out"])) {
      skip("opted out");
      continue;
    }
    const due = toDate(r.v["due date"]);
    if (!due) {
      skip("no due date");
      continue;
    }
    const days = daysBetween(due, cfg.today, tz);
    if (days < 1) {
      skip("not overdue");
      continue;
    }
    const amount = num(r.v["amount"]);
    if (Number.isNaN(amount)) {
      skip("bad amount");
      continue;
    }
    const email = str(r.v["email"]).toLowerCase();
    if (!isValidEmail(email)) {
      skip("bad email");
      continue;
    }
    const invoice = str(r.v["invoice #"]);
    const sent = byKey.get(logKey(email, invoice)) ?? [];
    if (sent.length >= cfg.maxReminders) {
      skip("max reminders reached");
      continue;
    }
    const last = sent.reduce<Date | null>((a, d) => (a === null || d > a ? d : a), null);
    if (last && daysBetween(last, cfg.today, tz) < cfg.minDaysBetween) {
      skip("reminded recently");
      continue;
    }
    if (plan.send.length >= cfg.maxPerRun) {
      skip("run cap reached");
      continue;
    }
    plan.send.push({
      row: r.row,
      client: str(r.v["client"]) || "there",
      email,
      invoice,
      amountCents: toCents(amount),
      dueDate: due,
      daysOverdue: days,
      reminderNumber: sent.length + 1,
    });
  }
  return plan;
}

export function reminderSubject(rem: Reminder, businessName: string): string {
  return `${businessName}: invoice ${rem.invoice} is ${rem.daysOverdue} day${rem.daysOverdue === 1 ? "" : "s"} overdue`;
}

export function reminderBody(rem: Reminder, businessName: string): string {
  return [
    `Hi ${rem.client},`,
    "",
    `Our records show invoice ${rem.invoice} for ${formatCents(rem.amountCents)} was due on ${rem.dueDate.toISOString().slice(0, 10)} and is still open.`,
    "If you already paid, thank you, and please ignore this note.",
    "",
    "Thanks,",
    businessName,
    "",
    "Reply STOP if you do not want further reminders.",
  ].join("\n");
}
