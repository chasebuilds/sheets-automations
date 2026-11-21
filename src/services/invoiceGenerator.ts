import { buildInvoice, pdfFileName, placeholders } from "../core/invoice";
import { colIndex, toTable } from "../core/table";
import { str } from "../core/values";
import { readGrid, requireSheet, setCell, type Env } from "./ports";

export const INVOICE_SHEET = "Invoices";
const REQUIRED = ["Invoice #", "Date", "Client", "Description", "Qty", "Unit Price", "Tax %", "Status", "PDF Link"];

export interface InvoiceResult {
  invoice: string;
  url: string;
  skipped: boolean;
}

/** Builds a PDF for one sheet row. If the row already has a PDF link it does nothing. */
export function generateInvoice(env: Env, row: number, templateId: string): InvoiceResult {
  if (templateId === "") throw new Error("Set the INVOICE_TEMPLATE_ID script property first.");
  const sheet = requireSheet(env.sheets, INVOICE_SHEET);
  const table = toTable(readGrid(sheet), REQUIRED, INVOICE_SHEET);
  const rec = table.records.find((r) => r.row === row);
  if (!rec) throw new Error(`Row ${row} is empty or is not a data row.`);

  const existing = str(rec.v["pdf link"]);
  if (existing !== "") {
    env.log(`Row ${row} already has a PDF, skipped`);
    return { invoice: str(rec.v["invoice #"]), url: existing, skipped: true };
  }

  const inv = buildInvoice(rec);
  const name = pdfFileName(inv);
  const docId = env.docs.createFromTemplate(templateId, name, placeholders(inv));
  const pdf = env.docs.exportPdf(docId, `${name}.pdf`);

  setCell(sheet, row, colIndex(table.headers, "PDF Link"), pdf.url);
  setCell(sheet, row, colIndex(table.headers, "Status"), "Invoiced");
  env.log(`Invoice ${inv.number} created`);
  return { invoice: inv.number, url: pdf.url, skipped: false };
}
