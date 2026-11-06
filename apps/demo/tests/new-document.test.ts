import test from 'node:test';
import assert from 'node:assert/strict';
import { askNewDocumentFormat, newDocumentName } from '../src/new-document-dialog.ts';
import { focusNewDocumentAfterPaint } from '../src/new-document-focus.ts';
import { confirmDocumentReplacement } from '../src/new-document-replacement.ts';
import { createDocumentAdmission } from '../src/document-admission.ts';
import { DEMO_COMMAND_REGISTRY, resolveCommandSupport } from '../src/command-support.ts';
import { createDemoShell } from '../src/shell.ts';
// @ts-ignore Shared minimal DOM fixture has no declaration file.
import { Document, all, fire } from './fake-dom.mjs';
function dialogDocument() {
  const doc = new Document();
  const create = doc.createElement.bind(doc);
  doc.createElement = (name: string) => {
    const element = create(name);
    if (name === 'dialog') {
      element.showModal = () => {
        element.open = true;
      };
      element.close = () => {
        element.open = false;
      };
    }
    return element;
  };
  return doc;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
for (const format of ['hwpx', 'hwp5'] as const)
  test(`format dialog chooses ${format} and owns its cancellation lifetime`, async () => {
    const doc = dialogDocument(),
      root = doc.createElement('main'),
      abort = new AbortController();
    const pending = askNewDocumentFormat(root as any, abort.signal);
    const select = all(root, (n: any) => n.dataset.role === 'new-document-format')[0];
    assert.equal(select.value, 'hwpx');
    select.value = format;
    fire(all(root, (n: any) => n.dataset.role === 'create-new-document')[0], 'click');
    assert.equal(await pending, format);
    assert.equal(root.children.length, 0);
    assert.equal(newDocumentName(format), format === 'hwpx' ? '새문서.hwpx' : '새문서.hwp');
    abort.abort();
  });
for (const how of ['cancel', 'escape', 'abort', 'close'])
  test(`format dialog ${how} preserves the current document`, async () => {
    const doc = dialogDocument(),
      root = doc.createElement('main'),
      abort = new AbortController();
    const pending = askNewDocumentFormat(root as any, abort.signal);
    if (how === 'abort') abort.abort();
    else if (how === 'cancel')
      fire(all(root, (n: any) => n.dataset.role === 'cancel-new-document')[0], 'click');
    else fire(root.children[0], how === 'escape' ? 'cancel' : 'close');
    assert.equal(await pending, undefined);
    assert.equal(root.children.length, 0);
  });
test('already aborted format prompt creates no dialog', async () => {
  const doc = dialogDocument(),
    root = doc.createElement('main'),
    abort = new AbortController();
  abort.abort();
  assert.equal(await askNewDocumentFormat(root as any, abort.signal), undefined);
  assert.equal(root.children.length, 0);
});
test('new document menu and primary toolbar use the registry and work before a document is opened', async () => {
  const doc = new Document(),
    root = doc.createElement('main'),
    calls: unknown[] = [];
  const state = { title: '', status: '', actions: { 'new-document': { enabled: true } } };
  const shell = createDemoShell(root as any, {
    framework: 'headless',
    routes: { headless: '/h', vanilla: '/v', react: '/r', svelte: '/s' },
    fixtures: [],
    getState: () => state,
    onAction: (a) => {
      calls.push(a);
    },
  });
  const buttons = all(root, (n: any) => n.dataset.command === 'new-document');
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.ok(button.textContent.includes(DEMO_COMMAND_REGISTRY['new-document'].label));
    assert.equal(button.disabled, false);
    fire(button, 'click');
  }
  await Promise.resolve();
  assert.deepEqual(calls, [{ command: 'new-document' }, { command: 'new-document' }]);
  assert.equal(
    resolveCommandSupport('new-document', {
      connected: true,
      document: 'none',
      availability: { enabled: true },
    }).enabled,
    true,
  );
  shell.destroy();
});
test('dirty replacement checks saved revisions, including a change with no reachable undo entry', async () => {
  let state: any = {
    documentId: 'a',
    operationRevision: 9,
    savedOperationRevision: 3,
    nativeHistoryRevisions: [9],
  };
  const editor = { getEditorState: () => state, update: async () => {} } as any,
    abort = new AbortController();
  let prompts = 0;
  await assert.rejects(
    confirmDocumentReplacement(editor, abort.signal, async () => {
      prompts++;
      return false;
    }),
    /취소/,
  );
  assert.equal(prompts, 1);
  assert.equal(await confirmDocumentReplacement(editor, abort.signal, async () => true), true);
  state = { ...state, savedOperationRevision: 9 };
  assert.equal(
    await confirmDocumentReplacement(editor, abort.signal, async () => {
      throw Error('MustNotPrompt');
    }),
    true,
  );
});
test('consent cannot discard an edit or new document that arrived during the dialog', async () => {
  let state: any = { documentId: 'a', operationRevision: 9, savedOperationRevision: 3 };
  const editor = { getEditorState: () => state, update: async () => {} } as any,
    gate = deferred<boolean>(),
    entered = deferred<void>();
  const pending = confirmDocumentReplacement(editor, new AbortController().signal, () => {
    entered.resolve();
    return gate.promise;
  });
  await entered.promise;
  state = { ...state, operationRevision: 10 };
  gate.resolve(true);
  assert.equal(await pending, false);
});
test('refusing replacement invokes neither cancellation nor candidate and preserves state', async () => {
  const events: string[] = [];
  const admission = createDocumentAdmission({
    confirmReplace: async () => false,
    cancelLoad: async () => {
      events.push('cancel');
    },
    load: async () => {
      events.push('load');
    },
    loading: () => {},
    loaded: () => {
      events.push('loaded');
    },
    settled: () => {},
  });
  await admission.replace('new', async () => {
    events.push('create');
  });
  await admission.open('open', async () => new Uint8Array([1]));
  assert.deepEqual(events, []);
  await admission.dispose();
});
test('new document and file open share a generation, abort stale dialogs and publish only the latest name', async () => {
  const names: string[] = [],
    gate = deferred<string>(),
    entered = deferred<void>();
  let signal: AbortSignal | undefined;
  const admission = createDocumentAdmission({
    cancelLoad: async () => {},
    load: async () => {},
    loading: () => {},
    loaded: (name) => names.push(name),
    settled: () => {},
  });
  const creating = admission.replace('new', async (value) => {
    signal = value;
    entered.resolve();
    return gate.promise;
  });
  await entered.promise;
  await admission.open('later.hwp', async () => new Uint8Array([1]));
  assert.equal(signal!.aborted, true);
  gate.resolve('새문서.hwpx');
  await creating;
  assert.deepEqual(names, ['later.hwp']);
  await admission.dispose();
});
test('focus waits for the host paint readiness and stops after acceptance', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0,
    calls = 0;
  const abort = new AbortController();
  focusNewDocumentAfterPaint({
    signal: abort.signal,
    current: () => true,
    focus: () => ++calls === 2,
    requestFrame: (callback) => {
      frames.set(++next, callback);
      return next;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
  });
  assert.equal(calls, 0);
  const run = () => {
    const [id, callback] = [...frames][0];
    frames.delete(id);
    callback(0);
  };
  run();
  assert.equal(calls, 1);
  assert.equal(frames.size, 1);
  run();
  assert.equal(calls, 2);
  assert.equal(frames.size, 0);
});
for (const how of ['abort', 'stale'])
  test(`focus never targets an ${how} document`, () => {
    const abort = new AbortController();
    let frame: FrameRequestCallback = () => {},
      calls = 0;
    focusNewDocumentAfterPaint({
      signal: abort.signal,
      current: () => how !== 'stale',
      focus: () => {
        calls++;
        return true;
      },
      requestFrame: (callback) => {
        frame = callback;
        return 1;
      },
      cancelFrame: () => {},
    });
    if (how === 'abort') abort.abort();
    frame(0);
    assert.equal(calls, 0);
  });

