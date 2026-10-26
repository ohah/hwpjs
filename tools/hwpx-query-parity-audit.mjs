// One bounded child per document. Matching errors are not support claims.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { referenceDocumentFiles } from "./reference-hwpx-files.mjs";
import { referenceReaderScope } from "./reference-reader-scope.mjs";
import { guardedNodeWorker } from "./guarded-node-worker.mjs";

const options = {};
for (const argument of process.argv.slice(2)) {
  const match = /^--(before-wasm|after-wasm|root|max-rss-mib|max-duration-ms)=(.+)$/.exec(argument);
  assert(match, "InvalidQueryParityArgument");
  assert(options[match[1]] === undefined, "DuplicateQueryParityArgument");
  options[match[1]] = match[2];
}
assert(options["before-wasm"] && options["after-wasm"], "MissingQueryParityArtifacts");
const limit = (name, fallback, maximum) => {
  const raw = options[name] ?? String(fallback);
  assert(/^[0-9]+$/.test(raw), "InvalidQueryParityLimit");
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value > 0 && value <= maximum, "InvalidQueryParityLimit");
  return value;
};
const maxRssMiB = limit("max-rss-mib", 1024, 32768),
  maxDurationMs = limit("max-duration-ms", 120000, 3600000);
const paths = referenceDocumentFiles(options.root ?? "reference/rhwp/samples");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const artifactPaths = [options["before-wasm"], options["after-wasm"]].map((path) => resolve(path));
const hashes = artifactPaths.map((path) => digest(readFileSync(path)));
const totals = {
  files: paths.length,
  hwpx: 0,
  matchedDocuments: 0,
  incompleteDocuments: 0,
  nonExactNoOpDocuments: 0,
  successfulQueries: 0,
  matchedQueryErrors: {},
  matchedOpenErrors: {},
  matchedSaveErrors: {},
  excludedFormats: {},
};
console.log(
  JSON.stringify({
    kind: "start",
    files: paths.length,
    artifacts: hashes,
    maxRssMiB,
    maxDurationMs,
  }),
);
for (const path of paths) {
  const input = readFileSync(path),
    inputSha256 = digest(input),
    scope = referenceReaderScope(input);
  if (scope.format !== "hwpx") {
    totals.excludedFormats[scope.format] = (totals.excludedFormats[scope.format] ?? 0) + 1;
    continue;
  }
  totals.hwpx++;
  const outcome = await guardedNodeWorker(
    new URL("./hwpx-query-parity-worker.mjs", import.meta.url),
    [path, ...artifactPaths],
    {
      maxRssBytes: maxRssMiB * 1024 * 1024,
      maxDurationMs,
      onProgress: (value) => console.log(JSON.stringify({ ...value, kind: "phase" })),
    },
  );
  assert.equal(digest(readFileSync(path)), inputSha256, `${path}: disk input changed`);
  if (!outcome.complete) {
    totals.incompleteDocuments++;
    console.log(JSON.stringify({ kind: "incomplete", path, inputSha256, ...outcome }));
    if (outcome.reason.startsWith("External")) throw new Error("QueryParityInterrupted");
    continue;
  }
  const value = outcome.value;
  assert.equal(value.path, path, "QueryWorkerPathMismatch");
  assert.equal(value.inputSha256, inputSha256, "QueryWorkerInputMismatch");
  assert.deepEqual(value.artifacts, hashes, "QueryWorkerArtifactsChanged");
  totals.matchedDocuments++;
  if (value.open.error)
    totals.matchedOpenErrors[value.open.error] =
      (totals.matchedOpenErrors[value.open.error] ?? 0) + 1;
  if (value.save?.error)
    totals.matchedSaveErrors[value.save.error] =
      (totals.matchedSaveErrors[value.save.error] ?? 0) + 1;
  else if (value.save && !value.save.sourceExact) totals.nonExactNoOpDocuments++;
  for (const query of value.queries) {
    if (query.error)
      totals.matchedQueryErrors[query.error] = (totals.matchedQueryErrors[query.error] ?? 0) + 1;
    else totals.successfulQueries++;
  }
  console.log(JSON.stringify({ kind: "file", ...value, peakRssBytes: outcome.peakRssBytes }));
}
assert(totals.hwpx > 0, "EmptyHwpxQueryParityScope");
assert.deepEqual(
  artifactPaths.map((path) => digest(readFileSync(path))),
  hashes,
  "QueryParityArtifactChanged",
);
console.log(
  JSON.stringify({
    kind: "summary",
    ...totals,
    artifacts: hashes,
    scope:
      "all section queries and no-op save parity; matching errors are not support; sampled RSS/time bounds, not hard OS limits; no editing/UI proof",
  }),
);
if (
  totals.incompleteDocuments !== 0 ||
  totals.nonExactNoOpDocuments !== 0 ||
  Object.keys(totals.matchedSaveErrors).length !== 0
)
  process.exitCode = 1;
