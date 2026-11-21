import { describe, expect, it } from "vitest";
import { daysBetween, dayKey, formatCents, isTruthyFlag, isValidEmail, num, toCents, toDate } from "../src/core/values";
import { colIndex, toTable } from "../src/core/table";

describe("values", () => {
  it("parses money strings", () => {
    expect(num("$1,200.50")).toBe(1200.5);
    expect(num(" 7 ")).toBe(7);
    expect(num("")).toBeNaN();
    expect(num("abc")).toBeNaN();
  });

  it("formats cents with separators and sign", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-250)).toBe("-$2.50");
    expect(formatCents(100000000)).toBe("$1,000,000.00");
  });

  it("rounds to cents without float drift", () => {
    expect(toCents(19.99 * 3)).toBe(5997);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("parses dates and rejects junk", () => {
    expect(toDate("2026-03-01")?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(toDate("not a date")).toBeNull();
    expect(toDate("")).toBeNull();
    expect(toDate(new Date("x"))).toBeNull();
  });

  it("counts calendar days and honours the timezone offset", () => {
    const a = new Date("2026-03-01T23:30:00Z");
    const b = new Date("2026-03-02T00:30:00Z");
    expect(daysBetween(a, b)).toBe(1);
    // Five hours behind UTC: both instants fall on March 1 locally.
    expect(daysBetween(a, b, -300)).toBe(0);
    expect(dayKey(b, -300)).toBe("2026-03-01");
  });

  it("validates emails and flags", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
    expect(isTruthyFlag("Yes")).toBe(true);
    expect(isTruthyFlag("")).toBe(false);
    expect(isTruthyFlag("no")).toBe(false);
  });
});

describe("table", () => {
  it("maps headers case-insensitively and numbers rows from 2", () => {
    const t = toTable([["Name", " EMAIL "], ["Ann", "a@b.co"], ["", ""], ["Bo", "b@b.co"]], ["name", "Email"]);
    expect(t.records.map((r) => r.row)).toEqual([2, 4]);
    expect(t.records[1]?.v["email"]).toBe("b@b.co");
  });

  it("names the missing columns", () => {
    expect(() => toTable([["Name"]], ["Name", "Email", "Phone"], "Leads")).toThrow(
      'Sheet "Leads" is missing column(s): Email, Phone',
    );
  });

  it("finds column positions", () => {
    expect(colIndex(["a", "b"], "B")).toBe(2);
    expect(() => colIndex(["a"], "z")).toThrow("Missing column: z");
  });

  it("handles an empty grid", () => {
    expect(() => toTable([], ["x"])).toThrow();
  });
});
