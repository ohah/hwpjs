// Link only: do not evaluate DOM, Worker, WASM or any imported module body.
import { readFileSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceTextModule } from "node:vm";

const root = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const entries = process.argv.length > 3 ? process.argv.slice(3) : [
  "web/preview/bootstrap.mjs",
  "web/preview/app.mjs", "web/preview/reader-worker.mjs",
  "js/hwp5-editor.mjs", "js/hwpx-editor.mjs",
];
const modules = new Map();
function moduleFor(path) {
  const file = resolve(root, path);
  if (!file.startsWith(root + sep) || !file.endsWith(".mjs")) throw new Error("InvalidModulePath");
  if (!modules.has(file)) modules.set(file, new SourceTextModule(readFileSync(file, "utf8"), { identifier: file }));
  return modules.get(file);
}
for (const entry of entries) {
  const module = moduleFor(entry);
  if (module.status === "unlinked") await module.link((specifier, parent) => {
    if (!specifier.startsWith(".")) throw new Error("UnexpectedExternalImport");
    return moduleFor(resolve(dirname(parent.identifier), specifier));
  });
}
console.log(JSON.stringify({ entries, linkedModules: modules.size, evaluatedModules: 0, scope: "static import/export linking only; not dynamic imports, browser, parser or editor proof" }));
