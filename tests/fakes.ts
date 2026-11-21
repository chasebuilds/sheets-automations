import type { DocsLike, Env, MailLike, MailOptions, PropsLike, RangeLike, SheetLike, SpreadsheetLike } from "../src/services/ports";

/** In-memory stand-in for a Sheet. Row 1 is the header row. */
export class FakeSheet implements SheetLike {
  constructor(
    private readonly name: string,
    public data: unknown[][] = [],
  ) {}

  getName(): string {
    return this.name;
  }
  getLastRow(): number {
    return this.data.length;
  }
  getLastColumn(): number {
    return this.data.reduce((m, r) => Math.max(m, r.length), 0);
  }
  getRange(row: number, col: number, numRows: number, numCols: number): RangeLike {
    const data = this.data;
    return {
      getValues() {
        const out: unknown[][] = [];
        for (let r = 0; r < numRows; r++) {
          const line: unknown[] = [];
          for (let c = 0; c < numCols; c++) line.push(data[row - 1 + r]?.[col - 1 + c] ?? "");
          out.push(line);
        }
        return out;
      },
      setValues(values: unknown[][]) {
        values.forEach((vals, r) => {
          const target = (data[row - 1 + r] ??= []);
          vals.forEach((v, c) => {
            target[col - 1 + c] = v;
          });
        });
      },
    };
  }
}

export class FakeSpreadsheet implements SpreadsheetLike {
  sheets = new Map<string, FakeSheet>();

  add(name: string, data: unknown[][]): FakeSheet {
    const s = new FakeSheet(name, data);
    this.sheets.set(name, s);
    return s;
  }
  getSheetByName(name: string): SheetLike | null {
    return this.sheets.get(name) ?? null;
  }
  insertSheet(name: string): SheetLike {
    return this.add(name, []);
  }
  get(name: string): FakeSheet {
    const s = this.sheets.get(name);
    if (!s) throw new Error(`no sheet ${name}`);
    return s;
  }
}

export interface SentMail {
  to: string;
  subject: string;
  body: string;
  options?: MailOptions;
}

export class FakeMail implements MailLike {
  sent: SentMail[] = [];
  failFor = new Set<string>();

  sendEmail(to: string, subject: string, body: string, options?: MailOptions): void {
    if (this.failFor.has(to)) throw new Error("Service invoked too many times");
    this.sent.push({ to, subject, body, options });
  }
}

export class FakeProps implements PropsLike {
  store = new Map<string, string>();
  get(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.store.set(key, value);
  }
}

export class FakeDocs implements DocsLike {
  created: { templateId: string; name: string; replacements: Record<string, string> }[] = [];
  createFromTemplate(templateId: string, name: string, replacements: Record<string, string>): string {
    this.created.push({ templateId, name, replacements });
    return `doc-${this.created.length}`;
  }
  exportPdf(docId: string, fileName: string): { id: string; url: string } {
    return { id: `pdf-of-${docId}`, url: `https://drive.example/${fileName}` };
  }
}

export function makeEnv(now: string) {
  const ss = new FakeSpreadsheet();
  const mail = new FakeMail();
  const props = new FakeProps();
  const docs = new FakeDocs();
  const logs: string[] = [];
  const env: Env = {
    sheets: ss,
    mail,
    props,
    docs,
    now: () => new Date(now),
    log: (m) => logs.push(m),
  };
  return { env, ss, mail, props, docs, logs };
}
