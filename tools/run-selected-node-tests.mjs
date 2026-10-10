// Exact-path focused gate. Missing paths must never silently reduce coverage.
import { statSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

export function selectedTestFiles(paths) {
  if (!paths.length) throw new Error("EmptyTestSelection");
  const seen = new Set();
  return paths.map(path => {
    if (!path.endsWith(".test.mjs")) throw new Error(`InvalidTestPath: ${path}`);
    let actual;
    try { if (!statSync(path).isFile()) throw new Error("NotAFile"); actual = realpathSync(path); }
    catch { throw new Error(`MissingTestFile: ${path}`); }
    if (seen.has(actual)) throw new Error(`DuplicateTestFile: ${path}`);
    seen.add(actual);
    return actual;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = selectedTestFiles(process.argv.slice(2));
  console.log(JSON.stringify({ kind: "test-selection", files, scope: "exact test files; not a dependency/source snapshot" }));
  const child = spawn(process.execPath, ["--test", "--test-reporter=spec", "--test-concurrency=2", ...files], { stdio: "inherit" });
  child.on("error", error => { console.error(error); process.exitCode = 1; });
  child.on("close", (code, signal) => {
    console.log(JSON.stringify({ kind: "test-complete", code, signal, files: files.length }));
    process.exitCode = code === 0 && signal === null ? 0 : 1;
  });
}
