import { describe, expect, it } from "vitest";
import { planReminders, reminderBody, reminderSubject, type ReminderConfig } from "../src/core/reminders";
import { toTable } from "../src/core/table";
import { sendOverdueReminders } from "../src/services/overdueReminders";
import { makeEnv } from "./fakes";

const HEAD = ["Client", "Email", "Invoice #", "Amount", "Due Date", "Paid", "Opt Out", "Last Reminded"];
const TODAY = new Date("2026-03-20T09:00:00Z");
const cfg: ReminderConfig = { today: TODAY, minDaysBetween: 7, maxReminders: 3, maxPerRun: 50 };

const sheet = (rows: unknown[][]) => toTable([HEAD, ...rows], HEAD).records;
const base = ["Acme", "ap@acme.example", "INV-1", 250, "2026-03-10", "", "", ""];

describe("planReminders", () => {
  it("sends for an overdue unpaid invoice", () => {
    const p = planReminders(sheet([base]), [], cfg);
    expect(p.send).toHaveLength(1);
    expect(p.send[0]).toMatchObject({ daysOverdue: 10, amountCents: 25000, reminderNumber: 1 });
  });

  it.each([
    ["paid", [...base.slice(0, 5), "Yes", "", ""]],
    ["opted out", [...base.slice(0, 6), "Y", ""]],
    ["not overdue", [...base.slice(0, 4), "2026-03-20", "", "", ""]],
    ["no due date", [...base.slice(0, 4), "", "", "", ""]],
    ["bad amount", ["Acme", "ap@acme.example", "INV-1", "tbd", "2026-03-10", "", "", ""]],
    ["bad email", ["Acme", "not-an-email", "INV-1", 250, "2026-03-10", "", "", ""]],
  ])("skips: %s", (reason, row) => {
    const p = planReminders(sheet([row]), [], cfg);
    expect(p.send).toHaveLength(0);
    expect(p.skipped).toEqual([{ row: 2, reason }]);
  });

  it("waits the minimum days between reminders, using the log", () => {
    const log = [{ email: "AP@acme.example", invoice: "INV-1", sentAt: new Date("2026-03-16T09:00:00Z") }];
    expect(planReminders(sheet([base]), log, cfg).skipped[0]?.reason).toBe("reminded recently");
    const older = [{ ...log[0]!, sentAt: new Date("2026-03-13T09:00:00Z") }];
    const p = planReminders(sheet([base]), older, cfg);
    expect(p.send[0]?.reminderNumber).toBe(2);
  });

  it("stops after the maximum number of reminders", () => {
    const log = ["2026-02-20", "2026-02-27", "2026-03-06"].map((d) => ({
      email: "ap@acme.example",
      invoice: "INV-1",
      sentAt: new Date(d),
    }));
    expect(planReminders(sheet([base]), log, cfg).skipped[0]?.reason).toBe("max reminders reached");
  });

  it("does not mix up invoices for the same client", () => {
    const log = [{ email: "ap@acme.example", invoice: "INV-2", sentAt: new Date("2026-03-19T00:00:00Z") }];
    expect(planReminders(sheet([base]), log, cfg).send).toHaveLength(1);
  });

  it("caps a run", () => {
    const many = Array.from({ length: 5 }, (_, i) => ["C", `c${i}@x.com`, `INV-${i}`, 10, "2026-03-01", "", "", ""]);
    const p = planReminders(sheet(many), [], { ...cfg, maxPerRun: 2 });
    expect(p.send).toHaveLength(2);
    expect(p.skipped.map((s) => s.reason)).toEqual(["run cap reached", "run cap reached", "run cap reached"]);
  });

  it("writes a plain message that mentions opting out", () => {
    const rem = planReminders(sheet([base]), [], cfg).send[0]!;
    expect(reminderSubject(rem, "Shop")).toBe("Shop: invoice INV-1 is 10 days overdue");
    expect(reminderBody(rem, "Shop")).toContain("$250.00");
    expect(reminderBody(rem, "Shop")).toContain("Reply STOP");
    expect(reminderSubject({ ...rem, daysOverdue: 1 }, "Shop")).toContain("1 day overdue");
  });
});

describe("sendOverdueReminders service", () => {
  const run = { businessName: "Demo Shop", minDaysBetween: 7, maxReminders: 3, maxPerRun: 50 };
  const data = () => [
    HEAD,
    [...base],
    ["Paid Co", "p@x.com", "INV-2", 90, "2026-03-01", "Y", "", ""],
    ["Quiet Co", "q@x.com", "INV-3", 40, "2026-03-01", "", "yes", ""],
  ];

  it("emails only eligible rows, logs the send and stamps Last Reminded", () => {
    const { env, ss, mail } = makeEnv("2026-03-20T09:00:00Z");
    const due = ss.add("Invoices Due", data());
    const plan = sendOverdueReminders(env, run);
    expect(plan.send).toHaveLength(1);
    expect(mail.sent.map((m) => m.to)).toEqual(["ap@acme.example"]);
    const log = ss.get("Send Log").data;
    expect(log[0]).toEqual(["Sent At", "Email", "Invoice #", "Days Overdue", "Reminder #", "Result"]);
    expect(log[1]).toEqual([TODAY, "ap@acme.example", "INV-1", 10, 1, "sent"]);
    expect(due.data[1]?.[7]).toEqual(TODAY);
  });

  it("does not email the same invoice twice on back-to-back runs", () => {
    const { env, ss, mail } = makeEnv("2026-03-20T09:00:00Z");
    ss.add("Invoices Due", data());
    sendOverdueReminders(env, run);
    sendOverdueReminders(env, run);
    expect(mail.sent).toHaveLength(1);
  });

  it("dry run sends and logs nothing", () => {
    const { env, ss, mail } = makeEnv("2026-03-20T09:00:00Z");
    ss.add("Invoices Due", data());
    const plan = sendOverdueReminders(env, { ...run, dryRun: true });
    expect(plan.send).toHaveLength(1);
    expect(mail.sent).toHaveLength(0);
    expect(ss.get("Send Log").data).toHaveLength(1);
  });

  it("records a failed send and does not count it toward the limits", () => {
    const { env, ss, mail } = makeEnv("2026-03-20T09:00:00Z");
    const due = ss.add("Invoices Due", data());
    mail.failFor.add("ap@acme.example");
    sendOverdueReminders(env, run);
    expect(String(ss.get("Send Log").data[1]?.[5])).toContain("error: Service invoked too many times");
    expect(due.data[1]?.[7]).toBe("");
    mail.failFor.clear();
    sendOverdueReminders(env, run);
    expect(mail.sent).toHaveLength(1);
  });
});
