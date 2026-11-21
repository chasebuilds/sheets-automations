import { describe, expect, it } from "vitest";
import { groupBySupplier, planStockAlerts, stockHtml, stockText } from "../src/core/stock";
import { toTable } from "../src/core/table";
import { sendLowStockAlert } from "../src/services/lowStock";
import { makeEnv } from "./fakes";

const HEAD = ["SKU", "Item", "On Hand", "Reorder Point", "Supplier", "Last Alert"];
const TODAY = "2026-03-20T08:00:00Z";
const data = [
  HEAD,
  ["A-1", "Flour 25kg", 2, 5, "Mill Co", ""],
  ["A-2", "Sugar 10kg", 5, 5, "Mill Co", ""], // equal counts as low
  ["B-1", "Cups", 400, 100, "Paper Plus", ""], // fine
  ["B-2", "Lids", 10, 100, "Paper Plus", "2026-03-18"], // alerted 2 days ago
  ["C-1", "Napkins", "??", 100, "Paper Plus", ""], // bad number
  ["D-1", "Mystery", 0, 1, "", ""],
];

describe("planStockAlerts", () => {
  const recs = toTable(data, HEAD).records;
  const plan = planStockAlerts(recs, { today: new Date(TODAY), repeatDays: 7 });

  it("flags at-or-below reorder point", () => {
    expect(plan.alerts.map((a) => a.sku)).toEqual(["A-1", "A-2", "D-1"]);
  });
  it("suppresses recent alerts and reports invalid rows", () => {
    expect(plan.suppressed).toBe(1);
    expect(plan.invalid).toEqual([6]);
  });
  it("re-alerts after the repeat window", () => {
    const later = planStockAlerts(recs, { today: new Date("2026-03-26T08:00:00Z"), repeatDays: 7 });
    expect(later.alerts.map((a) => a.sku)).toContain("B-2");
  });
  it("groups by supplier, naming blanks", () => {
    const g = groupBySupplier(plan.alerts);
    expect([...g.keys()]).toEqual(["Mill Co", "No supplier listed"]);
    expect(stockText(plan.alerts)).toContain("A-1 Flour 25kg: 2 on hand (reorder at 5)");
    expect(stockHtml(plan.alerts)).toContain("<b>Mill Co</b>");
  });
});

describe("sendLowStockAlert service", () => {
  const cfg = { to: "owner@example.com", businessName: "Demo Shop", repeatDays: 7 };

  it("sends one email and stamps Last Alert", () => {
    const { env, ss, mail } = makeEnv(TODAY);
    const inv = ss.add("Inventory", data.map((r) => [...r]));
    sendLowStockAlert(env, cfg);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.subject).toBe("Demo Shop: 3 item(s) low on stock");
    expect(inv.data[1]?.[5]).toEqual(new Date(TODAY));
    expect(inv.data[3]?.[5]).toBe("");
  });

  it("does not repeat the alert on the next run", () => {
    const { env, ss, mail } = makeEnv(TODAY);
    ss.add("Inventory", data.map((r) => [...r]));
    sendLowStockAlert(env, cfg);
    sendLowStockAlert(env, cfg);
    expect(mail.sent).toHaveLength(1);
  });

  it("sends nothing when stock is fine", () => {
    const { env, ss, mail } = makeEnv(TODAY);
    ss.add("Inventory", [HEAD, ["B-1", "Cups", 400, 100, "Paper Plus", ""]]);
    sendLowStockAlert(env, cfg);
    expect(mail.sent).toHaveLength(0);
  });

  it("does not stamp rows when the send fails", () => {
    const { env, ss, mail } = makeEnv(TODAY);
    const inv = ss.add("Inventory", data.map((r) => [...r]));
    mail.failFor.add("owner@example.com");
    expect(() => sendLowStockAlert(env, cfg)).toThrow();
    expect(inv.data[1]?.[5]).toBe("");
  });
});
