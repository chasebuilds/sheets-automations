import { renderSummaryHtml, renderSummaryText, summarize, summarySubject, type Period, type Summary } from "../core/summary";
import { toTable } from "../core/table";
import { readGrid, requireSheet, type Env } from "./ports";

export const SALES_SHEET = "Sales";

export interface SummaryConfig {
  to: string;
  businessName: string;
  tzOffsetMinutes?: number;
}

export function sendSummaryEmail(env: Env, period: Period, cfg: SummaryConfig): Summary {
  const sheet = requireSheet(env.sheets, SALES_SHEET);
  const table = toTable(readGrid(sheet), ["Date", "Item", "Amount", "Status"], SALES_SHEET);
  const summary = summarize(table.records, {
    period,
    today: env.now(),
    tzOffsetMinutes: cfg.tzOffsetMinutes ?? 0,
  });
  env.mail.sendEmail(cfg.to, summarySubject(summary, cfg.businessName), renderSummaryText(summary), {
    htmlBody: renderSummaryHtml(summary),
    name: cfg.businessName,
  });
  env.log(`Summary (${period}) sent: ${summary.count} orders`);
  return summary;
}