test('replacement drains a pending input commit before deciding that the document is clean', async () => {
  let state: any = { documentId: 'a', operationRevision: 1, savedOperationRevision: 1 };
  const entered = deferred<void>(),
    commit = deferred<void>(),
    events: string[] = [];
  const editor = {
    getEditorState: () => state,
    update: async () => {
      events.push('barrier');
      entered.resolve();
      await commit.promise;
      state = { ...state, operationRevision: 2 };
    },
  } as any;
  const pending = confirmDocumentReplacement(editor, new AbortController().signal, async () => {
    events.push('prompt');
    assert.equal(state.operationRevision, 2);
    return false;
  });
  const rejected = assert.rejects(pending, /취소/);
  await Promise.resolve();
  // This fails on the old clean-state fast path without waiting for an unentered barrier.
  assert.deepEqual(events, ['barrier']);
  await entered.promise;
  commit.resolve();
  await rejected;
  assert.deepEqual(events, ['barrier', 'prompt']);
});
test('accepted consent drains input queued during the prompt and refuses to discard its new revision', async () => {
  let state: any = { documentId: 'a', operationRevision: 2, savedOperationRevision: 1 },
    barriers = 0;
  const editor = {
    getEditorState: () => state,
    update: async () => {
      if (++barriers === 2) state = { ...state, operationRevision: 3 };
    },
  } as any;
  assert.equal(
    await confirmDocumentReplacement(editor, new AbortController().signal, async () => true),
    false,
  );
  assert.equal(barriers, 2);
  assert.equal(state.operationRevision, 3);
});
for (const stage of ['before', 'initial-barrier', 'prompt', 'accepted-barrier'] as const)
  test(`replacement aborted at ${stage} never cancels or starts a candidate`, async () => {
    const abort = new AbortController(),
      events: string[] = [];
    let barriers = 0;
    const editor = {
      getEditorState: () => ({ documentId: 'a', operationRevision: 2, savedOperationRevision: 1 }),
      update: async () => {
        events.push('barrier');
        if (
          ++barriers === (stage === 'initial-barrier' ? 1 : stage === 'accepted-barrier' ? 2 : -1)
        )
          abort.abort();
      },
    } as any;
    if (stage === 'before') abort.abort();
    const accepted = await confirmDocumentReplacement(editor, abort.signal, async () => {
      events.push('prompt');
      if (stage === 'prompt') abort.abort();
      return true;
    });
    assert.equal(accepted, false);
    if (stage === 'before') assert.deepEqual(events, []);
    if (stage === 'initial-barrier') assert.deepEqual(events, ['barrier']);
    if (stage === 'prompt') assert.deepEqual(events, ['barrier', 'prompt']);
    if (stage === 'accepted-barrier') assert.deepEqual(events, ['barrier', 'prompt', 'barrier']);
  });
