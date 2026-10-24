import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReaderRuntime,copyRuntimeMessage} from '../../../../web/preview/reader-runtime.mjs';
import {createReaderRuntimeFactory,createReaderEditorRuntime} from '../../src/runtime/reader-runtime.ts';
import {modulePromise,fixture,ok,hash} from './runtime-test-fixtures.ts';

for (const format of ['hwp5', 'hwpx']) test(`${format}: independent documents, FIFO, owned input, save/reopen and history`, async t => {
  const wasmModule = await modulePromise;
  const factory = createReaderRuntimeFactory({ wasmModule });
  const a = await factory(), b = await factory();
  t.after(async () => { await a.dispose(); await b.dispose(); });
  const bytes = fixture(format), original = new Uint8Array(bytes);
  const load = a.request({ kind: 'load', format, bytes });
  bytes.fill(0);
  const loaded = await load;
  assert.equal(loaded.error, undefined);
  await b.request({ kind: 'load', format, bytes: original });
  const enable = a.request({ kind: 'enable' });
  const p = (loaded.content as any).paragraphs.find((p: any) => p.editable);
  const message = { kind: 'splice', section: p.section, paragraph: p.paragraph, startUnit: 0, endUnit: 0, text: '격리😀' };
  const context = { editorId: 'A', documentId: 'document-A', generation: 1, requestId: 3, operationRevision: 1 };
  const edit = a.request(message, context);
  message.text = 'BAD'; context.documentId = 'BAD';
  const saved = a.request({ kind: 'save', allowStaleLayout: true });
  assert.equal((await enable).error, undefined);
  const edited = await edit;
  assert.equal(edited.error, undefined);
  assert.equal(edited.meta?.application, 'applied');
  assert.equal(edited.meta?.changed, true);
  assert.equal(edited.meta?.context?.documentId, 'document-A');
  assert((edited.content as any).paragraphs.some((p: any) => p.text.startsWith('격리😀')));
  const data = await saved;
  assert.equal(data.error, undefined);
  if (format === 'hwp5') await b.request({ kind: 'enable' });
  assert.deepEqual(Buffer.from((await b.request({ kind: 'save' })).bytes as Uint8Array), Buffer.from(original));
  const undo = await a.request({ kind: 'undo' });
  assert.equal(undo.changed, true);
  assert.deepEqual(Buffer.from((await a.request({ kind: 'save' })).bytes as Uint8Array), Buffer.from(original));
  assert.equal((await a.request({ kind: 'redo' })).changed, true);
  assert.deepEqual((await a.request({ kind: 'save', allowStaleLayout: true })).bytes, data.bytes);
  const reopened = await factory();
  try {
    const result = await reopened.request({ kind: 'load', format, bytes: data.bytes });
    assert.equal(result.error, undefined);
    assert((result.content as any).paragraphs.some((p: any) => p.text.startsWith('격리😀')));
  } finally { await reopened.dispose(); }
  await a.dispose();
  assert.equal((await b.request({ kind: 'save' })).error, undefined);
  await assert.rejects(a.request({ kind: 'save' }), /RuntimeDisposed/);
});

