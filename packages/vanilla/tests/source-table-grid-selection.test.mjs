// Actual Canvas + Surface; synthetic Core/renderer/source. No Native support claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { captureSourceTableGridSelection } from '../../../web/preview/source-table-grid-selection.mjs';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
async function run(format, body, change = () => {}) {
  const f = formattingFixture();
  const paragraphs = f.state().content.paragraphs.map((p, i) => ({
    ...p,
    selectionOwner: null,
    tableCell: { tableNode: 10, listNode: i + 20 },
    ...(format === 'hwp5'
      ? { currentReference: { kind: 'original', section: 0, paragraph: i } }
      : {}),
  }));
  const table = {
    section: 0,
    tableNode: 10,
    rows: 2,
    columns: 2,
    cells: paragraphs.map((p, i) => ({
      listNode: i + 20,
      row: Math.floor(i / 2),
      column: i % 2,
      rowSpan: 1,
      columnSpan: 1,
      width: 100,
      height: 100,
      paragraphs: [p.paragraph],
    })),
  };
  const content = { ...f.state().content, format, limited: false, paragraphs, tables: [table] };
  change(content, f);
  f.install({ content });
  const sourceParagraph = f.renderer.paragraph;
  f.renderer.paragraph = (point) =>
    point?.createdCell
      ? content.paragraphs.find((p) => p.createdCell?.identity === point.createdCell.identity)
      : sourceParagraph(point);
  let dialogListener, observer;
  f.doc.addEventListener = (type, listener) => {
    if (type === 'beforetoggle') dialogListener = listener;
  };
  f.doc.removeEventListener = (type) => {
    if (type === 'beforetoggle') dialogListener = undefined;
  };
  f.dialogEvent = () => dialogListener?.({ target: { tagName: 'DIALOG' } });
  const records = [];
  f.doc.documentElement = {};
  f.doc.defaultView.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      observer = this;
    }
    observe() {}
    takeRecords() {
      return records.splice(0);
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  f.modalMutation = () =>
    records.push({
      type: 'attributes',
      target: { tagName: 'DIALOG' },
      addedNodes: [],
      removedNodes: [],
    });
  const s = createCanvasSurface({ root: f.root, editor: f.editor });
  const select = async (p = 0, start = 1, end = start, endParagraph = p) => {
    f.pointer('pointerdown', p, start);
    if (end !== start || endParagraph !== p) f.pointer('pointermove', endParagraph, end);
    f.pointer('pointerup', endParagraph, end);
    await tick();
  };
  try {
    await select();
    await body(f, s, select, content);
    assert.equal(f.messages.length, f.expectedMessages ?? 0, 'capture adds no Native commands');
  } finally {
    while (f.waits.length) f.reject();
    await s.dispose();
    assert.equal(observer.disconnected, true);
    assert.equal(dialogListener, undefined);
  }
}
for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: view-only grid toggle retires source leases without Native or selection changes`, () =>
    run(format, async (f, s) => {
      const state = f.state(),
        selection = state.selection,
        content = state.content;
      const before = s.captureSourceTableGridSelection();
      assert(before);
      const initial = s.getDisplayOptions();
      assert.equal(initial.showTableGrid, false);
      assert.equal(s.setDisplayOptions({ ...initial, showTableGrid: false }), true);
      assert.equal(s.getDisplayOptions(), initial);
      assert.equal(before.current(), true);
      assert.equal(s.setDisplayOptions({ ...initial, showTableGrid: true }), true);
      assert.equal(before.current(), false);
      const on = s.captureSourceTableGridSelection();
      assert(on);
      assert.equal(on.current(), true);
      assert.equal(s.setDisplayOptions({ ...initial, showTableGrid: false }), true);
      assert.equal(on.current(), false);
      assert.equal(before.current(), false);
      assert(s.captureSourceTableGridSelection());
      assert.equal(f.state(), state);
      assert.equal(f.state().selection, selection);
      assert.equal(f.state().content, content);
      assert.equal(f.messages.length, 0);
    }));
  test(`${format}: source caret/range use actual source address`, () =>
    run(format, async (f, s, select) => {
      for (const end of [1, 3]) {
        await select(0, 1, end);
        const c = s.captureSourceTableGridSelection();
        assert(c);
        assert(Object.isFrozen(c));
        assert.equal(c.state, f.state());
        assert.deepEqual(
          Object.fromEntries(
            ['section', 'tableNode', 'listNode', 'row', 'column', 'rows', 'columns'].map((k) => [
              k,
              c[k],
            ]),
          ),
          { section: 0, tableNode: 10, listNode: 20, row: 0, column: 0, rows: 2, columns: 2 },
        );
        assert.equal(c.current(), true);
        assert.equal(s.captureGeneratedTableGridSelection(), null);
      }
    }));
  test(`${format}: A-B-A, cross-cell range, cancelled composition`, () =>
    run(format, async (f, s, select) => {
      const a = s.captureSourceTableGridSelection();
      assert(a);
      await select(1);
      assert.equal(s.captureSourceTableGridSelection().listNode, 21);
      await select(0);
      assert.equal(a.current(), false);
      // Canvas clamps a drag into another cell to its original source owner.
      await select(0, 1, 2, 1);
      assert.equal(s.captureSourceTableGridSelection()?.listNode, 20);
      assert.equal(f.state().selection.paragraph, 0);
      await select();
      const b = s.captureSourceTableGridSelection();
      assert(b);
      f.input().dispatchEvent(new Event('compositionstart'));
      assert.equal(s.captureSourceTableGridSelection(), null);
      f.input().dispatchEvent(new Event('compositionend'));
      await tick();
      assert.equal(b.current(), false);
    }));
  test(`${format}: modal reentry including unobserved entry/exit`, () =>
    run(format, async (f, s) => {
      const a = s.captureSourceTableGridSelection();
      assert(a);
      f.setDialogs([f.dialog()]);
      assert.equal(a.current(), false);
      assert.equal(s.captureSourceTableGridSelection(), null);
      f.setDialogs([]);
      assert.equal(a.current(), false);
      const b = s.captureSourceTableGridSelection();
      assert(b);
      f.dialogEvent();
      f.setDialogs([f.dialog()]);
      f.setDialogs([]);
      assert.equal(b.current(), false);
      const c = s.captureSourceTableGridSelection();
      assert(c);
      f.modalMutation();
      assert.equal(c.current(), false);
      assert(s.captureSourceTableGridSelection());
    }));
  test(`${format}: source pointer/token and Canvas range must agree`, () =>
    run(format, async (f, s) => {
      const a = s.captureSourceTableGridSelection();
      assert(a);
      f.state().selection = { ...f.state().selection };
      assert.equal(a.current(), false);
      const b = s.captureSourceTableGridSelection();
      assert(b);
      f.state().token = { ...f.state().token, viewRevision: 90 };
      assert.equal(b.current(), false);
      assert.equal(s.captureSourceTableGridSelection(), null);
      f.state().token = { ...f.state().token, viewRevision: f.state().viewRevision };
      for (const patch of [
        { owner: 'section:0:body' },
        { paragraph: 1 },
        { startUnit: 0 },
        { viewRevision: 99 },
      ]) {
        const selection = f.state().selection;
        f.state().selection = { ...selection, ...patch };
        assert.equal(s.captureSourceTableGridSelection(), null);
        f.state().selection = selection;
      }
    }));
  test(`${format}: model, readonly, state replacement, lease revocation/disposal`, () =>
    run(format, async (f, s, select) => {
      let c = s.captureSourceTableGridSelection();
      assert(c);
      f.renderer.historyModelMatches = () => false;
      assert.equal(c.current(), false);
      assert.equal(s.captureSourceTableGridSelection(), null);
      f.renderer.historyModelMatches = () => true;
      for (const location of [f.state().capabilities, f.state().content]) {
        c = s.captureSourceTableGridSelection();
        assert(c);
        location.readOnly = true;
        assert.equal(c.current(), false);
        assert.equal(s.captureSourceTableGridSelection(), null);
        location.readOnly = false;
        assert.equal(c.current(), false);
      }
      c = s.captureSourceTableGridSelection();
      assert(c);
      f.install({ operationRevision: 2 });
      await tick();
      assert.equal(c.current(), false);
      await select();
      c = s.captureSourceTableGridSelection();
      assert(c);
      f.revoke();
      assert.equal(c.current(), false);
      assert.equal(s.captureSourceTableGridSelection(), null);
      await s.dispose();
      assert.equal(c.current(), false);
    }));
  test(`${format}: JSON cell data cannot override renderer source owner`, () =>
    run(format, async (f, s) => {
      const c = s.captureSourceTableGridSelection();
      assert(c);
      const original = f.renderer.paragraph;
      f.renderer.paragraph = (point) => {
        const p = original(point);
        return p && { ...p, tableCell: { tableNode: 10, listNode: 21 } };
      };
      assert.equal(c.current(), false);
      assert.equal(s.captureSourceTableGridSelection(), null);
    }));
}
for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: pending history and paint cannot lease the old selection`, () =>
    run(format, async (f, s) => {
      const c = s.captureSourceTableGridSelection();
      assert(c);
      assert.equal(s.requestHistory('undo'), true);
      await tick();
      assert.equal(c.current(), false);
      assert.equal(s.captureSourceTableGridSelection(), null);
      f.expectedMessages = 1;
      f.ack();
      await tick();
      assert.equal(c.current(), false);
      f.frame();
      await tick();
      assert.equal(c.current(), false);
    }));
  test(`${format}: uncommitted textarea and input intent invalidate without rebasing`, () =>
    run(format, async (f, s) => {
      const c = s.captureSourceTableGridSelection();
      assert(c);
      const before = new Event('beforeinput', { cancelable: true });
      Object.assign(before, { inputType: 'insertText', data: 'Q', isComposing: false });
      f.input().dispatchEvent(before);
      f.input().value = 'AQBCD';
      assert.equal(c.current(), false);
      assert.equal(s.captureSourceTableGridSelection(), null);
      f.input().value = 'ABCD';
      assert.equal(c.current(), false);
    }));
}
const refusals = [
  [
    'generated',
    (c) => {
      c.paragraphs[0].createdCell = { identity: '9', row: 0, column: 0 };
    },
  ],
  [
    'body',
    (c) => {
      delete c.paragraphs[0].tableCell;
      c.paragraphs[0].selectionOwner = 'section:0:body';
    },
  ],
  [
    'drawing',
    (c) => {
      c.paragraphs[0].drawingText = { drawingNode: 4, listNode: 20 };
    },
  ],
  [
    'partial',
    (c) => {
      c.tables[0].partial = true;
    },
  ],
  [
    'limited',
    (c) => {
      c.limited = true;
    },
  ],
  [
    'window',
    (c) => {
      c.window = {};
    },
  ],
  [
    'merged',
    (c) => {
      c.tables[0].cells[0].columnSpan = 2;
    },
  ],
  [
    'missing span',
    (c) => {
      delete c.tables[0].cells[0].rowSpan;
    },
  ],
  [
    'membership',
    (c) => {
      c.tables[0].cells[0].paragraphs = [1];
    },
  ],
  [
    'duplicate cell',
    (c) => {
      c.tables[0].cells.push({ ...c.tables[0].cells[0] });
    },
  ],
  [
    'duplicate table',
    (c) => {
      c.tables.push({ ...c.tables[0] });
    },
  ],
  [
    'duplicate source',
    (c) => {
      c.paragraphs.push({ ...c.paragraphs[0] });
    },
  ],
  [
    'foreign reference',
    (c) => {
      c.paragraphs[0].currentReference = { kind: 'created' };
    },
  ],
  [
    'source mapping',
    (c) => {
      c.paragraphs[0].sourceOffsets = [0, 1, 2, 3, 4];
    },
  ],
];
for (const [name, mutate] of refusals)
  test(`source refusal: ${name}`, () =>
    run(
      'hwp5',
      async (f, s) => {
        assert.equal(s.captureSourceTableGridSelection(), null);
      },
      mutate,
    ));
