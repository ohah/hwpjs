import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutCreatedTable } from '../../web/preview/created-table-layout.mjs';
import { sameCreatedCell } from '../../web/preview/created-cell-address.mjs';

// Actual direct controller and existing cell geometry; synthetic DOM/model only.
function fixture() {
  const doc = new EventTarget();
  doc.activeElement = null;
  doc.defaultView = Object.assign(new EventTarget(), {
    AbortController,
    navigator: { platform: 'MacIntel' },
  });
  class Node extends EventTarget {
    ownerDocument = doc;
    style = {};
    dataset = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    disabled = false;
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 500;
    clientHeight = 400;
    setAttribute() {}
    removeAttribute() {}
    getRootNode() {
      return doc;
    }
    setSelectionRange(a, b, direction = 'forward') {
      this.selectionStart = a;
      this.selectionEnd = b;
      this.selectionDirection = direction;
    }
    focus() {
      doc.activeElement = this;
      this.dispatchEvent(new Event('focus'));
    }
    blur() {
      doc.activeElement = null;
      this.dispatchEvent(new Event('blur'));
    }
    scrollIntoView() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, bottom: 400, width: 500, height: 400 };
    }
    hasPointerCapture() {
      return false;
    }
  }
  const flow = layoutCreatedTable(
    {
      section: 2,
      identity: '18446744073709551615',
      rows: 1,
      columns: 1,
      resources: { character: 7 },
      cells: [{ row: 0, column: 0, width: 14400, height: 1800, text: '앞😀뒤' }],
    },
    (text) => ({ width: [...text].length * 8, height: 16 }),
  );
  const layout = { ...flow, createdCellParagraphs: flow.paragraphs };
  const canvas = new Node(),
    input = new Node(),
    viewport = new Node();
  const selections = [],
    requests = [];
  let busy = false,
    fallback = false;
  const renderer = {
    layout: () => layout,
    paragraph(point) {
      if (fallback) return { section: 2, paragraph: 9, text: '앞😀뒤', editable: true };
      return layout.createdCellParagraphs.find((row) => sameCreatedCell(row, point));
    },
    onGeometry() {},
    select() {},
    preview() {},
  };
  const direct = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    controls: { ready: () => true, busy: () => busy, request: (r) => requests.push(r) },
    note: { textContent: '' },
    environment: { ownerDocument: doc },
    onCommittedSelection: (selection) => selections.push(selection),
  });
  const range = () => ({
    section: 2,
    createdCell: { identity: '18446744073709551615', row: 0, column: 0 },
    startUnit: 1,
    endUnit: 3,
    expectedText: '앞😀뒤',
  });
  return {
    direct,
    input,
    layout,
    selections,
    requests,
    range,
    setBusy: (value) => {
      busy = value;
    },
    setFallback: (value) => {
      fallback = value;
    },
  };
}
test('direct search range keeps current generated-cell identity without inventing a paragraph index', () => {
  const f = fixture();
  try {
    assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), true);
    const selection = f.direct.currentFormattingSelection();
    assert.equal(selection.anchor.createdCell.identity, '18446744073709551615');
    assert.equal(selection.anchor.paragraph, undefined);
    assert.equal(selection.anchor.unit, 1);
    assert.equal(selection.focus.unit, 3);
    assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [1, 3]);
    assert.deepEqual(f.requests, []);
  } finally {
    f.direct.close();
  }
});
test('direct generated-cell search preserves backward affinity and existing canonical selection publication', () => {
  const f = fixture();
  try {
    assert.equal(
      f.direct.selectTextRange({ ...f.range(), affinity: 'backward' }, { focusInput: false }),
      true,
    );
    const selection = f.direct.currentFormattingSelection();
    assert.equal(selection.anchor.unit, 3);
    assert.equal(selection.focus.unit, 1);
    assert.equal(f.input.selectionDirection, 'backward');
    assert.equal(f.selections.at(-1).anchor.createdCell.identity, '18446744073709551615');
  } finally {
    f.direct.close();
  }
});
test('duplicate generated owners cannot succeed by using the renderer first match', () => {
  const f = fixture();
  try {
    assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), true);
    const before = f.direct.currentFormattingSelection(),
      count = f.selections.length;
    f.layout.createdCellParagraphs.push({ ...f.layout.createdCellParagraphs[0] });
    assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), false);
    assert.deepEqual(f.direct.currentFormattingSelection(), before);
    assert.equal(f.selections.length, count);
  } finally {
    f.direct.close();
  }
});
test('cell identity confusion, stale source text and split scalar refuse without publication', () => {
  const f = fixture();
  try {
    for (const fields of [
      { paragraph: 9 },
      { expectedText: 'stale' },
      { startUnit: 2 },
      { endUnit: 0xffffffff },
      { createdCell: { identity: '18446744073709551616', row: 0, column: 0 } },
      { createdCell: { identity: 9007199254740992, row: 0, column: 0 } },
      { createdCell: { identity: '18446744073709551615', row: 0xffffffff, column: 0 } },
    ])
      assert.equal(
        f.direct.selectTextRange({ ...f.range(), ...fields }, { focusInput: false }),
        false,
      );
    assert.equal(f.direct.currentFormattingSelection(), null);
    assert.equal(f.selections.length, 0);
    assert.deepEqual(f.requests, []);
  } finally {
    f.direct.close();
  }
});
test('renderer fallback, missing caret geometry and busy input cannot admit a generated-cell range', () => {
  const f = fixture();
  try {
    f.setFallback(true);
    assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), false);
    f.setFallback(false);
    f.setBusy(true);
    assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), false);
    f.setBusy(false);
    f.layout.rows = [];
    assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), false);
    assert.equal(f.direct.currentFormattingSelection(), null);
    assert.equal(f.selections.length, 0);
  } finally {
    f.direct.close();
  }
});

test('closed direct controller cannot revive a search range or publish another selection', () => {
  const f = fixture();
  f.direct.close();
  const count = f.selections.length;
  assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), false);
  assert.equal(f.selections.length, count);
});
