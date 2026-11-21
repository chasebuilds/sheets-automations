// Runs the real automations against in-memory sheets to produce the sample workbook and screenshots.
// Bundled and executed by scripts/make-samples.mjs. Not part of the Apps Script build.
import { makeEnv, FakeDocs } from "../tests/fakes";
import { cleanFormResponses } from "../src/services/formCleanup";
import { sendSummaryEmail } from "../src/services/summaryEmail";
import { generateInvoice } from "../src/services/invoiceGenerator";
import { sendOverdueReminders } from "../src/services/overdueReminders";
import { sendLowStockAlert } from "../src/services/lowStock";

export interface Tab {
  name: string;
  rows: unknown[][];
}
export interface Mail {
  to: string;
  subject: string;
  body: string;
}
export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  before: Tab[];
  after: Tab[];
  mail: Mail[];
}

const NOW = "2026-03-10T07:00:00Z";
const copy = (rows: unknown[][]) => rows.map((r) => [...r]);
const snap = (ss: ReturnType<typeof makeEnv>["ss"], names: string[]): Tab[] =>
  names.map((n) => ({ name: n, rows: copy(ss.get(n).data) }));

export function run(): Scenario[] {
  const out: Scenario[] = [];

  // 1. Form cleanup
  {
    const { env, ss } = makeEnv(NOW);
    ss.add("Form Responses 1", [
      ["Timestamp", "Name", "Email", "Phone", "Message"],
      ["2026-03-09T09:12:00Z", "maria GARCIA", "Maria.Garcia@Example.com ", "555.201.7788", "Need a quote for 40 chairs"],
      ["2026-03-09T09:40:00Z", "Maria Garcia", "maria.garcia@example.com", "(555) 201-7788", "Sent twice by mistake"],
      ["2026-03-09T11:05:00Z", "tom  nguyen", "tom@shopmail", "", "Typo in my email"],
      ["2026-03-09T13:30:00Z", "Priya Shah", "priya@example.com", "1-555-330-1200", "Weekend availability?"],
      ["2026-03-09T15:22:00Z", "DEV PATEL", "", "555 440 9981", "Phone only, please call"],
      ["2026-03-09T16:01:00Z", "Ian McDonald", "ian@example.com", "", "Do you deliver?"],
    ]);
    const before = snap(ss, ["Form Responses 1"]);
    cleanFormResponses(env);
    out.push({
      id: "form-cleanup",
      title: "1. Form responses to a clean master sheet",
      blurb: "Names and phones are tidied, duplicates are skipped, bad rows go to Rejected with a reason.",
      before,
      after: snap(ss, ["Master", "Rejected"]),
      mail: [],
    });
  }

  // 2. Summary email
  {
    const { env, ss, mail } = makeEnv(NOW);
    ss.add("Sales", [
      ["Date", "Customer", "Item", "Amount", "Status"],
      ["2026-03-09", "Lena K.", "Sourdough loaf", 7.5, "Paid"],
      ["2026-03-09", "Omar R.", "Catering tray", 180, "Paid"],
      ["2026-03-09", "Joy T.", "Sourdough loaf", 15, "Paid"],
      ["2026-03-09", "Sam W.", "Cake order", 64.99, "Pending"],
      ["2026-03-08", "Lena K.", "Cake order", 42, "Paid"],
      ["2026-03-04", "Ray D.", "Catering tray", 95, "Paid"],
      ["2026-02-20", "Ann B.", "Sourdough loaf", 7.5, "Paid"],
    ]);
    const before = snap(ss, ["Sales"]);
    sendSummaryEmail(env, "daily", { to: "owner@example.com", businessName: "Demo Bakery" });
    sendSummaryEmail(env, "weekly", { to: "owner@example.com", businessName: "Demo Bakery" });
    out.push({
      id: "summary-email",
      title: "2. Daily and weekly summary email",
      blurb: "Reads the Sales tab and emails yesterday's totals (daily) or the previous 7 days (weekly).",
      before,
      after: [],
      mail: mail.sent.map((m) => ({ to: m.to, subject: m.subject, body: m.body })),
    });
  }

  // 3. Invoice PDF
  {
    const { env, ss } = makeEnv(NOW);
    let n = 0;
    const docs = new FakeDocs();
    docs.exportPdf = (_id, fileName) => ({
      id: `sample-${++n}`,
      url: `https://drive.google.com/file/d/sample-${n}/view (${fileName})`,
    });
    env.docs = docs;
    ss.add("Invoices", [
      ["Invoice #", "Date", "Client", "Client Email", "Description", "Qty", "Unit Price", "Tax %", "Status", "PDF Link"],
      ["INV-1001", "2026-03-02", "Acme Bakery", "ap@acme.example", "Monthly bookkeeping", 3, 19.99, 8.25, "Draft", ""],
      ["INV-1002", "2026-03-05", "Birch & Co", "hello@birch.example", "Website fixes (hours)", 6.5, 85, 0, "Draft", ""],
    ]);
    const before = snap(ss, ["Invoices"]);
    generateInvoice(env, 2, "TEMPLATE_DOC_ID");
    generateInvoice(env, 3, "TEMPLATE_DOC_ID");
    out.push({
      id: "invoice-pdf",
      title: "3. Invoice PDF from a sheet row",
      blurb: "Select a row, run the menu item. The Docs template is filled, saved as PDF, and the link is written back.",
      before,
      after: snap(ss, ["Invoices"]),
      mail: [],
    });
    const lines = [...docs.created].map((c) => ({ to: "(Docs template fills)", subject: c.name, body: Object.entries(c.replacements).map(([k, v]) => `{{${k}}} = ${v}`).join("\n") }));
    (out[out.length - 1] as Scenario).mail = lines.slice(0, 1);
  }

  // 4. Overdue reminders
  {
    const { env, ss, mail } = makeEnv(NOW);
    ss.add("Invoices Due", [
      ["Client", "Email", "Invoice #", "Amount", "Due Date", "Paid", "Opt Out", "Last Reminded"],
      ["Acme Bakery", "ap@acme.example", "INV-0987", 640.5, "2026-02-20", "", "", ""],
      ["Birch & Co", "hello@birch.example", "INV-0991", 1200, "2026-03-01", "", "", ""],
      ["Cedar Dental", "billing@cedar.example", "INV-0993", 310, "2026-02-15", "Yes", "", ""],
      ["Delta Garage", "office@delta.example", "INV-0995", 89.99, "2026-02-10", "", "Yes", ""],
      ["Elm Studio", "pay@elm.example", "INV-0999", 450, "2026-03-20", "", "", ""],
    ]);
    const before = snap(ss, ["Invoices Due"]);
    sendOverdueReminders(env, { businessName: "Demo Services", minDaysBetween: 7, maxReminders: 3, maxPerRun: 50 });
    out.push({
      id: "overdue-reminders",
      title: "4. Overdue reminders with a send log and opt-out",
      blurb: "Paid, opted-out and not-yet-due rows are skipped. Every send is logged, and a second run does not email again.",
      before,
      after: snap(ss, ["Invoices Due", "Send Log"]),
      mail: mail.sent.slice(0, 1).map((m) => ({ to: m.to, subject: m.subject, body: m.body })),
    });
  }

  // 5. Low stock
  {
    const { env, ss, mail } = makeEnv(NOW);
    ss.add("Inventory", [
      ["SKU", "Item", "On Hand", "Reorder Point", "Supplier", "Last Alert"],
      ["FL-25", "Flour 25kg", 2, 5, "Mill Co", ""],
      ["SG-10", "Sugar 10kg", 5, 5, "Mill Co", ""],
      ["CP-12", "Cups 12oz (sleeve)", 40, 10, "Paper Plus", ""],
      ["LD-12", "Lids 12oz (sleeve)", 3, 10, "Paper Plus", "2026-03-08"],
      ["BX-09", "Cake boxes 9in", 0, 20, "", ""],
    ]);
    const before = snap(ss, ["Inventory"]);
    sendLowStockAlert(env, { to: "owner@example.com", businessName: "Demo Bakery", repeatDays: 7 });
    out.push({
      id: "low-stock",
      title: "5. Inventory low-stock alert",
      blurb: "One email lists items at or below their reorder point, grouped by supplier. Last Alert stops daily repeats.",
      before,
      after: snap(ss, ["Inventory"]),
      mail: mail.sent.map((m) => ({ to: m.to, subject: m.subject, body: m.body })),
    });
  }
  return out;
}
