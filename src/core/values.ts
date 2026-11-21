/** Small value helpers. Sheets hands back strings, numbers, Dates and "" for blanks. */

export function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Parses 12, "12.5", "$1,200.50". Returns NaN when it is not a number. */
export function num(v: unknown): number {
  if (typeof v === "number") return v;
  const s = str(v).replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  return Number(s);
}

export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = str(v);
  if (s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar day key (YYYY-MM-DD) after shifting by a timezone offset in minutes. */
export function dayKey(d: Date, tzOffsetMinutes = 0): string {
  return new Date(d.getTime() + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Whole calendar days from a to b (b later gives a positive number). */
export function daysBetween(a: Date, b: Date, tzOffsetMinutes = 0): number {
  const ms = Date.parse(dayKey(b, tzOffsetMinutes)) - Date.parse(dayKey(a, tzOffsetMinutes));
  return Math.round(ms / 86_400_000);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(s: string): boolean {
  return EMAIL.test(s);
}

export function isTruthyFlag(v: unknown): boolean {
  return ["y", "yes", "true", "1", "x", "paid"].includes(str(v).toLowerCase());
}

/** Money is handled in integer cents to avoid float drift. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${dollars}.${(abs % 100).toString().padStart(2, "0")}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
