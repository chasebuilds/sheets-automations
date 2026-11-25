// Browser demo: runs the real service and core modules from src/ against an in-memory sheet.
// Apps Script services (SpreadsheetApp, GmailApp, DocumentApp, DriveApp, PropertiesService)
// are replaced by the same fakes the unit tests use (tests/fakes.ts), wrapped to log each call.
import { FakeDocs, FakeMail, makeEnv } from "../../tests/fakes";
import { cleanFormResponses } from "../../src/services/formCleanup";
import { generateInvoice } from "../../src/services/invoiceGenerator";
import { sendLowStockAlert } from "../../src/services/lowStock";
import { sendOverdueReminders } from "../../src/services/overdueReminders";
import type { MailOptions } from "../../src/services/ports";
import { sendSummaryEmail } from "../../src/services/summaryEmail";

type Env = ReturnType<typeof makeEnv>;
interface Mail {
  to: string;
  subject: string;
  body: string;
  html?: string;
}
interface Invoice {
  name: string;
  values: Record<string, string>;
}
interface Outcome {
  report: unknown;
  sheets: string[];
}
interface Automation {
  id: string;
  title: string;
  blurb: string;
  sheet: string;
  csv: string;
  run(env: Env): Outcome;
}

const BUSINESS = "Demo Bakery";
const AUTOMATIONS: Automation[] = [
  {
    id: "form-cleanup",
    title: "Form cleanup",
    blurb: "New Google Form rows go to a Master sheet: names trimmed and cased, US phones formatted, emails lowercased, duplicates skipped, bad rows sent to Rejected with a reason.",
    sheet: "Form Responses 1",
    csv: "samples/form-cleanup-form-responses-1.csv",
    run: (e) => ({ report: cleanFormResponses(e.env), sheets: ["Master", "Rejected"] }),
  },
  {
    id: "summary-email",
    title: "Summary email",
    blurb: "Reads the Sales tab and emails yesterday's totals (daily) and the previous 7 days (weekly): orders, revenue, average, status split and top items.",
    sheet: "Sales",
    csv: "samples/summary-email-sales.csv",
    run: (e) => {
      const cfg = { to: "owner@example.com", businessName: BUSINESS };
      return { report: { daily: sendSummaryEmail(e.env, "daily", cfg), weekly: sendSummaryEmail(e.env, "weekly", cfg) }, sheets: [] };
    },
  },
  {
    id: "invoice-pdf",
    title: "Invoice PDF",
    blurb: "For each row without a PDF link, the Docs template is filled from the row, saved as a PDF, and the link and Invoiced status are written back.",
    sheet: "Invoices",
    csv: "samples/invoice-pdf-invoices.csv",
    run: (e) => {
      const rows = e.ss.get("Invoices").data.length;
      const results = [];
      for (let r = 2; r <= rows; r++) results.push(generateInvoice(e.env, r, "TEMPLATE_DOC_ID"));
      return { report: results, sheets: ["Invoices"] };
    },
  },
  {
    id: "overdue-reminders",
    title: "Overdue reminders",
    blurb: "Emails overdue, unpaid invoices. Paid, opted-out and not-yet-due rows are skipped, reminders are spaced out and capped, and every send is logged. Run it twice: the second run sends nothing.",
    sheet: "Invoices Due",
    csv: "samples/overdue-reminders-invoices-due.csv",
    run: (e) => ({
      report: sendOverdueReminders(e.env, { businessName: BUSINESS, minDaysBetween: 7, maxReminders: 3, maxPerRun: 50 }),
      sheets: ["Invoices Due", "Send Log"],
    }),
  },
  {
    id: "low-stock",
    title: "Low-stock alert",
    blurb: "One email lists items at or below their reorder point, grouped by supplier. The Last Alert column stops the same item being emailed every day.",
    sheet: "Inventory",
    csv: "samples/low-stock-inventory.csv",
    run: (e) => ({ report: sendLowStockAlert(e.env, { to: "owner@example.com", businessName: BUSINESS, repeatDays: 7 }), sheets: ["Inventory"] }),
  },
];

const $ = (sel: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const input = (sel: string) => $(sel) as HTMLInputElement;
const area = () => $("#csv") as HTMLTextAreaElement;
/** Cell text the way Sheets shows it: dates as yyyy-mm-dd, blanks empty. */
const cellText = (v: unknown, fullDates = false): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return fullDates ? v.toISOString() : v.toISOString().slice(0, 10);
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
};
const esc = (v: unknown): string =>
  cellText(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/** Parses CSV and turns numeric text into numbers, the way Sheets types cells on import. */
export function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === '"' && text.charAt(i + 1) === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text.charAt(i + 1) === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r, i) => (i === 0 ? r : r.map((v) => (/^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v))));
}

