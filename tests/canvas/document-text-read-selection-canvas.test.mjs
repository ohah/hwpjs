import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutCreatedTable } from '../../web/preview/created-table-layout.mjs';
import { sameCreatedCell } from '../../web/preview/created-cell-address.mjs';

// Actual direct controller and existing cell geometry; synthetic DOM/model only.
function fixture() {
  let current = true;
  const token = Object.freeze({});
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
    viewActive: () => true,
    viewAllowsPoint: () => false,
    viewAllowsRange: () => false,
    viewAllowsRequest: () => false,
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
    controls: {
      admitDocumentReadSelection: (t) => current && t === token,
      ready: () => true,
      busy: () => busy,
      request: (r) => requests.push(r),
    },
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
    token,
    revoke: () => {
      current = false;
    },
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

test('read-only range selects the exact generated owner while ordinary edit selection stays denied', () => {
  const f = fixture();
  try {
    assert.equal(f.direct.selectTextRange(f.range(), { focusInput: false }), false);
    assert.equal(f.direct.selectDocumentReadRange(f.range(), {}), false);
    assert.equal(f.direct.selectDocumentReadRange(f.range(), f.token), true);
    assert.equal(f.direct.isDocumentReadSelectionCurrent(), true);
    const selection = f.direct.currentFormattingSelection();
    assert.equal(selection.anchor.createdCell.identity, '18446744073709551615');
    assert.equal(selection.anchor.paragraph, undefined);
    assert.equal(f.input.readOnly, true);
    assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [1, 3]);
    assert.deepEqual(f.requests, []);
  } finally {
    f.direct.close();
  }
});
test('read-only range blocks controlled input mutations and revoked proof cannot retain the selection', () => {
  const f = fixture();
  try {
    assert.equal(f.direct.selectDocumentReadRange(f.range(), f.token), true);
    for (const type of ['beforeinput', 'paste', 'cut', 'compositionstart']) {
      const event = new Event(type, { cancelable: true });
      f.input.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true, type);
    }
    assert.deepEqual(f.requests, []);
    f.revoke();
    assert.equal(f.direct.isDocumentReadSelectionCurrent(), false);
    f.direct.reconcilePreviewPolicy();
    assert.equal(f.direct.selectDocumentReadRange(f.range(), f.token), false);
    assert.deepEqual(f.requests, []);
  } finally {
    f.direct.close();
  }
});
test('read permit does not bypass text, unique owner or scalar geometry validation', () => {
  const f = fixture();
  try {
    assert.equal(
      f.direct.selectDocumentReadRange({ ...f.range(), expectedText: 'stale' }, f.token),
      false,
    );
    assert.equal(f.direct.selectDocumentReadRange({ ...f.range(), startUnit: 2 }, f.token), false);
    f.layout.createdCellParagraphs.push({ ...f.layout.createdCellParagraphs[0] });
    assert.equal(f.direct.selectDocumentReadRange(f.range(), f.token), false);
    assert.deepEqual(f.requests, []);
  } finally {
    f.direct.close();
  }
});
