import { isValidEmail, str, toDate } from "./values";
import type { Rec } from "./table";

export interface CleanedRecord {
  received: Date | null;
  name: string;
  email: string;
  phone: string;
  message: string;
  sourceRow: number;
}

export interface Issue {
  row: number;
  reason: string;
}

export interface CleanResult {
  added: CleanedRecord[];
  duplicates: Issue[];
  rejected: Issue[];
}

export function cleanName(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s === "") return "";
  // Fix names typed in one case ("JANE o'neil"). Leave any name with a properly cased word alone
  // ("Ian McDonald", "de la Cruz").
  const uniform = s.split(" ").every((w) => w === w.toLowerCase() || w === w.toUpperCase());
  if (!uniform) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function cleanEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** US numbers become (555) 123-4567. Anything else is kept as typed, trimmed. */
export function cleanPhone(raw: string): string {
  const s = raw.trim();
  if (s === "") return "";
  let digits = s.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return s;
}

/** Email is the identity. Phone digits are the fallback when there is no email. */
export function dedupeKey(email: string, phone: string): string {
  if (email !== "") return `e:${email}`;
  const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits === "" ? "" : `p:${digits}`;
}

export function cleanResponses(rows: Rec[], existingKeys: Iterable<string>): CleanResult {
  const seen = new Set(existingKeys);
  const result: CleanResult = { added: [], duplicates: [], rejected: [] };

  for (const r of rows) {
    const email = cleanEmail(str(r.v["email"]));
    const phone = cleanPhone(str(r.v["phone"]));
    const name = cleanName(str(r.v["name"]));

    if (email !== "" && !isValidEmail(email)) {
      result.rejected.push({ row: r.row, reason: `Invalid email: ${email}` });
      continue;
    }
    const key = dedupeKey(email, phone);
    if (key === "") {
      result.rejected.push({ row: r.row, reason: "No email or phone" });
      continue;
    }
    if (seen.has(key)) {
      result.duplicates.push({ row: r.row, reason: `Already in master (${key.slice(2)})` });
      continue;
    }
    seen.add(key);
    result.added.push({
      received: toDate(r.v["timestamp"]),
      name,
      email,
      phone,
      message: str(r.v["message"]).replace(/\s+/g, " "),
      sourceRow: r.row,
    });
  }
  return result;
}
