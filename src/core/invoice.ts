import { formatCents, num, str, toCents, toDate } from "./values";
import type { Rec } from "./table";

export interface Invoice {
  number: string;
  date: Date;
  client: string;
  clientEmail: string;
  description: string;
  qty: number;
  unitCents: number;
  taxPercent: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export function buildInvoice(r: Rec): Invoice {
  const number = str(r.v["invoice #"]);
  if (number === "") throw new Error(`Row ${r.row}: Invoice # is empty`);
  const date = toDate(r.v["date"]);
  if (!date) throw new Error(`Row ${r.row}: Date is missing or not a date`);
  const client = str(r.v["client"]);
  if (client === "") throw new Error(`Row ${r.row}: Client is empty`);
  const qty = num(r.v["qty"]);
  const unit = num(r.v["unit price"]);
  if (Number.isNaN(qty) || qty <= 0) throw new Error(`Row ${r.row}: Qty must be a positive number`);
  if (Number.isNaN(unit) || unit < 0) throw new Error(`Row ${r.row}: Unit Price must be a number`);
  const taxRaw = num(r.v["tax %"]);
  const taxPercent = Number.isNaN(taxRaw) ? 0 : taxRaw;

  const unitCents = toCents(unit);
  const subtotalCents = Math.round(unitCents * qty);
  const taxCents = Math.round((subtotalCents * taxPercent) / 100);
  return {
    number,
    date,
    client,
    clientEmail: str(r.v["client email"]),
    description: str(r.v["description"]),
    qty,
    unitCents,
    taxPercent,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

/** Placeholders used in the Docs template, written as {{name}}. */
export function placeholders(inv: Invoice): Record<string, string> {
  return {
    invoice_number: inv.number,
    date: inv.date.toISOString().slice(0, 10),
    client: inv.client,
    client_email: inv.clientEmail,
    description: inv.description,
    qty: String(inv.qty),
    unit_price: formatCents(inv.unitCents),
    subtotal: formatCents(inv.subtotalCents),
    tax_percent: String(inv.taxPercent),
    tax: formatCents(inv.taxCents),
    total: formatCents(inv.totalCents),
  };
}

export function pdfFileName(inv: Invoice): string {
  const safe = inv.client.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Invoice-${inv.number}-${safe}`;
}
