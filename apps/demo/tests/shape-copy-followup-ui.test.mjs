import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './shape-copy-followup-dom.mjs';
import {
  APPLY_FORMATTING_PATCH_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from './shape-copy-native-fixture.mjs';
async function copy(h) {
  await h.select(h.rows[0], 1, 1);
  await h.tool.action('format-copy');
  const field = h.d.field('character.bold');
  assert(field && !field.disabled);
  field.checked = true;
  h.d.send(field, 'change');
  h.d.send(h.d.role('shape-copy-confirm'), 'click');
  await h.select(h.rows[1], 0, 2);
}
async function seed(h) {
  await h.select(h.rows[0], 0, 1);
  assert.equal(
    (
      await h.e.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
        target: h.e.getEditorState().selection,
        selectionVersion: h.e.getEditorState().stateVersion,
        patch: { character: { bold: true } },
      })
    ).status,
    'committed-with-snapshot',
  );
}
const saved = async (e) => Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
test('real Core state publication: standalone tool invalidates presentation once per state and unsubscribes on dispose', async () => {
  const h = await setup();
  let states = 0;
  const unsubscribe = h.e.registerStateListener(() => states++);
  try {
    const before = h.presentations();
    await h.select(h.rows[1], 0, 2);
    assert(states > 0);
    assert.equal(h.presentations() - before, states);
    h.tool.dispose();
    const disposed = h.presentations();
    await h.select(h.rows[0], 1, 1);
    assert.equal(h.presentations(), disposed);
  } finally {
    unsubscribe();
    await h.close();
  }
});
test('controlled host refresh-required after actual Native commit: distinct Korean status, one dispatch, no focus or automatic retry', async () => {
  let h,
    calls = 0;
  h = await setup('hwp5', {
    dispatchCommand: async (...args) => {
      calls++;
      const r = await h.e.dispatchCommand(...args);
      assert.equal(r.status, 'committed-with-snapshot');
      return { ...r, status: 'committed-refresh-required' };
    },
  });
  try {
    await seed(h);
    await copy(h);
    const rev = h.e.getEditorState().nativeHistoryRevision,
      focus = h.focus();
    await h.tool.action('format-copy');
    assert.equal(calls, 1);
    assert.equal(h.e.getEditorState().nativeHistoryRevision, rev + 1);
    assert.equal(h.focus(), focus);
    assert.equal(h.status.at(-1), '모양이 반영됐습니다. 화면을 새로 확인한 뒤 계속하세요.');
    assert(!h.status.at(-1).includes('적용했습니다'));
  } finally {
    await h.close();
  }
});
test('controlled host dispatch throw: failure prose, byte/history/redo unchanged and later invocation reuses copy', async () => {
  let h,
    fail = true,
    calls = 0;
  h = await setup('hwp5', {
    dispatchCommand: async (...args) => {
      calls++;
      if (fail) throw Error('ControlledHostFailure');
      return h.e.dispatchCommand(...args);
    },
  });
  try {
    await seed(h);
    await h.select(h.rows[1], 0, 2);
    const changed = await h.e.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: h.e.getEditorState().selection,
      selectionVersion: h.e.getEditorState().stateVersion,
      patch: { character: { italic: true } },
    });
    assert.equal(changed.status, 'committed-with-snapshot');
    const redo = await saved(h.e);
    await h.e.dispatchCommand(UNDO_COMMAND, { token: h.e.getEditorState().token });
    await copy(h);
    const before = await saved(h.e),
      state = h.e.getEditorState(),
      focus = h.focus();
    await h.tool.action('format-copy');
    assert.equal(calls, 1);
    assert.equal(h.focus(), focus);
    assert(!h.status.at(-1).includes('ControlledHostFailure'));
    assert(h.status.at(-1).includes('적용할 수 없습니다'));
    assert.deepEqual(await saved(h.e), before);
    assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
    assert.equal(h.e.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
    assert.equal(
      (await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token })).status,
      'committed-with-snapshot',
    );
    assert.deepEqual(await saved(h.e), redo);
    fail = false;
    await h.tool.action('format-copy');
    assert.equal(calls, 2);
    assert.equal(h.status.at(-1), '선택한 지원 항목의 모양을 적용했습니다.');
  } finally {
    await h.close();
  }
});
for (const change of ['dispose', 'document', 'selection-A-B-A'])
  test(
    'controlled delayed dispatch reply/' +
      change +
      ': busy blocks duplicate invocation; late result never steals focus',
    async () => {
      let h,
        enter,
        release,
        calls = 0;
      const entered = new Promise((r) => (enter = r)),
        gate = new Promise((r) => (release = r));
      h = await setup('hwp5', {
        dispatchCommand: async (...args) => {
          calls++;
          const result = await h.e.dispatchCommand(...args);
          enter();
          await gate;
          return result;
        },
      });
      try {
        await seed(h);
        await copy(h);
        const rev = h.e.getEditorState().nativeHistoryRevision,
          focus = h.focus();
        const pending = h.tool.action('format-copy');
        await entered;
        await h.tool.action('format-copy');
        assert.equal(calls, 1);
        if (change === 'dispose') h.tool.dispose();
        if (change === 'document')
          await h.e.load(await saved(h.e), { format: 'hwp5', editable: true });
        if (change === 'selection-A-B-A') {
          await h.select(h.rows[1], 1, 3);
          await h.select(h.rows[1], 0, 2);
        }
        const notices = h.status.length;
        release();
        await pending;
        assert.equal(calls, 1);
        assert.equal(h.focus(), focus);
        if (change === 'dispose') assert.equal(h.status.length, notices, 'no late disposed status');
        if (change !== 'document')
          assert.equal(h.e.getEditorState().nativeHistoryRevision, rev + 1);
      } finally {
        release();
        await h.close();
      }
    },
  );
