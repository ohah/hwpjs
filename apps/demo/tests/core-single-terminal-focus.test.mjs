// 실제 Core/앱과 통제 runtime, 실제 Surface/Canvas와 통제 renderer의 소스 회귀다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
import { createCanvasSurface } from '../../../packages/vanilla/src/surface.ts';
import {
  formattingFixture,
  tick,
} from '../../../packages/vanilla/tests/multirange-formatting-fixture.mjs';
async function setup() {
  const content = {
    format: 'hwp5',
    paragraphAlignmentAvailable: true,
    characterPropertiesAvailable: true,
    characterShapes: [{ id: 0, bold: false, italic: false, height: 1200 }],
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '99' },
        characterRanges: [{ start: 0, end: 2, charShapeId: 0 }],
        paragraphShape: { alignment: 1 },
      },
    ],
  };
  const calls = [];
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        calls.push(m);
        return { kind: m.kind, content, meta: { application: 'applied', changed: true } };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwp5' });
  await editor.setSelection({
    ...editor.getEditorState().token,
    coordinateSpace: 'display',
    format: 'hwp5',
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 2,
    affinity: 'forward',
  });
  return { editor, calls };
}
for (const kind of [
  'committed',
  'known-no-op',
  'status-reentry',
  'result-reentry',
  'host-replaced',
  'host-getter-reentry',
  'disposed',
  'rejected',
  'refresh',
])
  test('CoreSingle 완료 포커스: ' + kind, async () => {
    const f = await setup();
    let currentOverride;
    let focuses = 0,
      host = {},
      result;
    const original = f.editor.dispatchCommand.bind(f.editor);
    const facade = {
      getEditorState: () => currentOverride ?? f.editor.getEditorState(),
      async dispatchCommand(...args) {
        const r = await original(...args);
        result = r;
        return kind === 'known-no-op'
          ? { ...r, status: 'known-no-op' }
          : kind === 'rejected'
            ? { ...r, status: 'rejected-unapplied', error: '거부' }
            : kind === 'refresh'
              ? { ...r, status: 'committed-refresh-required' }
              : r;
      },
    };
    let bridge;
    bridge = createFormattingBridge({
      editor: facade,
      getSurfaceFormattingHost: () => {
        if (kind === 'host-getter-reentry' && result)
          currentOverride = { ...f.editor.getEditorState(), selection: null };
        return host;
      },
      onStatus: () => {
        if (kind === 'status-reentry')
          currentOverride = { ...f.editor.getEditorState(), selection: null };
      },
      onResult: () => {
        if (kind === 'result-reentry')
          currentOverride = { ...f.editor.getEditorState(), selection: null };
        if (kind === 'host-replaced') host = {};
        if (kind === 'disposed') bridge.dispose();
      },
      onFocus: () => focuses++,
    });
    try {
      await bridge.action({ command: 'align-distribute' });
      assert.equal(focuses, ['committed', 'known-no-op'].includes(kind) ? 1 : 0);
      assert.equal(f.calls.filter((x) => x.kind === 'paragraph-alignment').length, 1);
    } finally {
      await f.editor.dispose();
    }
  });
test('실제 Surface: 동기 상태 관측 후 지연 paint에서도 텍스트 focus는 허용한다', async () => {
  const f = formattingFixture();
  const s = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (m) => f.reports.push(m),
  });
  try {
    f.pointer('pointerdown', 0, 1);
    f.pointer('pointerup', 0, 1);
    await tick();
    let shows = 0;
    f.renderer.isSelectionPainted = () => false;
    f.renderer.show = () => {
      shows++;
    };
    f.doc.activeElement = { tagName: 'SUMMARY' };
    const selected = f.state().selection;
    assert(selected);
    f.install({
      operationRevision: f.state().operationRevision + 1,
      viewRevision: f.state().viewRevision + 1,
      selection: {
        ...selected,
        operationRevision: f.state().operationRevision + 1,
        viewRevision: f.state().viewRevision + 1,
      },
    });
    assert.equal(shows, 1);
    assert.equal(s.focus(), true);
    assert.equal(f.doc.activeElement, f.input());
    f.setDialogs([f.dialog()]);
    assert.equal(s.focus(), false);
    f.setDialogs([]);
    f.revoke();
    assert.equal(s.focus(), false);
  } finally {
    await s.dispose();
  }
});

for (const mode of ['throw', 'reentry'])
  test('요청 전 호스트 조회의 예외·동기 재진입: ' + mode, async () => {
    const f = await setup();
    let bridge,
      nested,
      focuses = 0,
      visits = 0;
    const statuses = [];
    const host = {};
    bridge = createFormattingBridge({
      editor: f.editor,
      getSurfaceFormattingHost: () => {
        visits++;
        if (mode === 'throw') throw Error('통제 호스트 조회 오류');
        if (!nested) nested = bridge.action({ command: 'align-center' });
        return host;
      },
      onStatus: (message) => statuses.push(message),
      onFocus: () => focuses++,
    });
    try {
      assert.equal(await bridge.action({ command: 'align-distribute' }), true);
      if (nested) await nested;
      assert.equal(
        f.calls.filter((m) => m.kind === 'paragraph-alignment').length,
        mode === 'throw' ? 0 : 1,
      );
      assert.equal(focuses, mode === 'throw' ? 0 : 1);
      assert(visits > 0);
      if (mode === 'throw') assert.equal(statuses.at(-1), '통제 호스트 조회 오류');
      else assert(statuses.includes('FormattingPending'));
      assert.notEqual(
        bridge.getPresentation().actions?.['align-left']?.reason,
        'FormattingPending',
      );
    } finally {
      await f.editor.dispose();
    }
  });
