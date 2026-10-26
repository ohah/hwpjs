// One document per process; no corpus-wide retained WASM instances.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createHwpxEditor } from '../js/hwpx-editor.mjs';

const [path, beforePath, afterPath] = process.argv.slice(2);
assert(path && beforePath && afterPath && process.argv.length === 5, 'InvalidQueryWorkerArguments');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const send = (value) =>
  new Promise((resolve, reject) =>
    process.send(value, (error) => (error ? reject(error) : resolve())),
  );
function failure(error) {
  if (
    error instanceof WebAssembly.RuntimeError ||
    error.message === 'OutOfMemory' ||
    error.message.includes('AbiUnavailable')
  )
    throw error;
  return { error: error.message };
}
const input = readFileSync(path),
  inputSha256 = digest(input),
  results = [],
  artifacts = [];
for (const [artifact, artifactPath] of [
  ['before', beforePath],
  ['after', afterPath],
]) {
  await send({ kind: 'progress', path, artifact, phase: 'compile' });
  const bytes = readFileSync(artifactPath);
  artifacts.push(digest(bytes));
  let editor = await createHwpxEditor(bytes);
  try {
    await send({ kind: 'progress', path, artifact, phase: 'open' });
    let opened;
    try {
      opened = editor.open(input);
    } catch (error) {
      results.push({ open: failure(error), queries: [], save: null });
      continue;
    }
    const queries = [];
    for (let section = 0; section < opened.sectionCount; section++) {
      for (const method of ['paragraphTextSnapshot', 'formulaCurrent']) {
        await send({ kind: 'progress', path, artifact, phase: method, section });
        let response;
        try {
          response = { hash: digest(JSON.stringify(editor[method](section))) };
        } catch (error) {
          response = failure(error);
        }
        queries.push({ section, method, ...response });
      }
    }
    await send({ kind: 'progress', path, artifact, phase: 'save' });
    let save;
    try {
      const saved = Buffer.from(editor.save());
      save = { hash: digest(saved), bytes: saved.length, sourceExact: saved.equals(input) };
    } catch (error) {
      save = failure(error);
    }
    await send({ kind: 'progress', path, artifact, phase: 'compare', save });
    results.push({ open: opened, queries, save });
  } finally {
    editor.close();
    editor = null;
    assert.equal(digest(bytes), artifacts.at(-1), 'QueryParityArtifactBufferChanged');
    assert.equal(digest(input), inputSha256, 'QueryParityInputBufferChanged');
    global.gc?.();
  }
  assert.equal(digest(input), inputSha256, 'QueryParityInputBufferChanged');
}
assert.deepEqual(results[1], results[0], `EditorQueryParityMismatch:${path}`);
assert.equal(digest(input), inputSha256, 'QueryParityInputBufferChanged');
assert.equal(digest(readFileSync(path)), inputSha256, 'QueryParityDiskInputChanged');
await send({ kind: 'result', value: { path, inputSha256, artifacts, ...results[0] } });
process.disconnect();
