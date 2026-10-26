import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { SPLICE_TEXT_COMMAND, createCommand } from '../../src/commands/commands.ts';
import type {
  EditorRuntime,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from '../../src/contracts.ts';

function deferred<T>() {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function backend(
  options: {
    loadGate?: Promise<unknown>;
    failLoad?: boolean;
    failMutation?: boolean;
    throwMutation?: boolean;
  } = {},
) {
  let text = 'AB',
    rev = 0,
    closes = 0;
  const calls: { message: RuntimeMessage; context?: RuntimeRequestContext }[] = [];
  const snapshot = () => ({
    format: 'hwp5',
    paragraphs: [
      { section: 0, paragraph: 0, text, editable: true, selectionOwner: 'section:0:body' },
    ],
    binary: new Uint8Array([7, 8]),
  });
  const runtime: EditorRuntime = {
    async request(message, context) {
      calls.push({ message: structuredClone(message), context });
      if (message.kind === 'load') {
        await options.loadGate;
        if (options.failLoad) return { kind: 'load', error: 'BadFile', applied: false };
        return { kind: 'load', content: snapshot(), historyRevision: rev };
      }
      if (message.kind === 'enable')
        return { kind: 'enable', content: snapshot(), historyRevision: rev };
      if (message.kind === 'refresh')
        return { kind: 'refresh', content: snapshot(), historyRevision: rev };
      if (message.kind === 'save')
        return { kind: 'save', bytes: new Uint8Array([text.length]), format: 'hwp5' };
      if (message.kind === 'splice') {
        text =
          text.slice(0, Number(message.startUnit)) +
          message.text +
          text.slice(Number(message.endUnit));
        rev++;
        if (options.throwMutation) throw Error('TransportLost');
        if (options.failMutation) return { kind: 'splice', error: 'SnapshotOOM', applied: true };
        return {
          kind: 'splice',
          content: snapshot(),
          historyRevision: rev,
          meta: { application: 'applied', changed: true },
        };
      }
      return { kind: message.kind, error: 'Unsupported', applied: false };
    },
    dispose() {
      closes++;
    },
  };
  return {
    runtime,
    calls,
    get closes() {
      return closes;
    },
  };
}
function selection(editor: ReturnType<typeof createEditor>, override = {}) {
  return {
    ...editor.getEditorState().token,
    coordinateSpace: 'display' as const,
    format: 'hwp5' as const,
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    affinity: 'forward' as const,
    ...override,
  };
}

test('load copies immediately, failed candidate preserves active, FIFO and save metadata', async () => {
  const gate = deferred<unknown>();
  const a = backend({ loadGate: gate.promise }),
    b = backend({ failLoad: true });
  const pool = [a, b];
  const editor = createEditor({ runtimeFactory: () => pool.shift()!.runtime });
  const bytes = new Uint8Array([1]);
  const opening = editor.load(bytes, { format: 'hwp5' });
  bytes[0] = 99;
  const bad = editor.load(new Uint8Array([2]), { format: 'hwp5' });
  gate.resolve(undefined);
  await opening;
  const first = editor.getEditorState();
  await assert.rejects(bad, /BadFile/);
  assert.equal(a.calls[0].message.bytes instanceof Uint8Array && a.calls[0].message.bytes[0], 1);
  assert.equal(editor.getEditorState().token.documentId, first.token.documentId);
  assert.equal(a.closes, 0);
  assert.equal(b.closes, 1);
  const saved = await editor.save();
  assert.equal(saved.documentId, first.token.documentId);
  assert.equal(saved.operationRevision, first.token.operationRevision);
  await editor.dispose();
  assert.equal(a.closes, 1);
});

test('snapshot identity, listener buffer isolation and old state remains owned', async () => {
  const b = backend();
  const editor = createEditor({ runtimeFactory: () => b.runtime });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  const old = editor.getEditorState();
  assert.equal(old, editor.getEditorState());
  const observations: number[] = [];
  editor.registerUpdateListener((s) => {
    const data = s.content as any;
    data.binary[0] = 99;
    assert.throws(() => {
      data.paragraphs[0].text = 'BAD';
    });
  });
  editor.registerUpdateListener((s) => {
    observations.push((s.content as any).binary[0]);
  });
  await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(editor), text: 'X' });
  assert.deepEqual(observations, [7]);
  assert.equal((old.content as any).paragraphs[0].text, 'AB');
  assert.equal((old.content as any).binary[0], 7);
  await editor.dispose();
  assert.equal(
    old.read((s) => (s.content as any).paragraphs[0].text),
    'AB',
  );
});

