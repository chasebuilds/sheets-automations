import { planStockAlerts, stockHtml, stockText, type StockPlan } from "../core/stock";
import { colIndex, toTable } from "../core/table";
import { readGrid, requireSheet, setCell, type Env } from "./ports";

export const INVENTORY_SHEET = "Inventory";
const REQUIRED = ["SKU", "Item", "On Hand", "Reorder Point", "Supplier", "Last Alert"];

export interface StockRunConfig {
  to: string;
  businessName: string;
  repeatDays: number;
  tzOffsetMinutes?: number;
}

export function sendLowStockAlert(env: Env, cfg: StockRunConfig): StockPlan {
  const sheet = requireSheet(env.sheets, INVENTORY_SHEET);
  const table = toTable(readGrid(sheet), REQUIRED, INVENTORY_SHEET);
  const today = env.now();
  const plan = planStockAlerts(table.records, {
    today,
    repeatDays: cfg.repeatDays,
    tzOffsetMinutes: cfg.tzOffsetMinutes ?? 0,
  });

  if (plan.alerts.length > 0) {
    env.mail.sendEmail(
      cfg.to,
      `${cfg.businessName}: ${plan.alerts.length} item(s) low on stock`,
      stockText(plan.alerts),
      { htmlBody: stockHtml(plan.alerts), name: cfg.businessName },
    );
    // Stamp only after the email went out, so a send failure retries next run.
    const col = colIndex(table.headers, "Last Alert");
    for (const a of plan.alerts) setCell(sheet, a.row, col, today);
  }
  env.log(`Stock: ${plan.alerts.length} alerted, ${plan.suppressed} suppressed, ${plan.invalid.length} invalid rows`);
  return plan;
}
