import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import type { EditorRuntime } from '../../src/contracts.ts';
function runtime(text: string, closeError?: Error): EditorRuntime {
  return {
    async request(message) {
      return {
        kind: message.kind,
        content: {
          format: 'hwp5',
          paragraphs: [
            { section: 0, paragraph: 0, text, editable: true, selectionOwner: 'section:0:body' },
          ],
        },
        historyRevision: 0,
      };
    },
    dispose() {
      if (closeError) return Promise.reject(closeError);
    },
  };
}
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
test('dispose 거부는 원 Promise와 Native 원인을 유지하고 관측자 거부를 추가하지 않음', async () => {
  const error = Error('NativeCloseFailure');
  const editor = createEditor({ runtimeFactory: () => runtime('A', error) });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  const unhandled: unknown[] = [];
  const observe = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', observe);
  try {
    const first = editor.dispose();
    assert.equal(editor.dispose(), first);
    await assert.rejects(
      first,
      (cause) =>
        cause instanceof AggregateError &&
        cause.message === 'RuntimeDisposeFailed' &&
        cause.errors[0] === error,
    );
    await nextTurn();
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', observe);
  }
});
test('이전 문서 자원 거부 뒤 새 문서 완료 순서와 관측 상태를 보존', async () => {
  const first = runtime('A');
  let reject!: (error: Error) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const base = first.request;
  first.request = (message, context) => {
    if (message.kind !== 'picture-bytes') return base(message, context);
    entered();
    return new Promise((_, fail) => {
      reject = fail;
    });
  };
  const pool = [first, runtime('B')];
  const editor = createEditor({ runtimeFactory: () => pool.shift()! });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  const order: string[] = [];
  const original = Error('OldDocumentPictureFailure');
  const pending = editor.readResource({ kind: 'picture-bytes' });
  const observed = pending.then(
    () => assert.fail('거부가 성공으로 바뀌면 안 됩니다'),
    (error) => {
      assert.equal(error, original);
      order.push('old-rejected');
    },
  );
  await started;
  const next = editor.load(new Uint8Array([2]), { format: 'hwp5' }).then(() => {
    order.push('new-ready');
  });
  reject(original);
  try {
    await observed;
    await next;
    assert.deepEqual(order, ['old-rejected', 'new-ready']);
    assert.equal((editor.getEditorState().content as any).paragraphs[0].text, 'B');
    assert.equal(editor.getEditorState().status, 'ready');
  } finally {
    await editor.dispose();
  }
});
