// Builds the static demo into _site/: the page, the bundled logic (app.js) and the sample CSVs.
import { build } from "esbuild";
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

rmSync("_site", { recursive: true, force: true });
mkdirSync("_site/samples", { recursive: true });
await build({
  entryPoints: ["demo/src/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: "_site/app.js",
  legalComments: "none",
  logLevel: "error",
});
cpSync("demo/index.html", "_site/index.html");
for (const f of readdirSync("samples").filter((n) => n.endsWith(".csv"))) cpSync(`samples/${f}`, `_site/samples/${f}`);
writeFileSync("_site/.nojekyll", "");
console.log("built _site");
