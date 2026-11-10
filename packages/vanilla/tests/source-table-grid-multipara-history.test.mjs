// Actual Surface/Canvas, synthetic Core/renderer. No XML parser or Native execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceTableGridHistory } from '../../../web/preview/source-table-grid-history.mjs';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';

const actions = ['insert-row', 'insert-column', 'delete-row', 'delete-column'];
function model(format, action, index = 1) {
  const after = !!action,
    rowAxis = action?.endsWith('row'),
    insert = action?.startsWith('insert');
  const rows = 3 + (after && rowAxis ? (insert ? 1 : -1) : 0);
  const columns = 3 + (after && !rowAxis ? (insert ? 1 : -1) : 0);
  const tableNode = after ? 100 : 10;
  const cells = [],
    paragraphs = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const axis = rowAxis ? row : column;
      const fresh = after && insert && axis === index;
      const originalAxis = !after
        ? axis
        : insert
          ? axis - (axis > index ? 1 : 0)
          : axis + (axis >= index ? 1 : 0);
      const originalRow = rowAxis ? originalAxis : row;
      const originalColumn = rowAxis ? column : originalAxis;
      const cell = {
        listNode: (after ? 200 : 20) + cells.length * 10,
        row,
        column,
        rowSpan: 1,
        columnSpan: 1,
        paragraphs: [],
      };
      for (let ordinal = 0; ordinal < (fresh ? 1 : 3); ordinal++) {
        const paragraph = (after ? 1000 : 1) + paragraphs.length;
        cell.paragraphs.push(paragraph);
        paragraphs.push({
          section: 0,
          paragraph,
          text: fresh ? '' : `${originalRow}:${originalColumn}:${ordinal} 한😀글`,
          editable: true,
          selectable: true,
          selectionOwner: null,
          tableCell: { tableNode, listNode: cell.listNode },
          ...(format === 'hwp5'
            ? { currentReference: { kind: 'original', section: 0, paragraph } }
            : {}),
        });
      }
      cells.push(cell);
    }
  return {
    format,
    limited: false,
    sourceTableGridAvailable: true,
    paragraphs,
    tables: [
      { section: 0, tableNode: after ? 4 : 2, rows: 1, columns: 1, cells: [] },
      { section: 0, tableNode, rows, columns, cells },
    ],
  };
}
function state(content, revision) {
  const token = {
    editorId: 'test',
    documentId: 'doc',
    generation: 1,
    operationRevision: revision + 1,
    viewRevision: revision + 1,
  };
  return {
    ...token,
    token,
    stateVersion: revision + 1,
    status: 'ready',
    content,
    nativeHistoryRevision: revision,
    nativeHistoryRevisions: revision ? [1, 0] : [0],
  };
}
function scenario(format, action, ordinal = 2, affinity = 'backward', index = 1) {
  const before = state(model(format), 0),
    after = state(model(format, action, index), 1);
  const cell = before.content.tables[1].cells[4]; // selected logical cell (1,1)
  const paragraph = before.content.paragraphs.find((p) => p.paragraph === cell.paragraphs[ordinal]);
  before.selection = {
    ...before.token,
    coordinateSpace: 'display',
    format,
    owner: `section:0:table:10:list:${cell.listNode}`,
    section: 0,
    paragraph: paragraph.paragraph,
    startUnit: 1,
    endUnit: 3,
    affinity,
  };
  const removed = action.startsWith('delete') && index === 1;
  const nextAxis = action.startsWith('insert') ? (index <= 1 ? 2 : 1) : index === 0 ? 0 : 1;
  const row = action.endsWith('row') ? nextAxis : 1;
  const column = action.endsWith('column') ? nextAxis : 1;
  const destination = after.content.tables[1].cells.find(
    (c) => c.row === row && c.column === column,
  );
  return {
    before,
    after,
    request: { section: 0, tableNode: 10, expectedRows: 3, expectedColumns: 3, action, index },
    expected: { paragraph: destination.paragraphs[removed ? 0 : ordinal], removed },
  };
}
function assertMapping(a) {
  const value = sourceTableGridHistory(a);
  assert(value, 'multi-paragraph cell must produce a proven bookmark');
  const backward = a.before.selection.affinity === 'backward';
  assert.deepEqual(value.beforeSelection, {
    anchor: { section: 0, paragraph: a.before.selection.paragraph, unit: backward ? 3 : 1 },
    focus: { section: 0, paragraph: a.before.selection.paragraph, unit: backward ? 1 : 3 },
  });
  assert.deepEqual(value.afterSelection, {
    anchor: {
      section: 0,
      paragraph: a.expected.paragraph,
      unit: a.expected.removed ? 0 : backward ? 3 : 1,
    },
    focus: {
      section: 0,
      paragraph: a.expected.paragraph,
      unit: a.expected.removed ? 0 : backward ? 1 : 3,
    },
  });
  assert.equal(value.beforeRevision, 0);
  assert.equal(value.afterRevision, 1);
}
for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: identical text still preserves the third paragraph ordinal`, () => {
    const a = scenario(format, 'insert-row');
    for (const snapshot of [a.before, a.after])
      for (const p of snapshot.content.paragraphs) p.text = 'same text';
    assertMapping(a);
  });
  test(`${format}: deleted selection accepts a different adjacent paragraph count`, () => {
    const a = scenario(format, 'delete-row');
    const removed = a.after.content.tables[1].cells[4].paragraphs.pop();
    a.after.content.paragraphs = a.after.content.paragraphs.filter((p) => p.paragraph !== removed);
    assertMapping(a);
  });
  test(`${format}: canonical order survives nonmonotonic paragraph IDs`, () => {
    const a = scenario(format, 'insert-row');
    for (const snapshot of [a.before, a.after]) {
      const remap = (id) => 10000 - id;
      for (const p of snapshot.content.paragraphs) {
        p.paragraph = remap(p.paragraph);
        if (p.currentReference) p.currentReference.paragraph = p.paragraph;
      }
      for (const c of snapshot.content.tables[1].cells) c.paragraphs = c.paragraphs.map(remap);
    }
    a.before.selection.paragraph = 10000 - a.before.selection.paragraph;
    a.expected.paragraph = 10000 - a.expected.paragraph;
    assertMapping(a);
  });
  const membershipFailures = [
    [
      'reversed deleted-cell destination IDs',
      (a) => {
        a.after.content.tables[1].cells[4].paragraphs.reverse();
      },
      'delete-row',
    ],
    [
      'omitted survivor IDs hiding changed text',
      (a) => {
        a.before.content.tables[1].cells[4].paragraphs.shift();
        a.after.content.tables[1].cells[7].paragraphs.shift();
        a.after.content.paragraphs[15].text = 'changed omitted paragraph';
      },
      'insert-row',
    ],
    [
      'matching reversed declarations disagree with canonical order',
      (a) => {
        a.before.content.tables[1].cells[4].paragraphs.reverse();
        a.after.content.tables[1].cells[7].paragraphs.reverse();
      },
      'insert-row',
    ],
    [
      'prior order mismatch with identical text',
      (a) => {
        for (const snapshot of [a.before, a.after])
          for (const p of snapshot.content.paragraphs) p.text = 'same text';
        a.before.content.tables[1].cells[4].paragraphs.reverse();
      },
      'insert-row',
    ],
    [
      'canonical destination order disagrees with declaration',
      (a) => {
        const paragraphs = a.after.content.paragraphs;
        [paragraphs[15], paragraphs[16]] = [paragraphs[16], paragraphs[15]];
      },
      'insert-row',
    ],
    [
      'omitted adjacent first paragraph',
      (a) => {
        a.after.content.tables[1].cells[4].paragraphs.shift();
      },
      'delete-row',
    ],
    [
      'duplicate ID under another owner',
      (a) => {
        a.after.content.paragraphs.push({
          ...a.after.content.paragraphs[15],
          tableCell: { tableNode: 100, listNode: 999 },
        });
      },
      'insert-row',
    ],
  ];
  for (const [name, mutate, action] of membershipFailures)
    test(`${format} P2 rejects ${name}`, () => {
      const a = scenario(format, action);
      mutate(a);
      assert.equal(sourceTableGridHistory(a), null);
    });
  for (const action of actions)
    for (const ordinal of [1, 2])
      for (const affinity of ['forward', 'backward']) {
        for (const index of action.startsWith('delete') ? [0, 1, 2] : [1]) {
          test(`${format} ${action} p${ordinal + 1} ${affinity} index${index}: ordinal after complete renumbering`, () => {
            const a = scenario(format, action, ordinal, affinity, index);
            assertMapping(a);
            if (action.startsWith('insert')) {
              const rowAxis = action.endsWith('row');
              const fresh = a.after.content.tables[1].cells.filter(
                (c) => (rowAxis ? c.row : c.column) === index,
              );
              assert.equal(fresh.length, 3);
              for (const c of fresh) {
                assert.equal(c.paragraphs.length, 1);
                assert.equal(
                  a.after.content.paragraphs.find((p) => p.paragraph === c.paragraphs[0]).text,
                  '',
                );
              }
            }
          });
        }
      }
  const corruptions = [
    [
      'missing selected ID',
      (a) => {
        a.before.content.tables[1].cells[4].paragraphs.pop();
      },
    ],
    [
      'duplicate prior ID',
      (a) => {
        a.before.content.tables[1].cells[4].paragraphs[0] = a.before.selection.paragraph;
      },
    ],
    [
      'survivor count',
      (a) => {
        a.after.content.tables[1].cells[7].paragraphs.pop();
      },
    ],
    [
      'duplicate destination ID',
      (a) => {
        const c = a.after.content.tables[1].cells[7];
        c.paragraphs[0] = c.paragraphs[2];
      },
    ],
    [
      'missing nonselected paragraph',
      (a) => {
        a.after.content.paragraphs = a.after.content.paragraphs.filter((p) => p.paragraph !== 1015);
      },
    ],
    [
      'duplicate nonselected paragraph',
      (a) => {
        a.after.content.paragraphs.push({ ...a.after.content.paragraphs[15] });
      },
    ],
    [
      'reordered surviving text',
      (a) => {
        const c = a.after.content.tables[1].cells[7];
        [c.paragraphs[0], c.paragraphs[1]] = [c.paragraphs[1], c.paragraphs[0]];
      },
    ],
    [
      'changed nonselected text',
      (a) => {
        a.after.content.paragraphs[15].text = 'changed';
      },
    ],
    [
      'stale nonselected owner',
      (a) => {
        a.after.content.paragraphs[15].tableCell.tableNode = 10;
      },
    ],
    [
      'missing nonselected owner',
      (a) => {
        delete a.after.content.paragraphs[15].tableCell;
      },
    ],
    [
      'body owner cannot impersonate a cell',
      (a) => {
        const p = a.after.content.paragraphs[15];
        p.selectionOwner = `section:0:table:100:list:${p.tableCell.listNode}`;
        delete p.tableCell;
      },
    ],
    [
      'duplicate prior paragraph',
      (a) => {
        a.before.content.paragraphs.push({ ...a.before.content.paragraphs[12] });
      },
    ],
    [
      'stale prior nonselected owner',
      (a) => {
        a.before.content.paragraphs[12].tableCell.listNode = 999;
      },
    ],
    [
      'stale selected list',
      (a) => {
        a.after.content.paragraphs[17].tableCell.listNode = 60;
      },
    ],
    [
      'stale selection token',
      (a) => {
        a.before.selection.viewRevision++;
      },
    ],
    [
      'stale after token',
      (a) => {
        a.after.token.viewRevision++;
      },
    ],
    [
      'unresolved recovery',
      (a) => {
        a.after.historyRecoveryRequired = true;
      },
    ],
    [
      'duplicate native revision',
      (a) => {
        a.after.nativeHistoryRevisions.push(0);
      },
    ],
    [
      'unreachable native revision',
      (a) => {
        a.after.nativeHistoryRevisions = [1];
      },
    ],
    [
      'table count',
      (a) => {
        a.after.content.tables.shift();
      },
    ],
    [
      'table ordinal collision',
      (a) => {
        a.after.content.tables[0].tableNode = 100;
      },
    ],
  ];
  for (const [name, mutate] of corruptions)
    test(`${format} rejects ${name}`, () => {
      const a = scenario(format, 'insert-row');
      mutate(a);
      assert.equal(sourceTableGridHistory(a), null);
    });
}

for (const format of ['hwp5', 'hwpx'])
  for (const action of actions) {
    test(`${format} Surface/Canvas ${action}: p3 backward undo/redo bookmark and input authority`, async () => {
      const a = scenario(format, action);
      const f = formattingFixture();
      f.install({
        content: a.before.content,
        nativeHistoryRevision: 0,
        nativeHistoryRevisions: [0],
        capabilities: { ...f.state().capabilities, sourceTableGridAvailable: true },
      });
      const surface = createCanvasSurface({ root: f.root, editor: f.editor });
      try {
        f.pointer('pointerdown', 14, 3);
        f.pointer('pointermove', 14, 1);
        f.pointer('pointerup', 14, 1);
        await tick();
        assert.equal(f.state().selection.paragraph, a.before.selection.paragraph);
        assert.equal(f.state().selection.affinity, 'backward');
        const capture = surface.captureSourceTableGridSelection();
        assert(capture);
        const committed = f.install({
          content: a.after.content,
          selection: undefined,
          operationRevision: 2,
          viewRevision: 2,
          nativeHistoryRevision: 1,
          nativeHistoryRevisions: [1, 0],
        });
        assert.equal(
          capture.recordHistory(
            {
              state: committed,
              status: 'committed-with-snapshot',
              changed: true,
              reply: { historyRevision: 1, historyRevisions: [1, 0], meta: { changed: true } },
            },
            a.request,
          ),
          true,
        );
        for (const [kind, content, revision, op] of [
          ['undo', a.before.content, 0, 3],
          ['redo', a.after.content, 1, 4],
          ['undo', a.before.content, 0, 5],
          ['redo', a.after.content, 1, 6],
        ]) {
          assert.equal(surface.requestHistory(kind), true);
          await tick();
          // First undo follows the non-text route: Core supplies its baseline selection.
          // Redo must recover the new snapshot's bookmark with no Core selection.
          const selection =
            op === 3
              ? {
                  ...a.before.selection,
                  ...f.state().token,
                  operationRevision: op,
                  viewRevision: op,
                }
              : undefined;
          f.ack(
            {
              content,
              selection,
              operationRevision: op,
              viewRevision: op,
              nativeHistoryRevision: revision,
              nativeHistoryRevisions: revision ? [1, 0] : [0, 1],
            },
            {
              reply: {
                changed: true,
                historyRevision: revision,
                historyRevisions: revision ? [1, 0] : [0, 1],
              },
            },
          );
          await tick();
          f.frame();
          await tick();
          const p = kind === 'undo' ? a.before.selection.paragraph : a.expected.paragraph;
          const unit = kind === 'redo' && a.expected.removed ? 0 : 1;
          assert.equal(f.canvas().dataset.selectionAuthority, 'current');
          assert.equal(f.canvas().dataset.caret, `0:${p}:${unit}`);
          assert.equal(f.canvas().dataset.selectionAuthority, 'current');
          assert.equal(f.input().disabled, false);
          assert.equal(f.state().selection.paragraph, p);
          assert.equal(
            f.state().selection.affinity,
            kind === 'redo' && a.expected.removed ? 'forward' : 'backward',
          );
        }
        assert.equal(surface.focus(), true);
        const input = f.input(),
          beforeInput = new Event('beforeinput', { cancelable: true });
        Object.assign(beforeInput, { inputType: 'insertText', data: 'Q', isComposing: false });
        input.dispatchEvent(beforeInput);
        if (!beforeInput.defaultPrevented) {
          input.value = 'Q' + input.value;
          input.setSelectionRange(1, 1);
          const event = new Event('input');
          Object.assign(event, { inputType: 'insertText', data: 'Q', isComposing: false });
          input.dispatchEvent(event);
        }
        await tick();
        assert.equal(f.messages.at(-1).kind, 'splice');
      } finally {
        while (f.waits.length) f.reject();
        await surface.dispose();
      }
    });
  }
