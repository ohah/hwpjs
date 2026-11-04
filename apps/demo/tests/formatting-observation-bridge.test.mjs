import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, createParagraphSelection, getSelectionFormatting } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
const langs = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
const names = [
  '휴먼명조',
  'HCI Poppy',
  '한양신명조',
  '한양신명조',
  '한양신명조',
  '한양신명조',
  '명조',
];
async function setup({ single = false, missingFonts = false, editable = true } = {}) {
  const content = {
    format: 'hwp5',
    characterPropertiesAvailable: true,
    characterFontNameAvailable: true,
    fontFaces: missingFonts
      ? null
      : langs.map((language, i) => ({ language, id: 0, name: names[i] })),
    characterFontReferences: [47, 49].map((id) => ({ id, fontIds: langs.map(() => 0) })),
    characterShapes: [
      { id: 47, height: 1500, bold: false, italic: false },
      { id: 49, height: single ? 1500 : 1300, bold: false, italic: false },
    ],
    paragraphs: [
      {
        section: 0,
        paragraph: 18,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '99' },
        characterRanges: [
          { start: 0, end: 1, charShapeId: 47 },
          { start: 1, end: 2, charShapeId: 49 },
        ],
      },
    ],
  };
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        return { kind: m.kind, content, meta: { application: 'unapplied', changed: false } };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwp5', editable });
  const bridge = createFormattingBridge({ editor, onStatus() {} });
  return {
    editor,
    bridge,
    select: async () =>
      editor.setSelection(
        createParagraphSelection(editor.getEditorState(), {
          section: 0,
          paragraph: 18,
          startUnit: 0,
          endUnit: 2,
        }),
      ),
  };
}
test('공개 Core selector의 실제 mixed 결과를 toolbar 혼합으로 연결', async () => {
  const f = await setup();
  try {
    await f.select();
    assert.equal(getSelectionFormatting(f.editor.getEditorState()).size, 'mixed');
    const p = f.bridge.getPresentation();
    assert.equal(p.fontSizePoints, undefined);
    assert.equal(p.fontSizeStatus, 'mixed');
    assert.equal(p.fontSizeHint, '혼합 크기');
    assert.equal(p.fontName, '휴먼명조');
    assert.match(p.fontNameTitle, /HCI Poppy/);
  } finally {
    await f.editor.dispose();
  }
});
test('공개 단일 원본1500은15pt이고 selection null은 크기미관측', async () => {
  const f = await setup({ single: true });
  try {
    await f.select();
    assert.equal(f.bridge.getPresentation().fontSizePoints, 15);
    assert.equal(f.bridge.getPresentation().fontSizeStatus, 'single');
    await f.editor.setSelection(null);
    const p = f.bridge.getPresentation();
    assert.equal(p.fontSizePoints, undefined);
    assert.equal(p.fontSizeStatus, 'unavailable');
    assert.match(p.fontSizeHint, /미관측/);
    assert.equal(p.fontName, '글꼴 정보 미관측');
  } finally {
    await f.editor.dispose();
  }
});
test('원본 글꼴 자원이 없으면 시스템 기본폰트를 표시하지 않음', async () => {
  const f = await setup({ missingFonts: true });
  try {
    await f.select();
    assert.equal(f.bridge.getPresentation().fontName, '글꼴 정보 미관측');
    assert.equal(f.bridge.getPresentation().fontSizeStatus, 'mixed');
  } finally {
    await f.editor.dispose();
  }
});

test('읽기 전용의 원본 글꼴과 크기는 writer disabled와 독립 표시', async () => {
  const f = await setup({ single: true, editable: false });
  try {
    await f.select();
    const p = f.bridge.getPresentation();

    assert.equal(p.actions['set-font-size'].enabled, false);
    assert.equal(p.fontName, '휴먼명조');
    assert.equal(p.fontSizePoints, 15);
  } finally {
    await f.editor.dispose();
  }
});

test('읽기 전용 mixed 원본은 숫자로 보완하지 않고 혼합 표시', async () => {
  const f = await setup({ editable: false });
  try {
    await f.select();
    const p = f.bridge.getPresentation();
    assert.equal(p.fontSizePoints, undefined);
    assert.equal(p.fontSizeStatus, 'mixed');
    assert.equal(p.fontSizeHint, '혼합 크기');
    assert.equal(p.actions['set-font-size'].enabled, false);
    assert.equal(p.fontName, '휴먼명조');
  } finally {
    await f.editor.dispose();
  }
});
