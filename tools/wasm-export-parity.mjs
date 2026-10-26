// Name/kind compatibility only. Function signatures, packets and behavior need
// their own API/editor tests; passing this check is not a promotion verdict.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export function compareWasmExports(baseline, candidate) {
  const exportsOf = (value) =>
    WebAssembly.Module.exports(
      value instanceof WebAssembly.Module ? value : new WebAssembly.Module(value),
    );
  const before = exportsOf(baseline),
    after = exportsOf(candidate);
  const old = new Map(before.map((row) => [row.name, row.kind]));
  const next = new Map(after.map((row) => [row.name, row.kind]));
  const sort = (rows) => rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const missing = sort(before.filter((row) => !next.has(row.name)));
  const changedKind = sort(
    before
      .filter((row) => next.has(row.name) && next.get(row.name) !== row.kind)
      .map((row) => ({ name: row.name, expected: row.kind, actual: next.get(row.name) })),
  );
  const added = sort(after.filter((row) => !old.has(row.name)));
  return {
    compatible: missing.length === 0 && changedKind.length === 0,
    baselineExports: before.length,
    candidateExports: after.length,
    missing,
    changedKind,
    added,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args.some((value) => !value))
      throw new Error("Usage: node tools/wasm-export-parity.mjs BASELINE.wasm CANDIDATE.wasm");
    const baseline = readFileSync(args[0]),
      candidate = readFileSync(args[1]);
    const result = compareWasmExports(baseline, candidate);
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    console.log(
      JSON.stringify(
        { ...result, baselineSha256: hash(baseline), candidateSha256: hash(candidate) },
        null,
        2,
      ),
    );
    process.exitCode = result.compatible ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "WasmExportComparisonFailed");
    process.exitCode = 2;
  }
}