test('refusal after the input barrier never invokes the accepted-consent barrier or cancelLoad', async () => {
  const events: string[] = [];
  const editor = {
    getEditorState: () => ({ documentId: 'a', operationRevision: 2, savedOperationRevision: 1 }),
    update: async () => {
      events.push('barrier');
    },
  } as any;
  const admission = createDocumentAdmission({
    confirmReplace: (signal) =>
      confirmDocumentReplacement(editor, signal, async () => {
        events.push('prompt');
        return false;
      }),
    cancelLoad: async () => {
      events.push('cancel');
    },
    load: async () => {},
    loading: () => {},
    loaded: () => {},
    settled: () => {},
  });
  await assert.rejects(
    admission.replace('new', async () => {
      events.push('candidate');
    }),
    /취소/,
  );
  assert.deepEqual(events, ['barrier', 'prompt']);
  await admission.dispose();
});
test('empty and locked editors without an input surface admit an empty update without entering Native', async () => {
  const { createEditor } = await import('../../../packages/core/src/editor/create-editor.ts');
  const calls: string[] = [];
  let disposed = 0;
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(message: any) {
        calls.push(message.kind);
        if (message.kind === 'load')
          return { kind: 'load', error: 'EncryptedDocument', passwordRequired: true };
        return {
          kind: message.kind,
          content: {
            format: 'hwp5',
            paragraphs: [
              {
                section: 0,
                paragraph: 0,
                text: '',
                editable: true,
                selectionOwner: 'section:0:body',
              },
            ],
          },
        };
      },
      dispose() {
        disposed++;
      },
    }),
  });
  try {
    const prompt = async () => {
      assert.fail('An empty editor has no unsaved document');
      return false;
    };
    assert.equal(
      await confirmDocumentReplacement(editor, new AbortController().signal, prompt),
      true,
    );
    assert.deepEqual(calls, []);
    await assert.rejects(editor.load(new Uint8Array([1]), { format: 'hwp5' }), /EncryptedDocument/);
    assert.equal(
      await confirmDocumentReplacement(editor, new AbortController().signal, prompt),
      true,
    );
    assert.deepEqual(calls, ['load']);
    assert.equal(disposed, 0);
    await editor.unlock('password');
    assert.deepEqual(calls, ['load', 'unlock', 'enable']);
  } finally {
    await editor.dispose();
  }
});