test('read/collector async, nested update, callback throw execute zero Native commands', async () => {
  const b = backend();
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const count = b.calls.length;
  assert.throws(() => e.read(async () => 1), /AsyncRead/);
  assert.throws(() => e.read(() => e.update(() => {})), /ReadMutation/);
  assert.throws(() => e.update(() => e.update(() => {})), /NestedUpdate/);
  assert.throws(
    () =>
      e.update((c) => {
        c.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' });
        throw Error('callback');
      }),
    /callback/,
  );
  assert.throws(
    () =>
      e.update(async (c) => {
        c.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' });
      }),
    /AsyncUpdate/,
  );
  assert.throws(
    () =>
      e.update(() => {
        void e.save();
      }),
    /CollectorOnly/,
  );
  assert.equal(b.calls.length, count);
  await e.dispose();
});

test('partial update commits first only, returns stop index and rejects stale targets', async () => {
  const b = backend();
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const target = selection(e);
  const result = await e.update((c) => {
    c.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'X' });
    c.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'Y' });
    c.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'Z' });
  });
  assert.equal(result.stoppedIndex, 1);
  assert.equal(result.results[0].status, 'committed-with-snapshot');
  assert.equal(result.results[1].status, 'rejected-unapplied');
  assert.equal(b.calls.filter((c) => c.message.kind === 'splice').length, 1);
  assert.equal((e.getEditorState().content as any).paragraphs[0].text, 'XAB');
  await e.dispose();
});

test('applied snapshot failure and unknown transport bump fence; refresh keeps revision', async () => {
  for (const mode of ['failMutation', 'throwMutation'] as const) {
    const b = backend({ [mode]: true });
    const e = createEditor({ runtimeFactory: () => b.runtime });
    await e.load(new Uint8Array([1]), { format: 'hwp5' });
    const before = e.getEditorState().operationRevision;
    const result = await e.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: selection(e),
      text: 'X',
    });
    assert.equal(result.status, 'committed-refresh-required');
    assert.ok(e.getEditorState().operationRevision > before);
    assert.equal(e.getEditorState().status, 'refresh-required');
    const blocked = await e.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: selection(e),
      text: 'Y',
    });
    assert.equal(blocked.status, 'rejected-unapplied');
    const revision = e.getEditorState().operationRevision;
    await e.refresh();
    assert.equal(e.getEditorState().operationRevision, revision);
    assert.equal(e.getEditorState().status, 'ready');
    assert.equal(b.calls.filter((c) => c.message.kind === 'splice').length, 1);
    await e.dispose();
  }
});

test('priority/handled, synchronous boolean, at-most-once fallback, listener errors isolated', async () => {
  const b = backend();
  const errors: unknown[] = [];
  const e = createEditor({ runtimeFactory: () => b.runtime, onError: (e) => errors.push(e) });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const trace: string[] = [];
  const command = createCommand<{ value: number }>('test');
  e.registerCommand(
    command,
    () => {
      trace.push('low');
      return false;
    },
    0,
  );
  const off = e.registerCommand(
    command,
    () => {
      trace.push('high');
      return true;
    },
    10,
  );
  assert.equal((await e.dispatchCommand(command, { value: 1 })).status, 'handled-without-runtime');
  assert.deepEqual(trace, ['high']);
  off();
  off();
  e.registerErrorListener(() => {
    throw Error('errorListener');
  });
  e.registerUpdateListener(() => {
    throw Error('listener');
  });
  let later = 0;
  e.registerUpdateListener(() => {
    later++;
  });
  const result = await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' });
  assert.equal(result.status, 'committed-with-snapshot');
  assert.equal(later, 1);
  assert.equal(errors.length, 1);
  const un = e.registerCommand(SPLICE_TEXT_COMMAND, (() => Promise.resolve(false)) as any, 100);
  assert.equal(
    (await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'Y' })).status,
    'rejected-unapplied',
  );
  un();
  assert.equal(b.calls.filter((c) => c.message.kind === 'splice').length, 1);
  await e.dispose();
});

