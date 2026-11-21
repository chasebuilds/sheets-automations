export type Grid = unknown[][];

export interface Rec {
  /** 1-based sheet row number. */
  row: number;
  /** Values keyed by lower-cased, trimmed header. */
  v: Record<string, unknown>;
}

export interface Table {
  headers: string[];
  records: Rec[];
}

export function normHeader(h: unknown): string {
  const s = typeof h === "string" ? h : typeof h === "number" ? String(h) : "";
  return s.trim().toLowerCase();
}

/** Turns a sheet grid (header row first) into records. Throws a readable error on missing columns. */
export function toTable(grid: Grid, required: string[], sheetName = "sheet"): Table {
  const head = grid[0] ?? [];
  const headers = head.map(normHeader);
  const missing = required.filter((r) => !headers.includes(r.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`Sheet "${sheetName}" is missing column(s): ${missing.join(", ")}`);
  }
  const records: Rec[] = [];
  grid.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c === "" || c === null || c === undefined)) return;
    const v: Record<string, unknown> = {};
    headers.forEach((h, c) => {
      if (h !== "") v[h] = cells[c];
    });
    records.push({ row: i + 2, v });
  });
  return { headers, records };
}

/** 1-based column index for a header, or throws. */
export function colIndex(headers: string[], name: string): number {
  const i = headers.indexOf(name.toLowerCase());
  if (i < 0) throw new Error(`Missing column: ${name}`);
  return i + 1;
}
