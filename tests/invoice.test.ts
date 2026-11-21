import { describe, expect, it } from "vitest";
import { buildInvoice, pdfFileName, placeholders } from "../src/core/invoice";
import { generateInvoice } from "../src/services/invoiceGenerator";
import { makeEnv } from "./fakes";

const HEAD = ["Invoice #", "Date", "Client", "Client Email", "Description", "Qty", "Unit Price", "Tax %", "Status", "PDF Link"];
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  row: 2,
  v: {
    "invoice #": "INV-1001",
    date: "2026-03-01",
    client: "Acme Bakery",
    "client email": "ap@acme.example",
    description: "Monthly bookkeeping",
    qty: 3,
    "unit price": "$19.99",
    "tax %": 8.25,
    ...over,
  },
});

describe("buildInvoice", () => {
  it("computes totals in cents", () => {
    const inv = buildInvoice(row());
    expect(inv.subtotalCents).toBe(5997);
    expect(inv.taxCents).toBe(495); // 59.97 * 8.25% = 4.9475
    expect(inv.totalCents).toBe(6492);
  });

  it("treats a blank tax as zero", () => {
    expect(buildInvoice(row({ "tax %": "" })).taxCents).toBe(0);
  });

  it("supports fractional quantities", () => {
    expect(buildInvoice(row({ qty: 1.5, "unit price": 100, "tax %": 0 })).totalCents).toBe(15000);
  });

  it.each([
    [{ "invoice #": "" }, "Invoice # is empty"],
    [{ date: "soon" }, "Date is missing"],
    [{ client: "" }, "Client is empty"],
    [{ qty: 0 }, "Qty must be"],
    [{ "unit price": "free" }, "Unit Price must be"],
  ])("rejects bad input %j", (over, msg) => {
    expect(() => buildInvoice(row(over))).toThrow(msg);
  });

  it("builds placeholders and a safe file name", () => {
    const inv = buildInvoice(row({ client: "Acme / Bakery & Co." }));
    const p = placeholders(inv);
    expect(p["total"]).toBe("$64.92");
    expect(p["date"]).toBe("2026-03-01");
    expect(pdfFileName(inv)).toBe("Invoice-INV-1001-Acme-Bakery-Co");
  });
});

describe("generateInvoice service", () => {
  const sheetData = () => [
    HEAD,
    ["INV-1001", "2026-03-01", "Acme Bakery", "ap@acme.example", "Bookkeeping", 3, 19.99, 8.25, "Draft", ""],
    ["INV-1002", "2026-03-02", "Old Client", "", "Done", 1, 50, 0, "Invoiced", "https://drive.example/old.pdf"],
  ];

  it("fills the template, then writes the link and status back to the row", () => {
    const { env, ss, docs } = makeEnv("2026-03-05T00:00:00Z");
    const sheet = ss.add("Invoices", sheetData());
    const r = generateInvoice(env, 2, "tmpl-1");
    expect(r.skipped).toBe(false);
    expect(docs.created[0]?.templateId).toBe("tmpl-1");
    expect(docs.created[0]?.replacements["total"]).toBe("$64.92");
    expect(sheet.data[1]?.[9]).toBe("https://drive.example/Invoice-INV-1001-Acme-Bakery.pdf");
    expect(sheet.data[1]?.[8]).toBe("Invoiced");
  });

  it("does not create a second PDF for the same row", () => {
    const { env, ss, docs } = makeEnv("2026-03-05T00:00:00Z");
    ss.add("Invoices", sheetData());
    const r = generateInvoice(env, 3, "tmpl-1");
    expect(r).toEqual({ invoice: "INV-1002", url: "https://drive.example/old.pdf", skipped: true });
    expect(docs.created).toHaveLength(0);
  });

  it("explains setup and row problems", () => {
    const { env, ss } = makeEnv("2026-03-05T00:00:00Z");
    ss.add("Invoices", sheetData());
    expect(() => generateInvoice(env, 2, "")).toThrow("INVOICE_TEMPLATE_ID");
    expect(() => generateInvoice(env, 1, "t")).toThrow("not a data row");
    expect(() => generateInvoice(env, 40, "t")).toThrow("not a data row");
  });
});
