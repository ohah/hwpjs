import { describe, test, expect } from 'bun:test';
import { createNativeProvider, createNativeRuntimeFactory } from '../index.ts';
import type { NativeRuntimeTransport } from '../index.ts';
import type { RuntimeMessage, RuntimeReply, RuntimeRequestContext } from '@hwpjs/core';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const context = (): RuntimeRequestContext => ({ editorId: 'left', documentId: 'document:1', generation: 1, requestId: 1, operationRevision: 0 });
function fakeTransport(overrides: Partial<NativeRuntimeTransport> = {}) {
  const calls: RuntimeMessage[] = [], contexts: (RuntimeRequestContext | undefined)[] = [], events: string[] = [];
  const transport: NativeRuntimeTransport = {
    descriptor: { protocol: 'hwpjs.editor-runtime/1', abiVersion: 1, projection: 'shared-provider', implementation: 'fake transport, not Native proof' },
    async request(message, ctx) { calls.push(message); contexts.push(ctx); return { kind: message.kind, bytes: new Uint8Array([4]), meta: { application: 'unapplied', changed: false } }; },
    invalidate() { events.push('invalidate'); }, dispose() { events.push('dispose'); }, ...overrides,
  };
  return { transport, calls, contexts, events };
}

describe('native EditorRuntime adapter with fake transport (not device/JSI proof)', () => {
  test('missing backend is unavailable and never silently loads WASM/WebView', async () => {
    const provider = createNativeProvider();
    expect(provider.availability).toEqual({ status: 'unavailable', reason: 'NativeBackendNotInstalled' });
    await expect(provider.runtimeFactory()).rejects.toThrow('NativeBackendUnavailable');
    const editor = provider.createEditor();
    await expect(editor.load(new Uint8Array([1]), { format: 'hwp5' })).rejects.toThrow('NativeBackendUnavailable');
    expect(editor.getEditorState().status).toBe('empty');
    await editor.dispose();
  });
  test('copies input and context before enqueue and reply before returning', async () => {
    const sharedReply: RuntimeReply = { kind: 'read', bytes: new Uint8Array([9]), nested: { items: [1] } };
    const f = fakeTransport({ async request(message, ctx) { f.calls.push(message); f.contexts.push(ctx); return sharedReply; } });
    const runtime = await createNativeRuntimeFactory(() => f.transport)();
    const bytes = new Uint8Array([1, 2]), nested = { items: [3] }, ctx = context();
    const result = runtime.request({ kind: 'read', bytes, nested }, ctx);
    bytes[0] = 99; nested.items[0] = 99; ctx.editorId = 'wrong';
    const reply = await result;
    expect(Array.from(f.calls[0].bytes as Uint8Array)).toEqual([1, 2]);
    expect((f.calls[0].nested as typeof nested).items).toEqual([3]);
    expect(f.contexts[0]?.editorId).toBe('left');
    (sharedReply.bytes as Uint8Array)[0] = 8;
    expect(Array.from(reply.bytes as Uint8Array)).toEqual([9]);
    expect(reply.meta?.context?.editorId).toBe('left');
    await runtime.dispose();
  });
  test('rejects simultaneous calls but permits immediately chained core calls', async () => {
    const gate = deferred<RuntimeReply>();
    const f = fakeTransport({ request: () => gate.promise });
    const runtime = await createNativeRuntimeFactory(() => f.transport)();
    const first = runtime.request({ kind: 'load' });
    await expect(runtime.request({ kind: 'save' })).rejects.toThrow('NativeRuntimeBusy');
    gate.resolve({ kind: 'load' }); await first;
    await runtime.request({ kind: 'enable' });
    await runtime.dispose();
  });
  test('does not share a transport across instances or dispose someone else\'s transport', async () => {
    const f = fakeTransport(), factory = createNativeRuntimeFactory(() => f.transport);
    const left = await factory();
    await expect(factory()).rejects.toThrow('NativeTransportAlreadyOwned');
    expect(f.events).toEqual([]);
    await left.dispose();
    await expect(factory()).rejects.toThrow('NativeTransportAlreadyOwned');
    expect(f.events).toEqual(['invalidate', 'dispose']);
  });
  test('fences immediately, drains an active request, suppresses late completion and disposes once', async () => {
    const gate = deferred<RuntimeReply>();
    const f = fakeTransport({ request: () => { f.events.push('request'); return gate.promise; } });
    const runtime = await createNativeRuntimeFactory(() => f.transport)();
    const request = runtime.request({ kind: 'save' }, context());
    await Promise.resolve();
    const failed = request.then(() => { throw Error('ExpectedDisposed'); }, error => error);
    const disposal = runtime.dispose();
    expect(runtime.dispose() === disposal).toBe(true);
    expect(f.events).toEqual(['request', 'invalidate']);
    await expect(runtime.request({ kind: 'read' })).rejects.toThrow('NativeRuntimeDisposed');
    gate.resolve({ kind: 'save', bytes: new Uint8Array([1]) });
    expect((await failed).message).toBe('NativeRuntimeDisposed'); await disposal;
    expect(f.events).toEqual(['request', 'invalidate', 'dispose']);
  });
  test('dispose before native enqueue never starts a native request', async () => {
    const f = fakeTransport(), runtime = await createNativeRuntimeFactory(() => f.transport)();
    const request = runtime.request({ kind: 'load' });
    const failed = request.then(() => { throw Error('ExpectedDisposed'); }, error => error);
    await runtime.dispose(); expect((await failed).message).toBe('NativeRuntimeDisposed');
    expect(f.calls).toHaveLength(0);
  });
  test('invalidation failure still drains and releases the transport', async () => {
    const f = fakeTransport({ invalidate() { f.events.push('invalidate'); throw Error('invalidate failed'); } });
    const runtime = await createNativeRuntimeFactory(() => f.transport)();
    const p = runtime.dispose();
    await expect(Promise.resolve(p)).rejects.toThrow('NativeTransportDisposeFailed');
    expect(runtime.dispose() === p).toBe(true);
    expect(f.events).toEqual(['invalidate', 'dispose']);
  });
  test('dispose is safe against reentrant transport invalidation', async () => {
    let again: Promise<void> | void;
    const f = fakeTransport({ invalidate() { again = runtime.dispose(); } });
    const runtime = await createNativeRuntimeFactory(() => f.transport)();
    const disposal = runtime.dispose();
    expect(again! === disposal).toBe(true);
    await disposal;
    expect(f.events).toEqual(['dispose']);
  });
  test('invalid handshake cleans adopted transport exactly once', async () => {
    const f = fakeTransport();
    (f.transport.descriptor as { projection: string }).projection = 'second-native-formatter';
    await expect(createNativeRuntimeFactory(() => f.transport)()).rejects.toThrow('NativeTransportProtocolMismatch');
    expect(f.events).toEqual(['invalidate', 'dispose']);
  });
  test('mismatched reply identity is rejected without rebinding it to the current editor', async () => {
    const f = fakeTransport({ async request() { return { kind: 'read', meta: { context: { ...context(), generation: 2 } } }; } });
    const runtime = await createNativeRuntimeFactory(() => f.transport)();
    await expect(runtime.request({ kind: 'read' }, context())).rejects.toThrow('NativeMismatchedReply');
    await runtime.dispose();
  });
  test('invalid payloads never enter native code; failed requests release the busy guard', async () => {
    const f = fakeTransport(), runtime = await createNativeRuntimeFactory(() => f.transport)();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    await expect(runtime.request({ kind: 'read', cycle })).rejects.toThrow('NativeCyclicPayload');
    let getterCalls = 0;
    const value = Object.defineProperty({}, 'getter', { get() { getterCalls++; return 1; } });
    await expect(runtime.request({ kind: 'read', value })).rejects.toThrow('NativeAccessorPayloadUnsupported');
    await expect(runtime.request({ kind: 'read', callback: () => {} })).rejects.toThrow('NativeUnsupportedPayload');
    await expect(runtime.request({ kind: 'read', bytes: new Uint8Array(new SharedArrayBuffer(1)) })).rejects.toThrow('NativeSharedBufferUnsupported');
    expect(getterCalls).toBe(0); expect(f.calls).toHaveLength(0);
    await runtime.request({ kind: 'read' });
    await runtime.dispose();
  });
  test('transport rejection does not lock the runtime and disposal rejection stays visible', async () => {
    const f = fakeTransport({ async request() { throw Error('native failed'); }, dispose() { throw Error('dispose failed'); } });
    const runtime = await createNativeRuntimeFactory(() => f.transport)();
    await expect(runtime.request({ kind: 'read' })).rejects.toThrow('native failed');
    await expect(runtime.request({ kind: 'read' })).rejects.toThrow('native failed');
    await expect(Promise.resolve(runtime.dispose())).rejects.toThrow('NativeTransportDisposeFailed');
  });
});