const toCsv = (rows: unknown[][]): string =>
  rows
    .map((r) =>
      r
        .map((v) => {
          const s = cellText(v, true);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n") + "\n";

function table(rows: unknown[][]): string {
  const [head = [], ...body] = rows;
  return `<div class="tablewrap card"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${head.map((_, i) => `<td>${esc(r[i])}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function invoiceHtml(inv: Invoice): string {
  const v = (k: string) => esc(inv.values[k] ?? "");
  return `<div class="invoice"><div class="inv-head"><strong>${esc(BUSINESS)}</strong><span>INVOICE ${v("invoice_number")}</span></div>
    <p>Date: ${v("date")}<br>Bill to: ${v("client")} ${v("client_email")}</p>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
    <tbody><tr><td>${v("description")}</td><td>${v("qty")}</td><td>${v("unit_price")}</td><td>${v("subtotal")}</td></tr></tbody></table>
    <p class="inv-total">Subtotal ${v("subtotal")}<br>Tax (${v("tax_percent")}%) ${v("tax")}<br><strong>Total ${v("total")}</strong></p>
    <p class="muted">File name: ${esc(inv.name)}.pdf</p></div>`;
}

let current = AUTOMATIONS[0] as Automation;
const csvText = new Map<string, string>();

async function select(a: Automation): Promise<void> {
  current = a;
  document.querySelectorAll<HTMLButtonElement>("#tabs .tab").forEach((b) => b.classList.toggle("on", b.dataset.id === a.id));
  $("#blurb").textContent = a.blurb;
  $("#sheet-name").textContent = a.sheet;
  if (!csvText.has(a.id)) csvText.set(a.id, await (await fetch(a.csv)).text());
  area().value = csvText.get(a.id) ?? "";
  $("#out").hidden = true;
  $("#status").textContent = "";
}

function run(): void {
  const status = $("#status");
  try {
    csvText.set(current.id, area().value);
    const today = input("#today").value || "2026-03-10";
    const e = makeEnv(`${today}T07:00:00Z`);
    const calls: string[] = [];
    const mails: Mail[] = [];
    const invoices: Invoice[] = [];
    const mail = new FakeMail();
    mail.sendEmail = (to: string, subject: string, body: string, options?: MailOptions) => {
      calls.push(`GmailApp.sendEmail("${to}", "${subject}") [mocked: nothing was sent]`);
      mails.push({ to, subject, body, ...(options?.htmlBody ? { html: options.htmlBody } : {}) });
    };
    const docs = new FakeDocs();
    const create = docs.createFromTemplate.bind(docs);
    docs.createFromTemplate = (templateId, name, replacements) => {
      calls.push(`DocumentApp: copy template ${templateId} as "${name}" and fill placeholders [mocked]`);
      invoices.push({ name, values: replacements });
      return create(templateId, name, replacements);
    };
    docs.exportPdf = (docId, fileName) => {
      calls.push(`DriveApp: save ${docId} as ${fileName} [mocked: no file was made]`);
      return { id: `pdf-${docId}`, url: `(mock Drive link) ${fileName}` };
    };
    e.env.mail = mail;
    e.env.docs = docs;
    e.ss.add(current.sheet, parseCsv(csvText.get(current.id) ?? ""));
    const result = current.run(e);

    const parts: string[] = [];
    if (e.logs.length) parts.push(`<h3>Script log</h3><pre class="card log">${esc(e.logs.join("\n"))}</pre>`);
    for (const name of result.sheets) {
      const rows = e.ss.get(name).data;
      parts.push(`<h3>Sheet: ${esc(name)} <a class="pill dl" data-sheet="${esc(name)}">Download CSV</a></h3>${table(rows)}`);
    }
    for (const m of mails) {
      parts.push(`<h3>Email preview</h3><div class="card mail"><div class="mail-head">To: ${esc(m.to)}<br>Subject: <strong>${esc(m.subject)}</strong></div>${
        m.html ? `<iframe sandbox="" srcdoc="${esc(m.html)}" title="Email HTML preview"></iframe>` : `<pre>${esc(m.body)}</pre>`
      }</div>`);
    }
    for (const inv of invoices) parts.push(`<h3>Invoice preview (template filled from the row)</h3>${invoiceHtml(inv)}`);
    parts.push(
      `<details><summary>Return value of the run (JSON)</summary><pre class="card log">${esc(JSON.stringify(result.report, null, 2))}</pre></details>`,
    );
    parts.push(`<h3>Mocked Apps Script calls</h3><pre class="card log">${esc(
      ["SpreadsheetApp: in-memory sheet built from the CSV above [mocked]", ...calls].join("\n"),
    )}</pre>`);
    const out = $("#out");
    out.innerHTML = parts.join("");
    out.hidden = false;
    out.querySelectorAll<HTMLAnchorElement>("a.dl").forEach((a) => {
      const name = a.dataset.sheet ?? "";
      a.href = URL.createObjectURL(new Blob([toCsv(e.ss.get(name).data)], { type: "text/csv" }));
      a.download = `${name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    });
    status.textContent = "Done.";
    status.dataset.kind = "ok";
  } catch (err) {
    status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    status.dataset.kind = "bad";
  }
}

const tabs = $("#tabs");
for (const a of AUTOMATIONS) {
  const b = document.createElement("button");
  b.className = "tab";
  b.textContent = a.title;
  b.dataset.id = a.id;
  b.onclick = () => void select(a);
  tabs.appendChild(b);
}
$("#run").onclick = run;
input("#file").onchange = async (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (f) area().value = await f.text();
};
$("#reset").onclick = () => {
  csvText.delete(current.id);
  void select(current);
};
void select(current).then(() => {
  document.body.dataset.ready = "1";
});