test('locked HWP5/HWPX candidates cannot mutate active runtime or share output consent', async t => {
  const wasmModule = await modulePromise;
  const active = createReaderRuntime({ wasmModule });
  const candidates = ['hwp5', 'hwpx'].map(() => createReaderRuntime({ wasmModule }));
  t.after(async () => { await active.dispose(); for (const r of candidates) await r.dispose(); });
  await ok(active, { kind: 'load', format: 'hwpx', bytes: fixture('hwpx') });
  const saved = await ok(active, { kind: 'save' });
  for (const [i, format] of ['hwp5', 'hwpx'].entries()) {
    const r = candidates[i];
    const locked = await r.request({ kind: 'load', format, bytes: readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/password-12345.${format === 'hwp5' ? 'hwp' : 'hwpx'}`) });
    assert.equal(locked.passwordRequired, true);
    const wrong = await r.request({ kind: 'unlock', password: 'wrong' });
    assert.equal(wrong.error, 'WrongPasswordOrCorruptPayload');
    assert.deepEqual((await ok(active, { kind: 'save' })).bytes, saved.bytes);
    const secret = new TextEncoder().encode('12345');
    const unlocked = await ok(r, { kind: 'unlock', password: secret });
    assert.equal(new TextDecoder().decode(secret), '12345', 'caller retains ownership of its bytes');
    assert.equal(unlocked.content.passwordProtectionRemoved, true);
    await ok(r, { kind: 'enable' });
    assert.equal((await r.request({ kind: 'save', allowStaleLayout: true })).error, 'PasswordProtectionRemovalNotAcknowledged');
    const plain = await ok(r, { kind: 'save', allowStaleLayout: true, allowUnprotectedOutput: true });
    assert.equal(plain.passwordProtectionRemoved, true);
    assert.equal((await ok(active, { kind: 'save' })).passwordProtectionRemoved, undefined);
    await r.dispose();
  }
  assert.deepEqual((await ok(active, { kind: 'save' })).bytes, saved.bytes);
});

test('dispose drains in-flight loader, rejects queued requests, releases once and fences late load', async () => {
  let start!: () => void, release!: (value: WebAssembly.Module) => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const gate = new Promise<WebAssembly.Module>(resolve => { release = resolve; });
  const r = createReaderRuntime({ loadWasmModule: () => { start(); return gate; } });
  const load = r.request({ kind: 'load', format: 'hwpx', bytes: fixture('hwpx') });
  await started;
  const queued = r.request({ kind: 'enable' });
  const rejection = assert.rejects(queued, /RuntimeDisposed/);
  const disposed = r.dispose();
  assert.equal(r.dispose(), disposed);
  await assert.rejects(r.request({ kind: 'save' }), /RuntimeDisposed/);
  release(await modulePromise);
  assert.equal((await load).error, undefined, 'running request settles with its actual result before resource release');
  await rejection; await disposed;
});

test('metadata failure settles exactly one minimal reply even after Native mutation; queue recovers', async t => {
  const r = createReaderRuntime({ wasmModule: await modulePromise });
  t.after(() => r.dispose());
  const loaded = await ok(r, { kind: 'load', format: 'hwpx', bytes: fixture('hwpx') });
  await ok(r, { kind: 'enable' });
  const p = loaded.content.paragraphs.find((p: any) => p.editable);
  const original = WebAssembly.Module.exports;
  let faults = 0;
  WebAssembly.Module.exports = function(module) {
    if (new Error().stack?.includes('at reply ')) { faults++; throw Error('InjectedMetadataFailure'); }
    return original(module);
  };
  try {
    const reply = await r.request({ kind: 'splice', section: p.section, paragraph: p.paragraph, startUnit: 0, endUnit: 0, text: '적용😀', requestId: 42 });
    assert.equal(reply.error, 'InjectedMetadataFailure');
    assert.equal(reply.applied, true);
    assert.equal(reply.requestId, 42);
    assert.equal(reply.content, undefined);
    assert.equal(faults, 1);
    assert.equal(r.outcome(reply).application, 'applied');
  } finally { WebAssembly.Module.exports = original; }
  const refreshed = await ok(r, { kind: 'refresh' });
  assert(refreshed.content.paragraphs.some((p: any) => p.text.startsWith('적용😀')));
  assert.equal((await ok(r, { kind: 'save' })).bytes.length > 0, true);
});

test('malformed/aliased inputs and failed request do not poison subsequent queue work', async t => {
  for (const payload of [{ kind: 'load', bytes: new SharedArrayBuffer(2) }, { kind: 'load', bytes: new Uint8Array(new SharedArrayBuffer(2)) }, { kind: 'load', options: () => {} }]) {
    assert.throws(() => copyRuntimeMessage(payload));
  }
  const cycle: any = { kind: 'load' }; cycle.self = cycle;
  assert.throws(() => copyRuntimeMessage(cycle), /CyclicRuntimePayload/);
  const r = createReaderRuntime(); t.after(() => r.dispose());
  assert.equal((await r.request({ kind: 'load', format: 'hwpx', bytes: fixture('hwpx') })).error, 'PreviewWasmModuleRequired');
  await assert.rejects(r.request({ kind: 'load', format: 'hwpx', bytes: fixture('hwpx') }), /RuntimeDocumentAlreadyLoaded/);
  assert.equal((await r.request({ kind: 'unknown' })).error, 'UnknownPreviewCommand');
  const explicit = createReaderRuntime(); t.after(() => explicit.dispose());
  assert.equal((await ok(explicit, { kind: 'load', wasmModule: await modulePromise, format: 'hwpx', bytes: fixture('hwpx') })).kind, 'load');
});

test('real reader/editor disposal is idempotent and decoder temporary secret is cleared before free', async () => {
  const wasmModule = await modulePromise;
  const instantiate = WebAssembly.instantiate;
  let editorCloses = 0, secretCleared = 0;
  const secrets: Uint8Array[] = [];
  WebAssembly.instantiate = (async (...args: any[]) => {
    const instance = await (instantiate as any)(...args);
    const original = instance.exports;
    const wrapped = { ...original,
      hwpx_edit_close() { editorCloses++; return original.hwpx_edit_close(); },
      cfb_free(ptr: number, size: number) {
        if (size === 5) {
          const bytes = new Uint8Array(original.memory.buffer, ptr >>> 0, size);
          if (bytes.every(value => value === 0)) secretCleared++;
        }
        return original.cfb_free(ptr, size);
      },
    };
    return { exports: wrapped };
  }) as typeof WebAssembly.instantiate;
  const clone = globalThis.structuredClone;
  globalThis.structuredClone = ((value: any) => {
    const owned = clone(value);
    if (owned?.password instanceof Uint8Array) secrets.push(owned.password);
    return owned;
  }) as typeof structuredClone;
  const r = createReaderRuntime({ wasmModule });
  try {
    const locked = await r.request({ kind: 'load', format: 'hwpx', bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx') });
    assert.equal(locked.passwordRequired, true);
    await ok(r, { kind: 'unlock', password: new TextEncoder().encode('12345') });
    assert.equal(secrets.length, 1);
    assert(secrets[0].every(value => value === 0), 'owned queued password was wiped even though execute deleted its field');
    assert(secretCleared > 0, 'real WASM secret allocation was zeroed before cfb_free');
    await r.dispose(); await r.dispose();
    assert.equal(editorCloses, 1);
  } finally {
    await r.dispose(); WebAssembly.instantiate = instantiate; globalThis.structuredClone = clone;
  }
});

test('Native-proven no-op stays unchanged and all queued errors settle without poisoning runtime', async t => {
  const r = createReaderEditorRuntime({ wasmModule: await modulePromise });
  t.after(() => r.dispose());
  const loaded = await r.request({ kind: 'load', format: 'hwpx', bytes: fixture('hwpx') });
  await r.request({ kind: 'enable' });
  const p = (loaded.content as any).paragraphs.find((p: any) => p.editable);
  const noOp = await r.request({ kind: 'splice', section: p.section, paragraph: p.paragraph, startUnit: 0, endUnit: 0, text: '' });
  assert.equal(noOp.error, undefined);
  assert.equal(noOp.meta?.changed, false);
  assert.equal(noOp.meta?.application, 'unapplied');
  const results = await Promise.all(Array.from({ length: 32 }, (_, requestId) => r.request({ kind: 'unknown', requestId })));
  assert(results.every(reply => reply.error === 'UnknownPreviewCommand'));
  assert.equal((await r.request({ kind: 'save' })).error, undefined);
});

for (const format of ['hwp5', 'hwpx']) test(`${format}: returned projections cannot mutate backend or an earlier observation`, async t => {
  const r = createReaderRuntime({ wasmModule: await modulePromise }); t.after(() => r.dispose());
  const loaded = await ok(r, { kind: 'load', format, bytes: fixture(format) });
  const before = hash(loaded);
  await ok(r, { kind: 'enable' });
  const target = loaded.content.paragraphs.find((p: any) => p.editable);
  await ok(r, { kind: 'splice', section: target.section, paragraph: target.paragraph, startUnit: 0, endUnit: 0, text: '소유😀' });
  assert.equal(hash(loaded), before);
  loaded.content.paragraphs[0].text = 'BAD';
  if (loaded.content.paragraphs[0].sourceOffsets?.length) loaded.content.paragraphs[0].sourceOffsets[0].source = 99999;
  const fresh = await ok(r, { kind: 'refresh' });
  assert(fresh.content.paragraphs.some((p: any) => p.text.startsWith('소유😀')));
  assert.notEqual(fresh.content.paragraphs[0].text, 'BAD');
});