test('transport input copies Node Buffer subclasses, captures methods, and rejects mutated request identity', async () => {
  let received: Uint8Array | undefined;
  const f = fakeTransport({ async request(message, ctx) {
    received = message.bytes as Uint8Array;
    if (ctx) ctx.generation = 42;
    return { kind: 'read', meta: { context: ctx } };
  } });
  const runtime = await createNativeRuntimeFactory(() => f.transport)();
  f.transport.request = async () => { throw Error('method replaced after adoption'); };
  const buffer = Buffer.from([1, 2]);
  const request = runtime.request({ kind: 'read', bytes: buffer }, context());
  buffer[0] = 99;
  await expect(request).rejects.toThrow('NativeMismatchedReply');
  expect(Array.from(received!)).toEqual([1, 2]);
  await runtime.dispose();
});

test('native adapter refuses invalid reply outcome metadata', async () => {
  const f = fakeTransport({ async request() { return { kind: 'read', meta: { application: 'pretend-applied' } } as unknown as RuntimeReply; } });
  const runtime = await createNativeRuntimeFactory(() => f.transport)();
  await expect(runtime.request({ kind: 'read' })).rejects.toThrow('NativeInvalidReply');
  await runtime.dispose();
});

test('explicit JSI binding injection stays unavailable until shared transport is configured (fake binding only)', async () => {
  const { createNativeProviderFromJsi } = await import('../index.ts');
  const f = fakeTransport();
  const binding = {
    abiInfo: { abiVersion: 1, pointerBits: 64, tokenSize: 8, bufferSize: 40, stateSize: 20 },
    transportState: 'unavailable' as 'unavailable' | 'configured',
    canvasAvailable: false, nativeImeAvailable: false,
    createTransport() { return f.transport; },
  };
  expect(createNativeProviderFromJsi().availability.status).toBe('unavailable');
  expect(createNativeProviderFromJsi(binding).availability.status).toBe('unavailable');
  binding.transportState = 'configured';
  const provider = createNativeProviderFromJsi(binding);
  expect(provider.availability.status).toBe('configured');
  const runtime = await provider.runtimeFactory();
  await runtime.request({ kind: 'read' }); await runtime.dispose();
  binding.abiInfo.pointerBits = 32;
  expect(() => createNativeProviderFromJsi(binding)).toThrow('NativeJsiAbiMismatch');
});