test('dispose fences candidates, pending operations, publication and closes exactly once', async () => {
  const gate = deferred<unknown>(),
    b = backend({ loadGate: gate.promise });
  const e = createEditor({ runtimeFactory: () => b.runtime });
  let updates = 0;
  e.registerUpdateListener(() => {
    updates++;
  });
  const opening = e.load(new Uint8Array([1]), { format: 'hwp5' });
  await Promise.resolve();
  await Promise.resolve();
  const next = e.load(new Uint8Array([2]), { format: 'hwp5' });
  const closed = e.dispose();
  assert.equal(e.dispose(), closed);
  assert.equal(e.getEditorState().status, 'disposed');
  gate.resolve(undefined);
  await assert.rejects(opening, /EditorDisposed/);
  await assert.rejects(next, /EditorDisposed/);
  await closed;
  assert.equal(b.closes, 1);
  assert.equal(updates, 0);
  await assert.rejects(e.load(new Uint8Array([1]), { format: 'hwp5' }), /EditorDisposed/);
});

test('collector partial runtime failure uses explicit future target, keeps first commit and stops before third', async () => {
  const b = backend();
  let count = 0;
  const original = b.runtime.request;
  b.runtime.request = async (m, c) => {
    if (m.kind === 'splice' && ++count === 2)
      return { kind: 'splice', error: 'ProtectedRange', applied: false };
    return original(m, c);
  };
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const target = selection(e);
  const future = {
    ...target,
    operationRevision: target.operationRevision + 1,
    viewRevision: target.viewRevision + 1,
  };
  const answer = await e.update((c, s) => {
    assert.equal((s.content as any).paragraphs[0].text, 'AB');
    c.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'X' });
    c.dispatchCommand(SPLICE_TEXT_COMMAND, { target: future, text: 'Y' });
    c.dispatchCommand(SPLICE_TEXT_COMMAND, { target: future, text: 'Z' });
    assert.equal((s.content as any).paragraphs[0].text, 'AB');
  });
  assert.equal(answer.stoppedIndex, 1);
  assert.equal(answer.results[1].error, 'ProtectedRange');
  assert.equal(count, 2);
  assert.equal((e.getEditorState().content as any).paragraphs[0].text, 'XAB');
  await e.dispose();
});

test('listener queued async work is not awaited, snapshots publish in order and unsubscribing affects only future publication', async () => {
  const b = backend();
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const trace: string[] = [];
  let nested: Promise<unknown> | undefined;
  let off = () => {};
  let first = true;
  e.registerUpdateListener(async (s) => {
    trace.push('A:' + s.operationRevision);
    off();
    if (first) {
      first = false;
      nested = e.save();
      await nested;
      trace.push('saved');
    }
  });
  off = e.registerUpdateListener((s) => {
    trace.push('B:' + s.operationRevision);
  });
  const answer = await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' });
  trace.push('settled');
  await nested;
  await Promise.resolve();
  assert.equal(answer.status, 'committed-with-snapshot');
  assert.equal(trace[0].startsWith('A:'), true);
  assert.equal(trace[1].startsWith('B:'), true);
  assert.ok(trace.indexOf('settled') < trace.indexOf('saved'));
  await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'Y' });
  assert.equal(trace.filter((x) => x.startsWith('B:')).length, 1);
  await e.dispose();
});

