/** Independent XML corpus comparison. Open failures remain separate from matches. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createHwpxEditor } from '../js/hwpx-editor.mjs';
const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = /^--(wasm|root|baseline-wasm)=(.+)$/.exec(arg);
  if (!match || args.has(match[1]))
    throw Error('Expected unique --wasm=PATH --root=PATH [--baseline-wasm=PATH]');
  args.set(match[1], match[2]);
}
if (!args.has('wasm') || !args.has('root')) throw Error('Required --wasm=PATH --root=PATH');
const binary = readFileSync(args.get('wasm')),
  module = await WebAssembly.compile(binary);
const baseline = args.has('baseline-wasm')
  ? await WebAssembly.compile(readFileSync(args.get('baseline-wasm')))
  : null;
const source = JSON.parse(
  execFileSync(
    'python3',
    ['tests/hwpx/font-face-metadata-oracle.py', '--corpus', args.get('root')],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  ),
);
const files = [];
for (const input of source) {
  const row = { path: input.path };
  let editor;
  try {
    if (input.error) {
      row.state = 'oracle-error';
      row.error = input.error;
      continue;
    }
    const bytes = readFileSync(input.path);
    row.hasSubstitute = input.fonts.some((font) => font.substitute !== null);
    editor = await createHwpxEditor(module);
    let openError = null;
    try {
      editor.open(bytes);
    } catch (error) {
      openError = error.message;
    }
    if (baseline) {
      const previous = await createHwpxEditor(baseline);
      let previousError = null;
      try {
        previous.open(bytes);
      } catch (error) {
        previousError = error.message;
      } finally {
        previous.close();
      }
      row.baselineMatches = previousError === openError;
      if (!row.baselineMatches) row.baselineError = previousError;
    }
    if (openError !== null) {
      row.state = 'open-error';
      row.error = openError;
      continue;
    }
    assert.deepEqual(editor.fontFaceMetadata(), input.fonts);
    assert.deepEqual(Buffer.from(editor.save()), bytes);
    row.state = 'verified';
    row.resources = input.fonts.length;
  } catch (error) {
    row.state = 'verification-error';
    row.error = error.message.slice(0, 2000);
  } finally {
    editor?.close();
    files.push(row);
    globalThis.gc?.();
  }
}
const states = {};
for (const file of files) states[file.state] = (states[file.state] ?? 0) + 1;
const verified = files.filter((file) => file.state === 'verified');
const baselineDifferences = files.filter((file) => file.baselineMatches === false).length;
console.log(
  JSON.stringify({
    wasmSha256: createHash('sha256').update(binary).digest('hex'),
    counts: {
      paths: files.length,
      states,
      coverageComplete: verified.length === files.length,
      verifiedResources: verified.reduce((sum, row) => sum + row.resources, 0),
      substituteVerified: verified.filter((row) => row.hasSubstitute).length,
      baselineDifferences,
    },
    files,
  }),
);
if (states['verification-error'] || baselineDifferences) process.exitCode = 1;
