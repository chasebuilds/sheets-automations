// Generates samples/*.csv, samples/sample-workbook.xlsx and HTML pages used for the layout screenshots.
// Usage: node scripts/make-samples.mjs [htmlOutDir]
import { build } from "esbuild";
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const htmlDir = resolve(process.argv[2] ?? "docs/_render");
mkdirSync("samples", { recursive: true });
mkdirSync(htmlDir, { recursive: true });

const bundleFile = resolve(tmpdir(), `sheets-automations-sample-${process.pid}.mjs`);
await build({
  entryPoints: ["scripts/sample-run.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundleFile,
  logLevel: "error",
});
const { run } = await import(pathToFileURL(bundleFile).href);
const scenarios = run();

const cell = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? "" : v);
const csvEscape = (v) => {
  const s = String(cell(v));
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const colLetter = (i) => String.fromCharCode(65 + i);

// CSV + XLSX: the starting data for each automation (what the owner would type or paste in).
const wb = new ExcelJS.Workbook();
wb.creator = "Chase Builds";
for (const sc of scenarios) {
  for (const tab of sc.before) {
    writeFileSync(`samples/${sc.id}-${tab.name.replace(/\s+/g, "-").toLowerCase()}.csv`, tab.rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n");
    const ws = wb.addWorksheet(tab.name);
    tab.rows.forEach((r) => ws.addRow(r.map(cell)));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => {
      c.width = 20;
    });
  }
}
await wb.xlsx.writeFile("samples/sample-workbook.xlsx");

function sheetHtml(tab) {
  const cols = Math.max(...tab.rows.map((r) => r.length));
  const head = Array.from({ length: cols }, (_, i) => `<th class="col">${colLetter(i)}</th>`).join("");
  const body = tab.rows
    .map(
      (r, ri) =>
        `<tr><th class="rn">${ri + 1}</th>${Array.from({ length: cols }, (_, ci) => {
          const v = cell(r[ci]);
          const num = typeof v === "number";
          return `<td class="${ri === 0 ? "hdr" : ""}${num ? " n" : ""}">${esc(v)}</td>`;
        }).join("")}</tr>`,
    )
    .join("");
  return `<div class="sheet"><table><tr><th class="corner"></th>${head}</tr>${body}</table><div class="tabs"><span class="tab on">${esc(tab.name)}</span></div></div>`;
}

const css = `
body{margin:0;padding:28px 32px;background:#f6f7f9;color:#1f2328;font:14px/1.45 "Segoe UI",system-ui,sans-serif;width:1376px}
h1{font-size:20px;margin:0 0 4px}p.b{margin:0 0 18px;color:#57606a}
h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#57606a;margin:18px 0 6px}
.sheet{background:#fff;border:1px solid #d0d7de;border-radius:6px;overflow:hidden;margin-bottom:6px}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #e1e4e8;padding:4px 10px;white-space:nowrap;text-align:left;font-size:13px}
th.col,th.corner,th.rn{background:#f1f3f4;color:#5f6368;font-weight:400;text-align:center}
th.rn{width:34px}td.hdr{background:#e8f0fe;font-weight:600}td.n{text-align:right}
.tabs{background:#f1f3f4;border-top:1px solid #d0d7de;padding:6px 10px}.tab{display:inline-block;padding:3px 14px;border-radius:4px;font-size:12px}.tab.on{background:#fff;color:#0b57d0;font-weight:600;box-shadow:0 1px 2px #0002}
.mail{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:12px 16px;margin-top:6px}
.mail .s{font-weight:600}.mail .t{color:#57606a;font-size:12px;margin-bottom:8px}.mail pre{margin:0;font:13px/1.5 Consolas,monospace;white-space:pre-wrap}
`;

for (const sc of scenarios) {
  const parts = [`<h1>${esc(sc.title)}</h1><p class="b">${esc(sc.blurb)}</p>`];
  parts.push(`<h2>Input</h2>${sc.before.map(sheetHtml).join("")}`);
  if (sc.after.length > 0) parts.push(`<h2>After the automation runs</h2>${sc.after.map(sheetHtml).join("")}`);
  for (const m of sc.mail) {
    parts.push(
      `<h2>${m.to.startsWith("(") ? "Template fill values" : "Email sent"}</h2><div class="mail"><div class="s">${esc(m.subject)}</div><div class="t">To: ${esc(m.to)}</div><pre>${esc(m.body)}</pre></div>`,
    );
  }
  writeFileSync(resolve(htmlDir, `${sc.id}.html`), `<!doctype html><meta charset="utf-8"><title>${esc(sc.title)}</title><style>${css}</style>${parts.join("")}`);
}
console.log(`Wrote ${scenarios.length} scenarios: samples/ and ${htmlDir}`);
