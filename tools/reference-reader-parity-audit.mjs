// Full reader response parity; no edits, fixture writes or layout assertions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { referenceDocumentFiles } from './reference-hwpx-files.mjs';
import { referenceReaderScope } from './reference-reader-scope.mjs';
import { createHwp5Reader } from '../js/hwp5.mjs';
import { createHwpxReader } from '../js/hwpx.mjs';
import { readerParityResult } from './reference-reader-parity-result.mjs';
import { writeAuditRow } from './audit-jsonl-output.mjs';

const options = {};
for (const argument of process.argv.slice(2)) {
  const match = /^--(before-wasm|after-wasm|root)=(.+)$/.exec(argument);
  if (!match) throw new Error(`UnknownParityArgument:${argument}`);
  if (options[match[1]] !== undefined) throw new Error('DuplicateParityArgument');
  options[match[1]] = match[2];
}
if (!options['before-wasm'] || !options['after-wasm']) throw new Error('MissingParityArtifacts');
const root = options.root ?? 'reference/rhwp/samples',
  paths = referenceDocumentFiles(root);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const artifacts = [options['before-wasm'], options['after-wasm']].map((path) => readFileSync(path));
const hashes = artifacts.map(digest);
const readers = await Promise.all(
  artifacts.map(async (bytes) => {
    const module = await WebAssembly.compile(bytes);
    return { hwp5: await createHwp5Reader(module), hwpx: await createHwpxReader(module) };
  }),
);
const counts = {};
try {
  writeAuditRow({ kind: 'start', root, files: paths.length, artifacts: hashes });
  for (const path of paths) {
    const input = readFileSync(path),
      inputSha256 = digest(input),
      selected = referenceReaderScope(input);
    let status = 'excluded_format',
      responseSha256 = null,
      error = null;
    if (selected.inScope) {
      const responses = readers.map((reader) => {
        try {
          const value =
            selected.format === 'hwp5'
              ? reader.hwp5.readText(input)
              : reader.hwpx.readTextEvents(input);
          return { hash: digest(JSON.stringify(value)), error: null };
        } catch (failure) {
          return { hash: null, error: failure.message };
        } finally {
          assert.equal(digest(input), inputSha256, 'ParityReaderMutatedInput');
        }
      });
      ({ status, responseSha256, error } = readerParityResult(responses[0], responses[1], path));
    }
    counts[status] = (counts[status] ?? 0) + 1;
    writeAuditRow({
      kind: 'file',
      path,
      format: selected.format,
      inputSha256,
      status,
      responseSha256,
      error,
    });
  }
  assert.deepEqual(
    [options['before-wasm'], options['after-wasm']].map((path) => digest(readFileSync(path))),
    hashes,
    'ParityArtifactChanged',
  );
  writeAuditRow({
    kind: 'summary',
    root,
    files: paths.length,
    artifacts: hashes,
    counts,
    scope:
      'full reader JSON and input parity; matching refusals are not support; no editing or browser proof',
  });
} finally {
  for (const reader of readers) {
    reader.hwp5.close();
    reader.hwpx.close();
  }
}
