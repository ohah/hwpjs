import assert from 'node:assert/strict';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, parse } from 'node:path';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { createWasmModuleLoader } from '../../../packages/core/src/wasm-module-loader.ts';
function guard(p) {
  assert(typeof p === 'string' && isAbsolute(p), 'ExplicitAbsoluteInputRequired');
  assert(
    !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/i.test(p) &&
      !p.split('/').includes('..'),
    'ProtectedBeforeAccess',
  );
  return p;
}
function load(name, sha) {
  const p = guard(process.env[name]);
  let part = parse(p).root;
  for (const item of p.slice(part.length).split('/')) {
    part = guard(join(part, item));
    assert(!lstatSync(part).isSymbolicLink(), 'InputSymlinkForbidden');
  }
  assert.equal(guard(realpathSync(p)), p);
  const b = readFileSync(p);
  assert.equal(createHash('sha256').update(b).digest('hex'), sha, name);
  return b;
}
export const wasm = load(
  'HWPJS_TEST_WASM',
  'd849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb',
);
export const bytes = new Uint8Array(
  load('HWPJS_TEST_NOORI', 'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f'),
);
export const module = await createWasmModuleLoader({ fetch: async () => new Response(wasm) })();
export function channel() {
  const w = new Worker(new URL('./cow-worker-bootstrap.mjs', import.meta.url));
  let seq = 0,
    brand,
    counts = {},
    closed = false;
  const pending = new Map();
  function rejectAll(error) {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  }
  w.on('message', (v) => {
    if (v.probe === 'module-brand') {
      brand = v.registered;
      return;
    }
    const p = pending.get(v.id);
    if (!p) return;
    if (v.probe === 'native-counts') {
      counts = v.calls;
      pending.delete(v.id);
      clearTimeout(p.timer);
      if (!p.raw) p.reject(Error('MissingWorkerReply'));
      else if (p.raw.transportError) p.reject(Error(p.raw.transportError));
      else p.resolve(p.raw.reply);
    } else p.raw = v;
  });
  w.on('error', rejectAll);
  w.on('exit', (code) => rejectAll(Error('WorkerExit:' + code)));
  return {
    get brand() {
      return brand;
    },
    get counts() {
      return counts;
    },
    send(message, viewProjection) {
      assert(!closed);
      return new Promise((resolve, reject) => {
        const id = ++seq,
          timer = setTimeout(() => {
            pending.delete(id);
            reject(Error('WorkerRequestTimeout'));
          }, 10000);
        pending.set(id, { resolve, reject, timer });
        w.postMessage({ id, message, ...(viewProjection ? { viewProjection } : {}) });
      });
    },
    async close() {
      closed = true;
      rejectAll(Error('WorkerClosed'));
      await w.terminate();
    },
  };
}