test('own uint32 numbers, positive dimensions, safe area and stale DTO', () =>
  run('hwpx', async (f, s, select, content) => {
    for (const [object, key, value] of [
      [content.tables[0], 'rows', 0],
      [content.tables[0], 'columns', -0],
      [content.tables[0], 'columns', 0x100000000],
      [content.tables[0], 'rows', 1.5],
      [content.tables[0].cells[0], 'row', -0],
      [content.tables[0].cells[0], 'column', 2],
      [content.paragraphs[0].tableCell, 'listNode', 0x100000000],
    ]) {
      const before = object[key];
      object[key] = value;
      assert.equal(s.captureSourceTableGridSelection(), null, key + ':' + value);
      object[key] = before;
    }
    const table = content.tables[0];
    table.rows = table.columns = 0xffffffff;
    assert.equal(s.captureSourceTableGridSelection(), null);
    table.rows = table.columns = 2;
    content.tables[0] = Object.create({ ...table });
    assert.equal(s.captureSourceTableGridSelection(), null);
    content.tables[0] = table;
    const c = s.captureSourceTableGridSelection();
    assert(c);
    table.cells[0].row = 1;
    assert.equal(c.current(), false);
    table.cells[0].row = 0;
    assert.equal(c.current(), false);
    await select();
    assert(s.captureSourceTableGridSelection());
  }));
test('helper fails closed on throw and permanently latches invalidity', () =>
  run('hwpx', async (f, s, select, content) => {
    let active = true;
    const args = {
      content,
      paragraph: content.paragraphs[0],
      point: { section: 0, paragraph: 0 },
      current: () => active,
    };
    const c = captureSourceTableGridSelection(args);
    assert(c);
    active = false;
    assert.equal(c.current(), false);
    active = true;
    assert.equal(c.current(), false);
    assert.equal(
      captureSourceTableGridSelection({
        ...args,
        current() {
          throw Error('disposed');
        },
      }),
      null,
    );
  }));
