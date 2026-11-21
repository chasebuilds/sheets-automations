import { dayKey, daysBetween, escapeHtml, formatCents, num, str, toCents, toDate } from "./values";
import type { Rec } from "./table";

export type Period = "daily" | "weekly";

export interface SummaryOptions {
  period: Period;
  /** "Now" supplied by the caller so tests are deterministic. */
  today: Date;
  tzOffsetMinutes?: number;
}

export interface Summary {
  period: Period;
  from: string;
  to: string;
  count: number;
  totalCents: number;
  averageCents: number;
  byStatus: Record<string, { count: number; cents: number }>;
  topItems: { item: string; count: number; cents: number }[];
  skipped: number;
}

/** Window is the previous full day (daily) or the previous 7 full days (weekly), ending yesterday. */
export function summarize(rows: Rec[], opts: SummaryOptions): Summary {
  const tz = opts.tzOffsetMinutes ?? 0;
  const span = opts.period === "daily" ? 1 : 7;
  const msDay = 86_400_000;
  const to = dayKey(new Date(opts.today.getTime() - msDay), tz);
  const from = dayKey(new Date(opts.today.getTime() - span * msDay), tz);

  const s: Summary = {
    period: opts.period,
    from,
    to,
    count: 0,
    totalCents: 0,
    averageCents: 0,
    byStatus: {},
    topItems: [],
    skipped: 0,
  };
  const items = new Map<string, { count: number; cents: number }>();

  for (const r of rows) {
    const d = toDate(r.v["date"]);
    const amount = num(r.v["amount"]);
    if (!d || Number.isNaN(amount)) {
      s.skipped++;
      continue;
    }
    const age = daysBetween(d, opts.today, tz);
    if (age < 1 || age > span) continue;

    const cents = toCents(amount);
    s.count++;
    s.totalCents += cents;
    const status = str(r.v["status"]) || "Unknown";
    const st = (s.byStatus[status] ??= { count: 0, cents: 0 });
    st.count++;
    st.cents += cents;
    const item = str(r.v["item"]) || "Other";
    const it = items.get(item) ?? { count: 0, cents: 0 };
    it.count++;
    it.cents += cents;
    items.set(item, it);
  }
  s.averageCents = s.count === 0 ? 0 : Math.round(s.totalCents / s.count);
  s.topItems = [...items.entries()]
    .map(([item, v]) => ({ item, ...v }))
    .sort((a, b) => b.cents - a.cents || a.item.localeCompare(b.item))
    .slice(0, 3);
  return s;
}

export function summarySubject(s: Summary, businessName: string): string {
  const label = s.period === "daily" ? `daily summary for ${s.to}` : `weekly summary ${s.from} to ${s.to}`;
  return `${businessName}: ${label}`;
}

export function renderSummaryText(s: Summary): string {
  const lines = [
    `Period: ${s.from} to ${s.to}`,
    `Orders: ${s.count}`,
    `Revenue: ${formatCents(s.totalCents)}`,
    `Average order: ${formatCents(s.averageCents)}`,
  ];
  if (s.count === 0) lines.push("", "No orders in this period.");
  for (const [status, v] of Object.entries(s.byStatus)) {
    lines.push(`  ${status}: ${v.count} (${formatCents(v.cents)})`);
  }
  if (s.topItems.length > 0) {
    lines.push("", "Top items:");
    for (const t of s.topItems) lines.push(`  ${t.item}: ${t.count} sold, ${formatCents(t.cents)}`);
  }
  if (s.skipped > 0) lines.push("", `${s.skipped} row(s) skipped: missing date or amount.`);
  return lines.join("\n");
}

export function renderSummaryHtml(s: Summary): string {
  const rows = s.topItems
    .map(
      (t) =>
        `<tr><td>${escapeHtml(t.item)}</td><td align="right">${t.count}</td><td align="right">${formatCents(t.cents)}</td></tr>`,
    )
    .join("");
  return [
    `<p><b>${s.from} to ${s.to}</b></p>`,
    `<p>Orders: <b>${s.count}</b><br>Revenue: <b>${formatCents(s.totalCents)}</b><br>Average order: ${formatCents(s.averageCents)}</p>`,
    rows ? `<table cellpadding="4"><tr><th align="left">Item</th><th>Sold</th><th>Revenue</th></tr>${rows}</table>` : "",
    s.skipped > 0 ? `<p><i>${s.skipped} row(s) skipped: missing date or amount.</i></p>` : "",
  ].join("");
}
