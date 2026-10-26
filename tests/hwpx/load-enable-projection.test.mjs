import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { createReaderRuntime } = await import(
  process.env.HWPJS_PROJECTION_RUNTIME_URL ??
    new URL('../../web/preview/reader-runtime.mjs', import.meta.url).href
);
const wasmPath = process.env.HWPJS_TEST_WASM;
const module = wasmPath ? await WebAssembly.compile(readFileSync(wasmPath)) : undefined;
const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx');

async function witnessed(run) {
  const original = WebAssembly.instantiate,
    counts = new Map(),
    runtimes = [];
  // Observe real Native calls; preserve every export, memory, argument and result.
  // No clipboard, source model, Native response or permission is substituted.
  WebAssembly.instantiate = async (...args) => {
    const result = await Reflect.apply(original, WebAssembly, args);
    if (args[0] !== module) return result;
    const native = result.exports,
      exports = {};
    for (const [name, value] of Object.entries(native))
      exports[name] =
        typeof value === 'function'
          ? function (...parameters) {
              counts.set(name, (counts.get(name) ?? 0) + 1);
              return Reflect.apply(value, native, parameters);
            }
          : value;
    assert.equal(exports.memory, native.memory);
    return { exports };
  };
  const runtime = () => {
    const value = createReaderRuntime({ wasmModule: module, allowReload: true });
    runtimes.push(value);
    return value;
  };
  const count = () => counts.get('hwpx_edit_paragraph_text_snapshot') ?? 0;
  try {
    await run({ runtime, count });
  } finally {
    try {
      for (const value of runtimes) await value.dispose();
    } finally {
      WebAssembly.instantiate = original;
    }
  }
}

test(
  'immediate HWPX enable reuses an owned projection and retains Native history metadata',
  { skip: !module },
  () =>
    witnessed(async ({ runtime, count }) => {
      const r = runtime(),
        loaded = await r.request({ kind: 'load', format: 'hwpx', bytes: input });
      assert(!loaded.error);
      const expected = structuredClone(loaded.content),
        before = count();
      assert(before > 0);
      loaded.content.paragraphs[0].text = 'caller mutation';
      loaded.content.paragraphs.length = 1;
      const enabled = await r.request({ kind: 'enable' });
      assert(!enabled.error);
      assert.equal(count(), before);
      assert.deepEqual(enabled.content, expected);
      assert.equal(enabled.historyAvailable, true);
      assert.equal(typeof enabled.historyRevision, 'number');
      assert(enabled.historyRevisions.includes(enabled.historyRevision));
      const again = count();
      assert(!(await r.request({ kind: 'enable' })).error);
      assert(count() > again, 'second enable must not retain the one-shot projection');
    }),
);

for (const mode of [
  'save',
  'query',
  'view',
  'unknown',
  'malformed',
  'failed-enable',
  'extra-enable-option',
])
  test(`intervening ${mode} invalidates HWPX projection reuse`, { skip: !module }, () =>
    witnessed(async ({ runtime, count }) => {
      const r = runtime();
      assert(!(await r.request({ kind: 'load', format: 'hwpx', bytes: input })).error);
      if (mode === 'save') await r.request({ kind: 'save' });
      if (mode === 'query') await r.request({ kind: 'query-current-text' });
      if (mode === 'view') await r.request({ kind: 'set-edit-window', offset: 0, count: 2 });
      if (mode === 'unknown') assert((await r.request({ kind: 'no-such-operation' })).error);
      if (mode === 'malformed') await assert.rejects(r.request(null));
      if (mode === 'failed-enable')
        assert((await r.request({ kind: 'enable', normalizeObservedCfb: true })).error);
      const before = count();
      const answer = await r.request({
        kind: 'enable',
        ...(mode === 'extra-enable-option' ? { unknownFuturePolicy: true } : {}),
      });
      assert(!answer.error);
      assert(count() > before, 'must recompute from Native after invalidation');
    }),
  );

test(
  'queued enable and a rejected request during load do not consume an in-flight projection',
  { skip: !module },
  () =>
    witnessed(async ({ runtime, count }) => {
      for (const invalid of [false, true]) {
        const r = runtime(),
          before = count(),
          load = r.request({ kind: 'load', format: 'hwpx', bytes: input });
        if (invalid) {
          await assert.rejects(r.request(null));
          assert(!(await load).error);
        }
        const enabled = r.request({ kind: 'enable' });
        assert(!(await load).error);
        assert(!(await enabled).error);
        assert(count() >= before + 2);
      }
    }),
);

test(
  'new/failed load and disposal cannot borrow another document or runtime projection',
  { skip: !module },
  () =>
    witnessed(async ({ runtime, count }) => {
      const r = runtime(),
        other = runtime();
      assert(!(await r.request({ kind: 'load', format: 'hwpx', bytes: input })).error);
      assert((await other.request({ kind: 'enable' })).error);
      const second = await r.request({ kind: 'load', format: 'hwpx', bytes: input });
      assert(!second.error);
      const expected = structuredClone(second.content),
        before = count();
      assert.deepEqual((await r.request({ kind: 'enable' })).content, expected);
      assert.equal(count(), before);
      assert((await r.request({ kind: 'load', format: 'hwpx', bytes: new Uint8Array([1]) })).error);
      assert((await r.request({ kind: 'enable' })).error);
      await r.dispose();
      await assert.rejects(r.request({ kind: 'enable' }));
    }),
);
