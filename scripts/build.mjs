// Bundles src/gas/main.ts into dist/Code.js for Apps Script and writes the manifest.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const entry = "src/gas/main.ts";
const names = [...readFileSync(entry, "utf8").matchAll(/^export function (\w+)/gm)].map((m) => m[1]);

mkdirSync("dist", { recursive: true });
const out = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "SheetsAutomations",
  target: "es2020",
  legalComments: "none",
});
const bundle = out.outputFiles[0].text;
// Apps Script menus, triggers and the editor's Run list only see top-level functions.
const stubs = names.map((n) => `function ${n}() { return SheetsAutomations.${n}(); }`).join("\n");
writeFileSync("dist/Code.js", `${bundle}\n${stubs}\n`);

const manifest = {
  timeZone: "Etc/UTC",
  dependencies: {},
  exceptionLogging: "STACKDRIVER",
  runtimeVersion: "V8",
};
writeFileSync("dist/appsscript.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built dist/Code.js with ${names.length} entry points: ${names.join(", ")}`);
