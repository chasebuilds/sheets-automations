/**
 * Apps Script entry points. This is the only file that touches Apps Script globals.
 * It builds an Env from the real services and calls the tested code in ../services.
 * The build step adds a top-level stub for every export so menus and triggers can find them.
 */
import { sendLowStockAlert } from "../services/lowStock";
import { cleanFormResponses as runFormCleanup } from "../services/formCleanup";
import { generateInvoice } from "../services/invoiceGenerator";
import { sendOverdueReminders } from "../services/overdueReminders";
import type { Env } from "../services/ports";
import { sendSummaryEmail } from "../services/summaryEmail";

const props = () => PropertiesService.getScriptProperties();

function prop(key: string, fallback: string): string {
  return props().getProperty(key) ?? fallback;
}

function settings() {
  return {
    to: prop("NOTIFY_EMAIL", Session.getEffectiveUser().getEmail()),
    businessName: prop("BUSINESS_NAME", "My Business"),
    tzOffsetMinutes: Number(prop("TZ_OFFSET_MINUTES", "0")),
  };
}

function makeEnv(): Env {
  const p = props();
  return {
    sheets: SpreadsheetApp.getActiveSpreadsheet(),
    mail: GmailApp,
    props: { get: (k) => p.getProperty(k), set: (k, v) => p.setProperty(k, v) },
    docs: {
      createFromTemplate(templateId, name, replacements) {
        const copy = DriveApp.getFileById(templateId).makeCopy(name);
        const doc = DocumentApp.openById(copy.getId());
        const body = doc.getBody();
        for (const [key, value] of Object.entries(replacements)) {
          body.replaceText(`\\{\\{${key}\\}\\}`, value);
        }
        doc.saveAndClose();
        return copy.getId();
      },
      exportPdf(docId, fileName) {
        const docFile = DriveApp.getFileById(docId);
        const pdf = DriveApp.createFile(docFile.getAs("application/pdf")).setName(fileName);
        docFile.setTrashed(true);
        return { id: pdf.getId(), url: pdf.getUrl() };
      },
    },
    now: () => new Date(),
    log: (m) => {
      console.log(m);
    },
  };
}

export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu("Automations")
    .addItem("Clean new form responses", "cleanFormResponses")
    .addItem("Send daily summary now", "sendDailySummary")
    .addItem("Create invoice for selected row", "createInvoiceForSelectedRow")
    .addItem("Preview overdue reminders (no email)", "previewOverdueReminders")
    .addItem("Send overdue reminders", "sendReminders")
    .addItem("Check low stock now", "checkLowStock")
    .addToUi();
}

export function cleanFormResponses(): void {
  runFormCleanup(makeEnv());
}

export function sendDailySummary(): void {
  sendSummaryEmail(makeEnv(), "daily", settings());
}

export function sendWeeklySummary(): void {
  sendSummaryEmail(makeEnv(), "weekly", settings());
}

export function createInvoiceForSelectedRow(): void {
  const range = SpreadsheetApp.getActiveRange() as GoogleAppsScript.Spreadsheet.Range | null;
  const row = range?.getRow() ?? 0;
  const result = generateInvoice(makeEnv(), row, prop("INVOICE_TEMPLATE_ID", ""));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    result.skipped ? `Invoice ${result.invoice} already has a PDF` : `Invoice ${result.invoice} created`,
  );
}

function reminderConfig(dryRun: boolean) {
  const s = settings();
  return {
    businessName: s.businessName,
    tzOffsetMinutes: s.tzOffsetMinutes,
    minDaysBetween: Number(prop("REMINDER_MIN_DAYS", "7")),
    maxReminders: Number(prop("REMINDER_MAX", "3")),
    maxPerRun: Number(prop("REMINDER_MAX_PER_RUN", "50")),
    dryRun,
  };
}

export function sendReminders(): void {
  sendOverdueReminders(makeEnv(), reminderConfig(false));
}

export function previewOverdueReminders(): void {
  const plan = sendOverdueReminders(makeEnv(), reminderConfig(true));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Would send ${plan.send.length}, skip ${plan.skipped.length}. No email was sent.`,
  );
}

export function checkLowStock(): void {
  const s = settings();
  sendLowStockAlert(makeEnv(), {
    ...s,
    repeatDays: Number(prop("STOCK_REPEAT_DAYS", "7")),
  });
}

/** Run once from the editor to create the time-driven triggers. */
export function installTriggers(): void {
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger("cleanFormResponses").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("sendDailySummary").timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger("sendReminders").timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger("checkLowStock").timeBased().everyDays(1).atHour(8).create();
}
