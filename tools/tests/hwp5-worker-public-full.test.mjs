import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as Thread } from 'node:worker_threads';
import {
  createWorkerEditorRuntime,
  workerNativeGeometryAuthority,
  consumeWorkerNativeGeometryOrigin,
} from '../../packages/core/src/worker-runtime.ts';
import { readKnownNativeModule } from '../../packages/core/src/wasm-module-loader.ts';
import {
  requestAtRuntimeAdmission,
  hasRuntimeAdmission,
} from '../../packages/core/src/internal/runtime-admission.ts';
import { module, wasm, bytes } from './helpers/cow-worker-fixtures.mjs';
for (const mode of ['custom-factory', 'custom-url', 'unknown-default', 'unknown-module'])
  test(`실Worker main ${mode}: public full/private projection거부`, async () => {
    const priorWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker'),
      fetch = globalThis.fetch,
      threads = [],
      sent = [];
    class Adapter {
      constructor() {
        this.listeners = new Map();
        const w = (this.thread = new Thread(
          new URL('./helpers/cow-worker-bootstrap.mjs', import.meta.url),
        ));
        threads.push(w);
        w.on('message', (data) => {
          if (data.probe) return;
          for (const f of this.listeners.get('message') ?? []) f({ data });
        });
        w.on('error', (e) => {
          for (const f of this.listeners.get('error') ?? []) f(e);
        });
      }
      postMessage(v) {
        sent.push(v);
        this.thread.postMessage(v);
      }
      terminate() {
        return this.thread.terminate();
      }
      addEventListener(k, f) {
        if (!this.listeners.has(k)) this.listeners.set(k, new Set());
        this.listeners.get(k).add(f);
      }
      removeEventListener(k, f) {
        this.listeners.get(k)?.delete(f);
      }
    }
    Object.defineProperty(globalThis, 'Worker', {
      value: Adapter,
      configurable: true,
      writable: true,
    });
    globalThis.fetch = async () => new Response('unknown worker code');
    const m = mode === 'unknown-module' ? await WebAssembly.compile(wasm) : module;
    assert.equal(!!readKnownNativeModule(m), mode !== 'unknown-module');
    const opts = {
      wasmModule: m,
      ...(mode === 'custom-factory'
        ? { workerFactory: () => new Adapter() }
        : mode === 'custom-url'
          ? { workerURL: 'file:///custom-worker.js' }
          : {}),
    };
    const runtime = createWorkerEditorRuntime(opts);
    let n = 0;
    const ctx = () => ({
      editorId: 'worker-negative',
      documentId: 'doc',
      generation: 1,
      requestId: ++n,
      operationRevision: n,
    });
    try {
      await runtime.request({ kind: 'load', format: 'hwp5', bytes }, ctx());
      await runtime.request({ kind: 'enable' }, ctx());
      const context = ctx();
      const r = await runtime.request(
        {
          kind: 'splice',
          section: 0,
          paragraph: 15,
          startUnit: 0,
          endUnit: 0,
          text: 'x',
          viewProjection: 'owner-window-v1',
        },
        context,
      );
      assert.equal(r.content.format, 'hwp5');
      assert.equal(r.content.viewKind, undefined);
      assert.equal(workerNativeGeometryAuthority(runtime), false);
      assert.equal(consumeWorkerNativeGeometryOrigin(runtime, r, context), undefined);
      assert.equal(hasRuntimeAdmission(runtime), false);
      const before = sent.length;
      assert.throws(
        () =>
          requestAtRuntimeAdmission(
            runtime,
            { kind: 'splice', section: 0, paragraph: 15, startUnit: 0, endUnit: 0, text: 'never' },
            ctx(),
            () => {},
            true,
          ),
        /UnsupportedAtomicRuntime/,
      );
      assert.equal(sent.length, before);
      assert(sent.every((e) => !Object.hasOwn(e, 'viewProjection')));
      const full = await runtime.request({ kind: 'refresh' }, ctx());
      assert.deepEqual(full.content, r.content);
    } finally {
      await runtime.dispose();
      await Promise.all(threads.map((w) => w.terminate()));
      globalThis.fetch = fetch;
      if (priorWorker) Object.defineProperty(globalThis, 'Worker', priorWorker);
      else delete globalThis.Worker;
    }
  });