test('no-op and rejected Native results do not advance revision or issue mutation updates', async () => {
  const b = backend();
  const orig = b.runtime.request;
  b.runtime.request = async (m, c) =>
    m.kind === 'undo'
      ? { kind: 'undo', content: {}, meta: { application: 'unapplied', changed: false } }
      : m.kind === 'redo'
        ? { kind: 'redo', error: 'Disabled', applied: false }
        : orig(m, c);
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const revision = e.getEditorState().operationRevision;
  let updates = 0;
  e.registerUpdateListener(() => {
    updates++;
  });
  assert.equal((await e.undo()).status, 'known-no-op');
  assert.equal((await e.redo()).status, 'rejected-unapplied');
  assert.equal(e.getEditorState().operationRevision, revision);
  assert.equal(updates, 0);
  await e.dispose();
});

test('target payload is copied at dispatch; foreign generation/view/owner/scalar/anchor ranges rejected before Native', async () => {
  const b = backend();
  const original = b.runtime.request;
  b.runtime.request = async (m, c) => {
    const r = await original(m, c);
    if (r.content && (m.kind === 'load' || m.kind === 'enable'))
      r.content = {
        format: 'hwp5',
        paragraphs: [
          {
            section: 0,
            paragraph: 0,
            text: 'A\ufffc😀B',
            editable: true,
            selectionOwner: 'section:0:body',
            sourceOffsets: [
              { at: 0, source: 0 },
              { at: 2, source: 9 },
            ],
          },
        ],
      };
    return r;
  };
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  for (const override of [
    { generation: 99 },
    { viewRevision: 99 },
    { owner: 'wrong' },
    { startUnit: 3, endUnit: 3 },
    { startUnit: 1, endUnit: 2 },
    { section: 9 },
  ]) {
    const r = await e.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: selection(e, override),
      text: 'X',
    });
    assert.equal(r.status, 'rejected-unapplied');
  }
  const target = selection(e, { startUnit: 4, endUnit: 5 });
  const payload = { target, text: 'X' };
  const pending = e.dispatchCommand(SPLICE_TEXT_COMMAND, payload);
  payload.text = 'MUTATED';
  target.startUnit = 0;
  assert.equal((await pending).status, 'committed-with-snapshot');
  const call = b.calls.find((x) => x.message.kind === 'splice')!;
  assert.equal(call.message.text, 'X');
  assert.equal(call.message.startUnit, 11);
  assert.equal(call.message.endUnit, 12);
  await e.dispose();
});

test('async callbacks are rejected before invocation and retained collector is closed', async () => {
  const b = backend();
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  let ran = false;
  let retained: any;
  assert.throws(
    () =>
      e.update(async () => {
        ran = true;
      }),
    /AsyncUpdate/,
  );
  assert.throws(
    () =>
      e.read(async () => {
        ran = true;
      }),
    /AsyncRead/,
  );
  assert.equal(ran, false);
  await e.update((c) => {
    retained = c;
  });
  assert.throws(
    () => retained.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' }),
    /CollectorClosed/,
  );
  await e.dispose();
});

test('shared runtimes are refused without disposing another editor instance', async () => {
  const b = backend();
  const first = createEditor({ runtimeFactory: () => b.runtime });
  await first.load(new Uint8Array([1]), { format: 'hwp5' });
  const second = createEditor({ runtimeFactory: () => b.runtime });
  await assert.rejects(second.load(new Uint8Array([1]), { format: 'hwp5' }), /RuntimeAlreadyOwned/);
  assert.equal(b.closes, 0);
  await second.dispose();
  await first.dispose();
  assert.equal(b.closes, 1);
});

