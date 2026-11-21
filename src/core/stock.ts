import { daysBetween, escapeHtml, num, str, toDate } from "./values";
import type { Rec } from "./table";

export interface StockConfig {
  today: Date;
  /** Do not re-alert the same SKU more often than this. */
  repeatDays: number;
  tzOffsetMinutes?: number;
}

export interface LowItem {
  row: number;
  sku: string;
  item: string;
  onHand: number;
  reorderPoint: number;
  supplier: string;
}

export interface StockPlan {
  alerts: LowItem[];
  /** Rows that are low but were alerted recently. */
  suppressed: number;
  /** Rows with a bad number, so the owner can fix the sheet. */
  invalid: number[];
}

export function planStockAlerts(rows: Rec[], cfg: StockConfig): StockPlan {
  const plan: StockPlan = { alerts: [], suppressed: 0, invalid: [] };
  for (const r of rows) {
    const onHand = num(r.v["on hand"]);
    const point = num(r.v["reorder point"]);
    if (Number.isNaN(onHand) || Number.isNaN(point)) {
      plan.invalid.push(r.row);
      continue;
    }
    if (onHand > point) continue;
    const last = toDate(r.v["last alert"]);
    if (last && daysBetween(last, cfg.today, cfg.tzOffsetMinutes ?? 0) < cfg.repeatDays) {
      plan.suppressed++;
      continue;
    }
    plan.alerts.push({
      row: r.row,
      sku: str(r.v["sku"]),
      item: str(r.v["item"]),
      onHand,
      reorderPoint: point,
      supplier: str(r.v["supplier"]) || "No supplier listed",
    });
  }
  return plan;
}

export function groupBySupplier(items: LowItem[]): Map<string, LowItem[]> {
  const m = new Map<string, LowItem[]>();
  for (const i of items) m.set(i.supplier, [...(m.get(i.supplier) ?? []), i]);
  return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function stockText(items: LowItem[]): string {
  const lines = [`${items.length} item(s) at or below their reorder point:`];
  for (const [supplier, list] of groupBySupplier(items)) {
    lines.push("", supplier);
    for (const i of list) lines.push(`  ${i.sku} ${i.item}: ${i.onHand} on hand (reorder at ${i.reorderPoint})`);
  }
  return lines.join("\n");
}

export function stockHtml(items: LowItem[]): string {
  const parts = [`<p>${items.length} item(s) at or below their reorder point.</p>`];
  for (const [supplier, list] of groupBySupplier(items)) {
    parts.push(`<p><b>${escapeHtml(supplier)}</b></p><ul>`);
    for (const i of list) {
      parts.push(
        `<li>${escapeHtml(i.sku)} ${escapeHtml(i.item)}: ${i.onHand} on hand (reorder at ${i.reorderPoint})</li>`,
      );
    }
    parts.push("</ul>");
  }
  return parts.join("");
}
