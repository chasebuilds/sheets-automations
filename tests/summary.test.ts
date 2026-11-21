import { describe, expect, it } from "vitest";
import { renderSummaryHtml, renderSummaryText, summarize, summarySubject } from "../src/core/summary";
import { toTable } from "../src/core/table";
import { sendSummaryEmail } from "../src/services/summaryEmail";
import { makeEnv } from "./fakes";

const HEAD = ["Date", "Customer", "Item", "Amount", "Status"];
const TODAY = "2026-03-10T07:00:00Z";
const rows = [
  HEAD,
  ["2026-03-09", "A", "Widget", 100, "Paid"], // yesterday
  ["2026-03-09", "B", "Widget", "$50.50", "Pending"],
  ["2026-03-09", "C", "Gadget", 200, "Paid"],
  ["2026-03-05", "D", "Gadget", 10, "Paid"], // this week only
  ["2026-03-01", "E", "Widget", 999, "Paid"], // too old
  ["2026-03-10", "F", "Widget", 999, "Paid"], // today, excluded
  ["", "G", "Widget", 5, "Paid"], // no date
  ["2026-03-09", "H", "Widget", "n/a", "Paid"], // bad amount
];

describe("summarize", () => {
  const recs = toTable(rows, HEAD).records;

  it("daily covers only yesterday", () => {
    const s = summarize(recs, { period: "daily", today: new Date(TODAY) });
    expect(s.from).toBe("2026-03-09");
    expect(s.to).toBe("2026-03-09");
    expect(s.count).toBe(3);
    expect(s.totalCents).toBe(35050);
    expect(s.averageCents).toBe(11683);
    expect(s.skipped).toBe(2);
    expect(s.byStatus["Paid"]).toEqual({ count: 2, cents: 30000 });
    expect(s.topItems[0]).toEqual({ item: "Gadget", count: 1, cents: 20000 });
  });

  it("weekly covers the 7 full days before today", () => {
    const s = summarize(recs, { period: "weekly", today: new Date(TODAY) });
    expect(s.from).toBe("2026-03-03");
    expect(s.count).toBe(4);
    expect(s.totalCents).toBe(36050);
  });

  it("handles an empty window", () => {
    const s = summarize([], { period: "daily", today: new Date(TODAY) });
    expect(s.count).toBe(0);
    expect(s.averageCents).toBe(0);
    expect(renderSummaryText(s)).toContain("No orders in this period.");
  });

  it("renders text, html and subject", () => {
    const s = summarize(recs, { period: "weekly", today: new Date(TODAY) });
    expect(renderSummaryText(s)).toContain("Revenue: $360.50");
    expect(renderSummaryHtml(s)).toContain("<td>Gadget</td>");
    expect(summarySubject(s, "Shop")).toBe("Shop: weekly summary 2026-03-03 to 2026-03-09");
    expect(summarySubject({ ...s, period: "daily" }, "Shop")).toBe("Shop: daily summary for 2026-03-09");
  });

  it("escapes item names in html", () => {
    const r = toTable([HEAD, ["2026-03-09", "A", "<b>x</b>", 1, "Paid"]], HEAD).records;
    const html = renderSummaryHtml(summarize(r, { period: "daily", today: new Date(TODAY) }));
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("sendSummaryEmail service", () => {
  it("sends one email with text and html", () => {
    const { env, ss, mail } = makeEnv(TODAY);
    ss.add("Sales", rows);
    const s = sendSummaryEmail(env, "daily", { to: "owner@example.com", businessName: "Demo Shop" });
    expect(s.count).toBe(3);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe("owner@example.com");
    expect(mail.sent[0]?.subject).toBe("Demo Shop: daily summary for 2026-03-09");
    expect(mail.sent[0]?.options?.htmlBody).toContain("Revenue");
  });

  it("errors when a column is missing", () => {
    const { env, ss } = makeEnv(TODAY);
    ss.add("Sales", [["Date", "Item"]]);
    expect(() => sendSummaryEmail(env, "daily", { to: "a@b.co", businessName: "x" })).toThrow("missing column");
  });
});