test('locked candidate preserves active, unlock swaps only after enabled snapshot and cancel only releases candidate', async () => {
  const a = backend(),
    b = backend(),
    c = backend();
  const pool = [a, b, c];
  const old = b.runtime.request;
  b.runtime.request = async (m, ctx) =>
    m.kind === 'load'
      ? { kind: 'load', error: 'EncryptedDocument', passwordRequired: true, applied: false }
      : m.kind === 'unlock'
        ? { kind: 'unlock', content: { format: 'hwp5', paragraphs: [] } }
        : old(m, ctx);
  c.runtime.request = async () => ({
    kind: 'load',
    error: 'EncryptedDocument',
    passwordRequired: true,
    applied: false,
  });
  const e = createEditor({ runtimeFactory: () => pool.shift()!.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const doc = e.getEditorState().documentId;
  await assert.rejects(e.load(new Uint8Array([2]), { format: 'hwp5' }), /EncryptedDocument/);
  assert.equal(e.getEditorState().documentId, doc);
  assert.equal(a.closes, 0);
  assert.equal(b.closes, 0);
  await e.unlock('secret', { allowPasswordRemoval: true });
  assert.notEqual(e.getEditorState().documentId, doc);
  assert.equal(a.closes, 1);
  await assert.rejects(e.load(new Uint8Array([3]), { format: 'hwp5' }), /EncryptedDocument/);
  await e.cancelLoad();
  assert.equal(c.closes, 1);
  assert.equal(b.closes, 0);
  await e.dispose();
  assert.equal(b.closes, 1);
});

test('save ownership/recovery fence, refresh failure and mismatched metadata settle without retry', async () => {
  const b = backend({ failMutation: true });
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' });
  await assert.rejects(e.save(), /RecoverySaveRequired/);
  const save = await e.save({ recovery: true, allowStaleLayout: true });
  assert.equal(save.staleSnapshot, true);
  save.bytes[0] = 255;
  const next = await e.save({ recovery: true });
  assert.notEqual(next.bytes[0], 255);
  const revision = e.getEditorState().operationRevision;
  const original = b.runtime.request;
  b.runtime.request = async (m, c) =>
    m.kind === 'refresh' ? { kind: 'refresh', error: 'OOM' } : original(m, c);
  await assert.rejects(e.refresh(), /OOM/);
  assert.equal(e.getEditorState().status, 'refresh-required');
  assert.equal(e.getEditorState().operationRevision, revision);
  b.runtime.request = original;
  await e.refresh();
  b.runtime.request = async (m, c) =>
    m.kind === 'splice'
      ? { kind: 'splice', meta: { context: { ...c!, generation: 99 } }, content: {} }
      : original(m, c);
  const unknown = await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'Z' });
  assert.equal(unknown.status, 'committed-refresh-required');
  assert.ok(e.getEditorState().operationRevision > revision);
  await e.dispose();
});

test('dispose waits for in-flight applied request, fences publication, and cancels queued work before entry', async () => {
  const b = backend();
  const original = b.runtime.request;
  const entered = deferred<unknown>(),
    resume = deferred<unknown>();
  b.runtime.request = async (m, c) => {
    if (m.kind === 'splice') {
      const reply = await original(m, c);
      entered.resolve(undefined);
      await resume.promise;
      return reply;
    }
    return original(m, c);
  };
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  let updates = 0;
  e.registerUpdateListener(() => {
    updates++;
  });
  const edit = e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' });
  await entered.promise;
  const queued = e.save();
  const rejection = assert.rejects(queued, /EditorDisposed/);
  let disposed = false;
  const closing = e.dispose().then(() => {
    disposed = true;
  });
  await Promise.resolve();
  assert.equal(disposed, false);
  assert.equal(b.closes, 0);
  resume.resolve(undefined);
  const applied = await edit;
  assert.equal(applied.status, 'committed-with-snapshot');
  assert.equal(applied.state.status, 'disposed');
  await rejection;
  await closing;
  assert.equal(updates, 0);
  assert.equal(b.closes, 1);
  assert.equal(b.calls.filter((x) => x.message.kind === 'save').length, 0);
});

