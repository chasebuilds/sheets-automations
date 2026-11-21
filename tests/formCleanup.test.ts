import { describe, expect, it } from "vitest";
import { cleanName, cleanPhone, cleanResponses, dedupeKey } from "../src/core/cleaner";
import { cleanFormResponses } from "../src/services/formCleanup";
import { makeEnv } from "./fakes";

const HEAD = ["Timestamp", "Name", "Email", "Phone", "Message"];

describe("cleaner", () => {
  it("fixes shouty and lowercase names but keeps mixed case", () => {
    expect(cleanName("  JANE   o'neil ")).toBe("Jane O'Neil");
    expect(cleanName("mary-ann smith")).toBe("Mary-Ann Smith");
    expect(cleanName("Ian McDonald")).toBe("Ian McDonald");
    expect(cleanName("")).toBe("");
  });

  it("formats US phones and leaves others alone", () => {
    expect(cleanPhone("555.123.4567")).toBe("(555) 123-4567");
    expect(cleanPhone("+1 555 123 4567")).toBe("(555) 123-4567");
    expect(cleanPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(cleanPhone("")).toBe("");
  });

  it("builds a dedupe key from email, then phone", () => {
    expect(dedupeKey("a@b.co", "123")).toBe("e:a@b.co");
    expect(dedupeKey("", "(555) 123-4567")).toBe("p:5551234567");
    expect(dedupeKey("", "1-555-123-4567")).toBe("p:5551234567");
    expect(dedupeKey("", "")).toBe("");
  });

  it("dedupes against master and within the batch, and rejects bad rows", () => {
    const rows = [
      { row: 2, v: { name: "ann", email: "Ann@X.com ", phone: "", message: "hi" } },
      { row: 3, v: { name: "Ann", email: "ann@x.com", phone: "", message: "again" } },
      { row: 4, v: { name: "Bo", email: "bo@x", phone: "", message: "" } },
      { row: 5, v: { name: "Cy", email: "", phone: "", message: "" } },
      { row: 6, v: { name: "Di", email: "di@x.com", phone: "", message: "" } },
      { row: 7, v: { name: "Ed", email: "", phone: "555 111 2222", message: "x\n  y" } },
    ];
    const r = cleanResponses(rows, ["e:di@x.com"]);
    expect(r.added.map((a) => a.sourceRow)).toEqual([2, 7]);
    expect(r.added[0]?.name).toBe("Ann");
    expect(r.added[1]?.message).toBe("x y");
    expect(r.duplicates.map((d) => d.row)).toEqual([3, 6]);
    expect(r.rejected).toEqual([
      { row: 4, reason: "Invalid email: bo@x" },
      { row: 5, reason: "No email or phone" },
    ]);
  });
});

describe("cleanFormResponses service", () => {
  const form = [
    HEAD,
    ["2026-03-01T10:00:00Z", "ann lee", "ANN@x.com", "5551234567", "Quote please"],
    ["2026-03-01T11:00:00Z", "Ann Lee", "ann@x.com", "5551234567", "Same person"],
    ["2026-03-01T12:00:00Z", "Bad", "nope", "", ""],
  ];

  it("creates Master and Rejected, then writes cleaned rows", () => {
    const { env, ss } = makeEnv("2026-03-02T00:00:00Z");
    ss.add("Form Responses 1", form);
    const report = cleanFormResponses(env);
    expect(report).toEqual({ added: 1, duplicates: 1, rejected: 1 });
    const master = ss.get("Master").data;
    expect(master[0]).toEqual(["Received", "Name", "Email", "Phone", "Message", "Source Row"]);
    expect(master[1]).toEqual([new Date("2026-03-01T10:00:00Z"), "Ann Lee", "ann@x.com", "(555) 123-4567", "Quote please", 2]);
    expect(ss.get("Rejected").data[1]?.slice(0, 2)).toEqual([4, "Invalid email: nope"]);
  });

  it("is idempotent: a second run adds nothing", () => {
    const { env, ss } = makeEnv("2026-03-02T00:00:00Z");
    ss.add("Form Responses 1", form);
    cleanFormResponses(env);
    const second = cleanFormResponses(env);
    expect(second).toEqual({ added: 0, duplicates: 0, rejected: 0 });
    expect(ss.get("Master").data).toHaveLength(2);
    expect(ss.get("Rejected").data).toHaveLength(2);
  });

  it("picks up only rows added since the last run and still dedupes them against master", () => {
    const { env, ss } = makeEnv("2026-03-02T00:00:00Z");
    const f = ss.add("Form Responses 1", form);
    cleanFormResponses(env);
    f.data.push(["2026-03-02T09:00:00Z", "ANN", "ann@x.com", "", "later"], ["2026-03-02T09:05:00Z", "New", "new@x.com", "", ""]);
    const r = cleanFormResponses(env);
    expect(r).toEqual({ added: 1, duplicates: 1, rejected: 0 });
  });

  it("fails clearly when the form tab is missing", () => {
    const { env } = makeEnv("2026-03-02T00:00:00Z");
    expect(() => cleanFormResponses(env)).toThrow('Sheet "Form Responses 1" not found');
  });
});
