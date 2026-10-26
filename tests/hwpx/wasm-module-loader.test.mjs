import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewWasmModuleLoader } from '../../web/preview/wasm-module-loader.mjs';

test('parallel and later document loads share one fetched compiled module', async () => {
  let fetches = 0,
    compilations = 0;
  const module = {};
  const load = createPreviewWasmModuleLoader({
    url: '/candidate.wasm',
    fetchImpl: async (url, options) => {
      fetches++;
      assert.equal(url, '/candidate.wasm');
      assert.equal(options.cache, 'no-cache');
      return new Response(new Uint8Array([1]));
    },
    compile: async (bytes) => {
      compilations++;
      assert.equal(bytes.byteLength, 1);
      return module;
    },
  });
  const first = load();
  assert.equal(load(), first);
  assert.deepEqual(await Promise.all([first, load()]), [module, module]);
  assert.equal(await load(), module);
  assert.equal(fetches, 1);
  assert.equal(compilations, 1);
});

test('HTTP and compilation failures clear the pending module and can retry', async () => {
  for (const phase of ['http', 'compile']) {
    let attempts = 0;
    const load = createPreviewWasmModuleLoader({
      fetchImpl: async () => {
        attempts++;
        return new Response(new Uint8Array([1]), {
          status: phase === 'http' && attempts === 1 ? 503 : 200,
        });
      },
      compile: async () => {
        if (phase === 'compile' && attempts === 1) throw Error('CompileFailed');
        return 'ready';
      },
    });
    await assert.rejects(load(), phase === 'http' ? /WASM HTTP 503/ : /CompileFailed/);
    assert.equal(await load(), 'ready');
    assert.equal(attempts, 2);
  }
});

test('stalled headers or body time out, abort transport, and permit a fresh retry', async () => {
  for (const phase of ['headers', 'body']) {
    let expire,
      signal,
      finish,
      attempts = 0,
      compilations = 0,
      clears = 0;
    const stalled = new Promise((resolve) => {
      finish = resolve;
    });
    const load = createPreviewWasmModuleLoader({
      setTimer(callback) {
        expire = callback;
        return 17;
      },
      clearTimer(timer) {
        assert.equal(timer, 17);
        clears++;
      },
      fetchImpl: async (_, options) => {
        signal = options.signal;
        if (++attempts > 1) return new Response(new Uint8Array([1]));
        return phase === 'headers' ? stalled : { ok: true, arrayBuffer: () => stalled };
      },
      compile: async () => {
        compilations++;
        return 'ready';
      },
    });
    const first = load();
    assert.equal(load(), first);
    const rejected = assert.rejects(first, /실행 엔진 다운로드 시간이 초과/);
    await Promise.resolve();
    expire();
    await rejected;
    assert.equal(signal.aborted, true);
    assert.equal(clears, 1);
    assert.equal(await load(), 'ready');
    finish(phase === 'headers' ? new Response(new Uint8Array([2])) : new ArrayBuffer(1));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(compilations, 1);
    assert.equal(clears, 2);
    assert.equal(await load(), 'ready');
    assert.equal(attempts, 2);
  }
});

test('download deadline is cleared before slow compilation and invalid limits fail early', async () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, 1.5]) {
    assert.throws(() => createPreviewWasmModuleLoader({ timeoutMs }), /InvalidWasmDownloadTimeout/);
  }
  let cleared = false,
    finish;
  const load = createPreviewWasmModuleLoader({
    fetchImpl: async () => new Response(new Uint8Array([1])),
    setTimer: () => 1,
    clearTimer: () => {
      cleared = true;
    },
    compile: () => {
      assert.equal(cleared, true);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const result = load();
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(load(), result);
  finish('compiled');
  assert.equal(await result, 'compiled');
});