test('snapshot-copy/enable failures keep previous active and release every candidate once', async () => {
  const a = backend(),
    b = backend(),
    c = backend();
  const oldB = b.runtime.request,
    oldC = c.runtime.request;
  b.runtime.request = async (m, ctx) =>
    m.kind === 'enable' ? { kind: 'enable', content: { fn: () => 1 } } : oldB(m, ctx);
  c.runtime.request = async (m, ctx) =>
    m.kind === 'enable' ? { kind: 'enable', error: 'EnableFailed', applied: false } : oldC(m, ctx);
  const pool = [a, b, c];
  const e = createEditor({ runtimeFactory: () => pool.shift()!.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const before = e.getEditorState();
  await assert.rejects(e.load(new Uint8Array([2]), { format: 'hwp5' }), /UnsupportedPayload/);
  await assert.rejects(e.load(new Uint8Array([3]), { format: 'hwp5' }), /EnableFailed/);
  assert.equal(e.getEditorState().documentId, before.documentId);
  assert.equal(e.getEditorState().operationRevision, before.operationRevision);
  assert.equal(e.getEditorState().savedOperationRevision, before.savedOperationRevision);
  assert.equal(e.getEditorState().content, before.content);
  assert.equal(b.closes, 1);
  assert.equal(c.closes, 1);
  assert.equal(a.closes, 0);
  await e.dispose();
});

test('multiple editors keep independent queues while one factory waits', async () => {
  const gate = deferred<unknown>(),
    slow = backend({ loadGate: gate.promise }),
    fast = backend();
  const a = createEditor({ runtimeFactory: () => slow.runtime }),
    b = createEditor({ runtimeFactory: () => fast.runtime });
  const waiting = a.load(new Uint8Array([1]), { format: 'hwp5' });
  await b.load(new Uint8Array([2]), { format: 'hwp5' });
  assert.equal(b.getEditorState().status, 'ready');
  assert.notEqual(a.getEditorState().editorId, b.getEditorState().editorId);
  gate.resolve(undefined);
  await waiting;
  await Promise.all([a.dispose(), b.dispose()]);
});

test('experimental queries are separate from typed operations, inputs copied and generation checked', async () => {
  const b = backend();
  const orig = b.runtime.request;
  b.runtime.request = async (m, c) =>
    m.kind === 'query-window'
      ? { kind: 'query-window', bytes: new Uint8Array([Number(m.input)]) }
      : orig(m, c);
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const token = e.getEditorState().token;
  const message = { kind: 'query-window', input: 7 };
  const request = e.requestExperimental(message, { mutation: false, token });
  message.input = 99;
  const answer = (await request) as RuntimeReply;
  assert.equal((answer.bytes as Uint8Array)[0], 7);
  assert.throws(
    () => e.requestExperimental({ kind: 'splice' }, { mutation: false, token }),
    /UseTyped/,
  );
  assert.throws(
    () => e.requestExperimental({ kind: 'set-custom' }, { mutation: false, token }),
    /UnsafeExperimentalQuery/,
  );
  await assert.rejects(
    e.requestExperimental(
      { kind: 'query-window' },
      { mutation: false, token: { ...token, generation: 99 } },
    ),
    /StaleTarget/,
  );
  await e.dispose();
});

test('post-commit auxiliary reply copy failure cannot turn a commit into rejected-unapplied', async () => {
  const b = backend();
  const original = b.runtime.request;
  b.runtime.request = async (m, c) => {
    const reply = await original(m, c);
    return m.kind === 'splice' ? { ...reply, origin: () => 1 } : reply;
  };
  const e = createEditor({ runtimeFactory: () => b.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const before = e.getEditorState().operationRevision;
  const answer = await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: selection(e), text: 'X' });
  assert.equal(answer.status, 'committed-with-snapshot');
  assert.ok(answer.state.operationRevision > before);
  assert.equal(answer.reply, undefined);
  assert.equal((answer.state.content as any).paragraphs[0].text, 'XAB');
  await e.dispose();
});

test('cancelLoad fences a candidate in-flight without freeing it early or replacing prior document', async () => {
  const a = backend(),
    gate = deferred<unknown>(),
    b = backend({ loadGate: gate.promise }),
    pool = [a, b];
  const e = createEditor({ runtimeFactory: () => pool.shift()!.runtime });
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
  const old = e.getEditorState();
  const loading = e.load(new Uint8Array([2]), { format: 'hwp5' });
  await Promise.resolve();
  await Promise.resolve();
  const failed = assert.rejects(loading, /LoadCancelled/);
  const cancelled = e.cancelLoad();
  assert.equal(b.closes, 0);
  gate.resolve(undefined);
  await failed;
  await cancelled;
  assert.equal(e.getEditorState().documentId, old.documentId);
  assert.equal(e.getEditorState().content, old.content);
  assert.equal(b.closes, 1);
  assert.equal(a.closes, 0);
  await e.dispose();
});