test('refusing dirty replacement preserves the actual locked candidate and calls no Native operation', async () => {
  const { createEditor } = await import('../../../packages/core/src/editor/create-editor.ts');
  const { SPLICE_TEXT_COMMAND } = await import('../../../packages/core/src/commands/commands.ts');
  const { createParagraphSelection } =
    await import('../../../packages/core/src/state/paragraph-selection.ts');
  const calls: string[] = [],
    closes: number[] = [];
  let factories = 0,
    cancels = 0;
  const editor = createEditor({
    runtimeFactory: () => {
      const index = factories++;
      let revision = 0;
      return {
        async request(message: any) {
          calls.push(`${index}:${message.kind}`);
          if (index === 1 && message.kind === 'load')
            return { kind: 'load', error: 'EncryptedDocument', passwordRequired: true };
          if (message.kind === 'splice') revision++;
          return {
            kind: message.kind,
            historyRevision: revision,
            historyRevisions: revision ? [1, 0] : [0],
            meta: message.kind === 'splice' ? { application: 'applied', changed: true } : undefined,
            content: {
              format: 'hwpx',
              paragraphs: [
                {
                  section: 0,
                  paragraph: 0,
                  text: revision ? 'A' : '',
                  editable: true,
                  selectionOwner: 'section:0:body',
                },
              ],
            },
          };
        },
        dispose() {
          closes.push(index);
        },
      };
    },
  });
  const admission = createDocumentAdmission({
    confirmReplace: (signal) => confirmDocumentReplacement(editor, signal, async () => false),
    cancelLoad: async () => {
      cancels++;
      await editor.cancelLoad();
    },
    load: async () => {},
    loading: () => {},
    loaded: () => {},
    settled: () => {},
  });
  try {
    const opened = await editor.load(new Uint8Array([1]), { format: 'hwpx' });
    await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: createParagraphSelection(opened, { section: 0, paragraph: 0, startUnit: 0 }),
      text: 'A',
    });
    await assert.rejects(editor.load(new Uint8Array([2]), { format: 'hwp5' }), /EncryptedDocument/);
    const before = editor.getEditorState(),
      nativeBefore = [...calls];
    assert.notEqual(before.operationRevision, before.savedOperationRevision);
    await assert.rejects(
      admission.replace('new', async () => {
        assert.fail('Refusal must not create');
      }),
      /취소/,
    );
    assert.deepEqual(calls, nativeBefore);
    assert.equal(cancels, 0);
    assert.deepEqual(closes, []);
    assert.equal(editor.getEditorState(), before);
    await editor.unlock('password');
    assert.deepEqual(calls.slice(-2), ['1:unlock', '1:enable']);
    assert.deepEqual(closes, [0]);
  } finally {
    await admission.dispose();
    await editor.dispose();
  }
});
test('failed input settlement prevents both the consent prompt and replacement admission', async () => {
  const state: any = { documentId: 'a', operationRevision: 1, savedOperationRevision: 1 };
  const editor = {
    getEditorState: () => state,
    update: async () => {
      throw Error('CompositionBlocked');
    },
  } as any;
  let cancels = 0;
  const admission = createDocumentAdmission({
    confirmReplace: (signal) =>
      confirmDocumentReplacement(editor, signal, async () => {
        assert.fail('Unsettled input must not prompt');
        return true;
      }),
    cancelLoad: async () => {
      cancels++;
    },
    load: async () => {},
    loading: () => {},
    loaded: () => {},
    settled: () => {},
  });
  await assert.rejects(
    admission.replace('new', async () => {
      assert.fail('Unsettled input must not create');
    }),
    /CompositionBlocked/,
  );
  assert.equal(cancels, 0);
  await admission.dispose();
});
