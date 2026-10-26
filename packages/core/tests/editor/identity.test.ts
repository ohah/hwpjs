import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { SPLICE_TEXT_COMMAND } from '../../src/commands/commands.ts';
function runtime(text: string) {
  let splices = 0;
  return {
    get splices() {
      return splices;
    },
    runtime: {
      dispose() {},
      async request(m: any) {
        if (m.kind === 'splice') {
          splices++;
          text = m.text + text;
        }
        return {
          kind: m.kind,
          content: {
            format: 'hwp5',
            paragraphs: [
              { section: 0, paragraph: 0, text, editable: true, selectionOwner: 'section:0:body' },
            ],
          },
          meta: {
            application: m.kind === 'splice' ? 'applied' : 'unapplied',
            changed: m.kind === 'splice',
          },
        };
      },
    },
  };
}
const target = (e: ReturnType<typeof createEditor>) => ({
  ...e.getEditorState().token,
  coordinateSpace: 'display' as const,
  format: 'hwp5' as const,
  owner: 'section:0:body',
  section: 0,
  paragraph: 0,
  startUnit: 0,
  endUnit: 1,
  affinity: 'forward' as const,
});
async function opens(e: ReturnType<typeof createEditor>) {
  await e.load(new Uint8Array([1]), { format: 'hwp5' });
}
for (const disposed of [false, true])
  test(`same caller editor label cannot reuse another instance's token, disposed=${disposed}`, async () => {
    const a = runtime('AB'),
      b = runtime('CD'),
      one = createEditor({ editorId: 'shared', runtimeFactory: () => a.runtime }),
      two = createEditor({ editorId: 'shared', runtimeFactory: () => b.runtime });
    try {
      await opens(one);
      const foreign = target(one);
      if (disposed) await one.dispose();
      await opens(two);
      assert.equal(one.getEditorState().editorId, 'shared');
      assert.equal(two.getEditorState().editorId, 'shared');
      assert.notEqual(one.getEditorState().documentId, two.getEditorState().documentId);
      const before = two.getEditorState();
      const rejected = await two.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: foreign,
        text: 'X',
      });
      assert.equal(rejected.error, 'StaleTarget');
      assert.equal(rejected.status, 'rejected-unapplied');
      assert.equal(b.splices, 0);
      assert.equal(two.getEditorState(), before);
      assert.equal(
        (await two.dispatchCommand(SPLICE_TEXT_COMMAND, { target: target(two), text: 'Y' })).status,
        'committed-with-snapshot',
      );
      assert.equal(b.splices, 1);
    } finally {
      await one.dispose();
      await two.dispose();
    }
  });
test('custom IDs cannot forge the next automatic editor document identity', async () => {
  // Determine the next automatic label locally, without depending on test execution order.
  const before = createEditor({ runtimeFactory: () => runtime('unused').runtime });
  const next = Number(before.getEditorState().editorId.slice('hwpjs-editor-'.length)) + 1;
  await before.dispose();
  const a = runtime('AB'),
    b = runtime('CD'),
    one = createEditor({ editorId: `hwpjs-editor-${next}`, runtimeFactory: () => a.runtime }),
    two = createEditor({ runtimeFactory: () => b.runtime });
  try {
    await opens(one);
    await opens(two);
    assert.equal(one.getEditorState().editorId, two.getEditorState().editorId);
    assert.notEqual(one.getEditorState().documentId, two.getEditorState().documentId);
    assert.equal(
      (await two.dispatchCommand(SPLICE_TEXT_COMMAND, { target: target(one), text: 'X' })).error,
      'StaleTarget',
    );
    assert.equal(b.splices, 0);
  } finally {
    await one.dispose();
    await two.dispose();
  }
});
test('successive documents in one editor still invalidate earlier targets', async () => {
  const backends = [runtime('AB'), runtime('CD')];
  const e = createEditor({ editorId: 'reload', runtimeFactory: () => backends.shift()!.runtime });
  try {
    await opens(e);
    const old = target(e);
    await opens(e);
    assert.notEqual(e.getEditorState().documentId, old.documentId);
    assert.equal(
      (await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: old, text: 'X' })).error,
      'StaleTarget',
    );
  } finally {
    await e.dispose();
  }
});
