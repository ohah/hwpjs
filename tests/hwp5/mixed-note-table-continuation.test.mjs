import test from 'node:test';
import assert from 'node:assert/strict';
import { measureCreatedNoteBody } from '../../web/preview/created-note-body-measurement.mjs';
import { prepareMixedFootnoteContinuation } from '../../web/preview/mixed-footnote-continuation.mjs';
import { paginatePlainFootnoteContinuations } from '../../web/preview/plain-footnote-continuation.mjs';
import { placeFootnoteArea } from '../../web/preview/footnote-area-placement.mjs';
import { hwp5TableCreationRequest } from '../../web/preview/hwp5-table-creation-command.mjs';
const setting = {
  section_ordinal: 0,
  width: 7500,
  height: 7500,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const page = { x: 20, y: 20, width: 100, height: 100 };
const policy = {
  state: 'selected',
  kind: 'footnote',
  section: 0,
  aboveLine: 1,
  belowLine: 2,
  betweenNotes: 3,
  beneathText: false,
};
const body = [
  {
    kind: 'text',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 1,
    x: 0,
    y: 0,
    width: 30,
    height: 20,
    text: 'x',
  },
];
const flows = [{ section: 0, paragraph: 0, top_level: true, column_break: null, page_break: null }];
function sample(n = 40, rowHeight = 2250) {
  const before = 'before-'.repeat(n),
    after = 'after-'.repeat(n);
  const paragraph = {
    section: 0,
    paragraph: 40,
    text: before + after,
    characterRanges: [],
    editable: true,
    selectable: true,
    label: '',
  };
  const table = {
    section: 0,
    hostParagraph: 40,
    anchorUnit: before.length,
    identity: '1',
    rows: 1,
    columns: 1,
    resources: { paragraph: 0, character: 0, style: 0, border_fill: 0 },
    cells: [{ row: 0, column: 0, width: 3000, height: rowHeight, text: 'CELL' }],
    displayFormat: 'hwp5',
    displayInsets: 0,
    hwp5Policy: hwp5TableCreationRequest({
      section: 0,
      paragraph: 40,
      unit: before.length,
      options: {
        rows: 1,
        columns: 1,
        width: 3000,
        rowHeight,
        resources: { paragraph: 0, character: 0, style: 0, border_fill: 0 },
      },
    }).options,
  };
  const flow = measureCreatedNoteBody(
    [paragraph],
    [table],
    'hwp5',
    100,
    (text) => Array.from(text).length * 8,
    20000,
  );
  assert.equal(flow.state, 'measured', flow.error);
  const note = {
    ...flow,
    kind: 'footnote',
    section: 0,
    noteNode: 40,
    hostParagraph: 0,
    anchorUnit: 0,
    width: 100,
    rows: flow.rows.map((row) => ({ ...row, noteNode: 40, noteKind: 'footnote' })),
  };
  return { note, paragraph, table };
}
function prepared(note) {
  const r = prepareMixedFootnoteContinuation([note], page, policy, 1);
  assert.equal(r?.state, 'prepared', r?.error);
  return r;
}
function run(note) {
  return prepared(note).paginate(body, setting, flows, [note], policy, 1, { maxRows: 20000 });
}
function check(result, note, paragraph) {
  assert.equal(result.state, 'ready', result.error);
  const parts = [],
    placed = [];
  for (const frame of result.page.pages) {
    const ns = result.notesFor(result.page.rows, frame.ordinal, 0);
    if (!ns.length) continue;
    const occupied = result.page.rows
      .filter((r) => r.pageOrdinal === frame.ordinal)
      .reduce((n, r) => Math.max(n, r.y + r.height), frame.page.y);
    const a = placeFootnoteArea(ns, policy, frame.page, occupied, 1);
    assert.equal(a.state, 'placed', a.error);
    assert(
      a.rows.every((r) => r.y >= occupied && r.y + r.height <= frame.page.y + frame.page.height),
    );
    parts.push(...ns);
    placed.push({ ...a, page: frame.ordinal });
  }
  const originals = parts.flatMap((n) => n.rows.filter((r) => !r.createdCell));
  let end = 0;
  for (const r of originals.filter((r) => r.kind === 'text' && r.endUnit > r.startUnit)) {
    assert.equal(r.startUnit, end);
    end = r.endUnit;
  }
  assert.equal(end, paragraph.text.length);
  assert.equal(parts.filter((n) => !n.continuation).length, 1);
  assert.equal(parts.flatMap((n) => n.boxes).length, note.boxes.length);
  assert.equal(parts.flatMap((n) => n.rows).length, note.rows.length);
  const tablePages = placed.filter((a) => a.boxes.length);
  assert.equal(tablePages.length, 1);
  for (const row of tablePages[0].rows.filter((r) => r.createdCell)) {
    const b = tablePages[0].boxes.find(
      (b) =>
        b.createdCell.identity === row.createdCell.identity &&
        b.createdCell.row === row.createdCell.row &&
        b.createdCell.column === row.createdCell.column,
    );
    assert(b);
    for (const k of ['x', 'y', 'width', 'height']) assert.equal(row.pageClip[k], b[k]);
  }
  return { parts, placed };
}
test('baseline plain planner refuses a boxed note rather than treating it as text', () => {
  const { note } = sample();
  assert.equal(
    paginatePlainFootnoteContinuations(body, setting, flows, [note], policy, 1).error,
    'UnsupportedFootnoteContinuationContent',
  );
});
test('mixed note moves whole table and keeps all before/after source units', () => {
  const { note, paragraph } = sample();
  assert(note.height > 100);
  const result = run(note);
  const { parts } = check(result, note, paragraph);
  assert(parts.length > 1);
});
test('planning keeps caller rows boxes units and policy unchanged', () => {
  const { note, paragraph } = sample();
  const snapshot = structuredClone(note);
  check(run(note), note, paragraph);
  assert.deepEqual(note, snapshot);
});
test('a table block taller than an empty page retains explicit refusal', () => {
  const { note } = sample(4, 15000);
  assert.equal(
    prepareMixedFootnoteContinuation([note], page, policy, 1).error,
    'CreatedNotePageHeightOverflow',
  );
});
test('duplicate unit ownership is rejected', () => {
  const { note } = sample();
  note.continuationUnits[1].rowIndices.push(note.continuationUnits[0].rowIndices[0]);
  assert.equal(
    prepareMixedFootnoteContinuation([note], page, policy, 1).error,
    'AmbiguousMixedFootnoteContinuationPart',
  );
});
test('missing geometry parts cannot become partial success', () => {
  const { note } = sample();
  const unit = note.continuationUnits.find((u) => u.boxIndices.length);
  unit.boxIndices = [];
  assert.equal(
    prepareMixedFootnoteContinuation([note], page, policy, 1).error,
    'IncompleteMixedFootnoteContinuationParts',
  );
});
test('wrong cell identity and changed clip fail before reservation', () => {
  const { note } = sample();
  note.boxes[0].createdCell = { ...note.boxes[0].createdCell, identity: '2' };
  assert.equal(
    prepareMixedFootnoteContinuation([note], page, policy, 1).error,
    'InvalidMixedFootnoteCellOwner',
  );
  const b = sample().note;
  b.rows.find((r) => r.createdCell).pageClip.y += 1;
  assert.equal(
    prepareMixedFootnoteContinuation([b], page, policy, 1).error,
    'InvalidMixedFootnoteCellClip',
  );
});
test('multiple table notes and atomic scenes keep conservative fallback', () => {
  const { note } = sample();
  const second = { ...note, noteNode: 41 };
  assert.equal(prepareMixedFootnoteContinuation([note, second], page, policy, 1), null);
  note.atomicScene = true;
  assert.equal(prepareMixedFootnoteContinuation([note], page, policy, 1), null);
});
test('source reference and bounded progress guards still reject', () => {
  const { note } = sample();
  const p = prepared(note);
  assert.equal(
    p.paginate(
      body,
      setting,
      [{ ...flows[0], column_declaration: { count: 2 } }],
      [note],
      policy,
      1,
      {},
    ).error,
    'UnsupportedFootnoteContinuationColumns',
  );
  assert.equal(
    p.paginate(body, setting, flows, [note], policy, 1, { maxPages: 1 }).error,
    'FootnoteContinuationPageLimit',
  );
});
test('unit indexing counters are explicit at n 2n 4n without timing claims', () => {
  const records = [];
  for (const n of [32, 64, 128]) {
    const { note, paragraph } = sample(n);
    const p = prepared(note);
    const build = { ...p.counters };
    assert.equal(build.rowAssignments, note.rows.length);
    assert.equal(build.boxAssignments, note.boxes.length);
    assert.equal(build.prefixAssignments, note.numberPrefixes.length);
    assert.equal(build.unitVisits, note.continuationUnits.length);
    const r = p.paginate(body, setting, flows, [note], policy, 1, {});
    check(r, note, paragraph);
    records.push({ n, UTF16Units: paragraph.text.length, build, after: { ...p.counters } });
  }
  console.log(
    JSON.stringify({
      scope: 'mixed measurement unit builder only; whole pagination not linear proof',
      records,
    }),
  );
});
