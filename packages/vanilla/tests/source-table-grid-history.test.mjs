// Actual Surface/Canvas + real source grid port; synthetic Core and renderer, no Native claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { createSourceTableGridPort } from '../../../apps/demo/src/source-table-grid-port.ts';
import { sourceTableGridHistory } from '../../../web/preview/source-table-grid-history.mjs';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
function content(format, rows = 2, columns = 2) {
  const cells = Array.from({ length: rows * columns }, (_, i) => ({
    listNode: 20 + i * 10,
    row: Math.floor(i / columns),
    column: i % columns,
    rowSpan: 1,
    columnSpan: 1,
    width: 100,
    height: 100,
    paragraphs: [i + 1],
  }));
  return {
    format,
    limited: false,
    sourceTableGridAvailable: true,
    tables: [{ section: 0, tableNode: 10, rows, columns, cells }],
    paragraphs: cells.map((c, i) => ({
      section: 0,
      paragraph: i + 1,
      text: c.row === 0 ? 'AB' : rows === 3 && c.row === 1 ? '' : 'CD',
      editable: true,
      selectable: true,
      selectionOwner: null,
      tableCell: { tableNode: 10, listNode: c.listNode },
      ...(format === 'hwp5'
        ? { currentReference: { kind: 'original', section: 0, paragraph: i + 1 } }
        : {}),
    })),
  };
}
async function run(format, body) {
  const f = formattingFixture();
  f.install({
    content: content(format),
    nativeHistoryRevision: 0,
    nativeHistoryRevisions: [0],
    capabilities: { ...f.state().capabilities, sourceTableGridAvailable: true },
  });
  const original = f.state().content;
  const s = createCanvasSurface({ root: f.root, editor: f.editor });
  const command = { id: Symbol('source-grid'), name: 'source-table-grid' };
  f.editor.update = async () => {};
  f.editor.dispatchCommand = async (_, request) => {
    f.dispatched = request;
    const state = f.install({
      content: content(format, 3),
      selection: undefined,
      operationRevision: f.state().operationRevision + 1,
      viewRevision: f.state().viewRevision + 1,
      nativeHistoryRevision: 1,
      nativeHistoryRevisions: [1, 0],
    });
    return {
      state,
      status: 'committed-with-snapshot',
      changed: true,
      reply: { historyRevision: 1, historyRevisions: [1, 0], meta: { changed: true } },
    };
  };
  const port = createSourceTableGridPort(
    f.editor,
    { EDIT_SOURCE_TABLE_GRID_COMMAND: command },
    () => s,
  );
  const select = async (line = 0) => {
    f.pointer('pointerdown', line, 0);
    f.pointer('pointerup', line, 0);
    await tick();
  };
  try {
    await select();
    await body(f, s, port, select, original);
  } finally {
    while (f.waits.length) f.reject();
    port.dispose();
    await s.dispose();
  }
}
for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: SOURCE insert/save/undo/save/redo preserves input authority`, () =>
    run(format, async (f, s, port, select, original) => {
      const capture = port.capture();
      assert.equal(capture.reason, null);
      const answer = await port.apply(capture, 'generated-table-insert-row');
      assert.equal(answer.status, 'committed-with-snapshot');
      const inserted = f.state().content;
      f.install({ savedOperationRevision: f.state().operationRevision });
      // Save does not create another native revision. Restore Core's known baseline selection on Undo.
      assert.equal(s.requestHistory('undo'), true);
      await tick();
      const token = { ...f.state().token, operationRevision: 3, viewRevision: 3 };
      f.ack(
        {
          content: original,
          operationRevision: 3,
          viewRevision: 3,
          nativeHistoryRevision: 0,
          nativeHistoryRevisions: [0, 1],
          selection: {
            ...token,
            coordinateSpace: 'display',
            format,
            owner: 'section:0:table:10:list:20',
            section: 0,
            paragraph: 1,
            startUnit: 0,
            endUnit: 0,
            affinity: 'forward',
          },
        },
        { reply: { changed: true, historyRevision: 0, historyRevisions: [0, 1] } },
      );
      await tick();
      f.frame();
      await tick();
      f.install({ savedOperationRevision: f.state().operationRevision });
      assert.equal(s.requestHistory('redo'), true);
      await tick();
      f.ack(
        {
          content: inserted,
          operationRevision: 4,
          viewRevision: 4,
          selection: undefined,
          nativeHistoryRevision: 1,
          nativeHistoryRevisions: [1, 0],
        },
        { reply: { changed: true, historyRevision: 1, historyRevisions: [1, 0] } },
      );
      await tick();
      f.frame();
      await tick();
      assert.equal(f.canvas().dataset.selectionAuthority, 'current');
      assert.equal(f.input().disabled, false);
      assert.equal(f.canvas().dataset.caret, '0:1:0');
      assert.equal(s.focus(), true);
      const input = f.input(),
        before = new Event('beforeinput', { cancelable: true });
      Object.assign(before, { inputType: 'insertText', data: 'Q', isComposing: false });
      input.dispatchEvent(before);
      if (!before.defaultPrevented) {
        input.value = 'Q' + input.value;
        input.setSelectionRange(1, 1);
        const event = new Event('input');
        Object.assign(event, { inputType: 'insertText', data: 'Q', isComposing: false });
        input.dispatchEvent(event);
      }
      await tick();
      assert.equal(f.messages.at(-1).kind, 'splice');
      f.ack({
        content: {
          ...inserted,
          paragraphs: inserted.paragraphs.map((p, i) => (i === 0 ? { ...p, text: 'QAB' } : p)),
        },
        operationRevision: 5,
        viewRevision: 5,
        nativeHistoryRevision: 2,
        nativeHistoryRevisions: [2, 0, 1],
      });
      await tick();
      f.frame();
      await tick();
      await select(2); // a subsequent real Canvas pointer path remains usable
      assert.equal(f.state().selection.paragraph, 3);
      assert.equal(f.input().disabled, false);
    }));
}
function state(format, model, nativeRevision, operationRevision) {
  const token = {
    editorId: 'test',
    documentId: 'doc',
    generation: 1,
    operationRevision,
    viewRevision: operationRevision,
  };
  return {
    ...token,
    token,
    stateVersion: operationRevision,
    status: 'ready',
    content: model,
    nativeHistoryRevision: nativeRevision,
    nativeHistoryRevisions: nativeRevision === 0 ? [0] : [1, 0],
  };
}
function mapping(format, action = 'insert-row', index = 1) {
  const rowAxis = action.endsWith('row'),
    insert = action.startsWith('insert');
  const before = state(format, content(format), 0, 1);
  const after = state(
    format,
    content(format, rowAxis ? (insert ? 3 : 1) : 2, rowAxis ? 2 : insert ? 3 : 1),
    1,
    2,
  );
  const p = before.content.paragraphs[3];
  before.selection = {
    ...before.token,
    coordinateSpace: 'display',
    format,
    owner: `section:0:table:10:list:${p.tableCell.listNode}`,
    section: 0,
    paragraph: p.paragraph,
    startUnit: 1,
    endUnit: 2,
    affinity: 'backward',
  };
  return {
    before,
    after,
    request: { section: 0, tableNode: 10, expectedRows: 2, expectedColumns: 2, action, index },
  };
}
for (const format of ['hwp5', 'hwpx']) {
  for (const action of ['insert-row', 'insert-column', 'delete-row', 'delete-column']) {
    test(`${format}: ${action} maps logical cell to actual after paragraph/list, preserving affinity`, () => {
      const args = mapping(format, action);
      const value = sourceTableGridHistory(args);
      assert(value);
      const removed = action.startsWith('delete');
      const row = action.endsWith('row') ? (removed ? 0 : 2) : 1;
      const column = action.endsWith('column') ? (removed ? 0 : 2) : 1;
      const cell = args.after.content.tables[0].cells.find(
        (c) => c.row === row && c.column === column,
      );
      assert.equal(value.afterSelection.focus.paragraph, cell.paragraphs[0]);
      assert.equal(value.afterSelection.anchor.unit, removed ? 0 : 2);
      assert.equal(value.afterSelection.focus.unit, removed ? 0 : 1);
      assert.equal(value.beforeSelection.focus.paragraph, 4);
    });
  }
}
const failures = [
  [
    'foreign document',
    (a) => {
      a.after.documentId = a.after.token.documentId = 'other';
    },
  ],
  [
    'stale Core token',
    (a) => {
      a.after.token.viewRevision = 9;
    },
  ],
  [
    'stale selection token',
    (a) => {
      a.before.selection.viewRevision = 9;
    },
  ],
  [
    'same native revision',
    (a) => {
      a.after.nativeHistoryRevision = 0;
    },
  ],
  [
    'unreachable before revision',
    (a) => {
      a.after.nativeHistoryRevisions = [1];
    },
  ],
  [
    'duplicate revision',
    (a) => {
      a.after.nativeHistoryRevisions = [1, 0, 0];
    },
  ],
  [
    'wrong expected dimensions',
    (a) => {
      a.request.expectedRows = 3;
    },
  ],
  [
    'unproven structural result',
    (a) => {
      a.after.content.tables[0].rows = 4;
    },
  ],
  [
    'missing source cell owner',
    (a) => {
      delete a.after.content.paragraphs[5].tableCell;
    },
  ],
  [
    'merged destination',
    (a) => {
      a.after.content.tables[0].cells[5].rowSpan = 2;
    },
  ],
  [
    'changed surviving text',
    (a) => {
      a.after.content.paragraphs[5].text = 'different';
    },
  ],
  [
    'generated source',
    (a) => {
      a.before.content.paragraphs[3].createdCell = { identity: '7', row: 1, column: 1 };
    },
  ],
  [
    'partial source',
    (a) => {
      a.before.content.tables[0].partial = true;
    },
  ],
  [
    'wrong selected owner',
    (a) => {
      a.before.selection.owner = 'section:0:body';
    },
  ],
];
for (const [name, mutate] of failures)
  test(`refuse history mapping: ${name}`, () => {
    const args = mapping('hwp5');
    mutate(args);
    assert.equal(sourceTableGridHistory(args), null);
  });
for (const [name, invalidate] of [
  [
    'new Core observation',
    (f, _result) => {
      f.install({ savedOperationRevision: 99 });
    },
  ],
  [
    'wrong result revision',
    (f, result) => {
      result.reply.historyRevision = 99;
    },
  ],
  [
    'unapplied result',
    (f, result) => {
      result.status = 'rejected-unapplied';
    },
  ],
  [
    'no Native change',
    (f, result) => {
      result.changed = false;
    },
  ],
  [
    'revoked Surface',
    (f) => {
      f.revoke();
    },
  ],
])
  test(`Surface history receipt rejects ${name}`, () =>
    run('hwpx', async (f, s) => {
      const capture = s.captureSourceTableGridSelection();
      assert(capture);
      const request = {
        section: 0,
        tableNode: 10,
        expectedRows: 2,
        expectedColumns: 2,
        action: 'insert-row',
        index: 1,
      };
      const result = await f.editor.dispatchCommand(null, request);
      invalidate(f, result);
      assert.equal(capture.recordHistory(result, request), false);
      assert.equal(capture.recordHistory(result, request), false);
    }));

for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: same-section ordinal survives complete TABLE/list/paragraph renumbering`, () => {
    const args = mapping(format);
    // Another source table precedes the selected table in both snapshots, also renumbered.
    args.before.content.tables.unshift({
      section: 0,
      tableNode: 2,
      rows: 1,
      columns: 1,
      cells: [],
    });
    args.after.content.tables.unshift({ section: 0, tableNode: 4, rows: 1, columns: 1, cells: [] });
    args.after.content.tables[1].tableNode = 100;
    for (const cell of args.after.content.tables[1].cells) {
      cell.listNode += 200;
      cell.paragraphs = cell.paragraphs.map((p) => p + 300);
    }
    for (const p of args.after.content.paragraphs) {
      p.paragraph += 300;
      p.tableCell.tableNode = 100;
      p.tableCell.listNode += 200;
      if (p.currentReference)
        p.currentReference = { ...p.currentReference, paragraph: p.paragraph };
    }
    const value = sourceTableGridHistory(args);
    assert(value);
    assert.equal(value.beforeSelection.focus.paragraph, 4);
    assert.equal(value.afterSelection.focus.paragraph, 306);
    for (const invalidate of [
      (a) => a.after.content.tables.push({ section: 0, tableNode: 999, cells: [] }),
      (a) => a.after.content.tables.splice(0, 1),
      (a) => {
        a.after.content.tables[0].tableNode = 100;
      },
      (a) => {
        a.after.content.paragraphs[5].tableCell.tableNode = 10;
      },
      (a) => {
        a.after.content.paragraphs[5].tableCell.listNode = 70;
      },
    ]) {
      const bad = structuredClone(args);
      invalidate(bad);
      assert.equal(sourceTableGridHistory(bad), null);
    }
  });
}
