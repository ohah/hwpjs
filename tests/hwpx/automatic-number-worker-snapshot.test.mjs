import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';

test('Worker queries automatic number sites once per refresh and never across history', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const instantiate = WebAssembly.instantiate;
  let calls = 0;
  WebAssembly.instantiate = async (...args) => {
    const instance = await instantiate(...args);
    assert(args[0] instanceof WebAssembly.Module);
    const exports = { ...instance.exports };
    if (exports.hwpx_edit_automatic_number_sites) {
      const read = exports.hwpx_edit_automatic_number_sites;
      exports.hwpx_edit_automatic_number_sites = (...values) => {
        calls++;
        return read(...values);
      };
    }
    return { exports };
  };
  t.after(() => {
    WebAssembly.instantiate = instantiate;
  });
  const h = await workerCanvasHarness(t);
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx');
  const load = await h.send({ kind: 'load', format: 'hwpx', bytes: input });
  assert.equal(load.error, undefined);
  assert.equal(calls, 1);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  assert.equal(calls, 2);
  const paragraph = load.content.paragraphs.find(
    (row) => row.plainEditable && row.automaticNumberPrefixes?.length,
  );
  assert(paragraph);
  assert.equal(
    (
      await h.send({
        kind: 'splice',
        section: paragraph.section,
        paragraph: paragraph.paragraph,
        startUnit: 0,
        endUnit: 0,
        text: '새',
      })
    ).error,
    undefined,
  );
  assert.equal(calls, 3);
  const saved = Buffer.from((await h.send({ kind: 'save' })).bytes);
  assert.equal((await h.send({ kind: 'undo' })).error, undefined);
  assert.equal(calls, 4);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
  assert.equal((await h.send({ kind: 'redo' })).error, undefined);
  assert.equal(calls, 5);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), saved);
});
