import test from 'node:test';
import assert from 'node:assert/strict';
import { paginatePlainFootnoteContinuations as plan } from '../../web/preview/plain-footnote-continuation.mjs';
import { placeFootnoteArea } from '../../web/preview/footnote-area-placement.mjs';
const setting = {
  section_ordinal: 0,
  width: 7500,
  height: 7500,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const policy = {
  state: 'selected',
  kind: 'footnote',
  section: 0,
  aboveLine: 1,
  belowLine: 2,
  betweenNotes: 3,
  beneathText: false,
};
const body = (n = 12) =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'text',
    section: 0,
    paragraph: i,
    startUnit: 0,
    endUnit: 1,
    x: 0,
    y: i * 20,
    width: 30,
    height: 20,
    text: String(i),
  }));
const flows = (rows) =>
  rows.map((r) => ({
    section: 0,
    paragraph: r.paragraph,
    top_level: true,
    column_break: null,
    page_break: null,
  }));
const note = (node = 40, host = 0, n = 10) => ({
  kind: 'footnote',
  section: 0,
  noteNode: node,
  hostParagraph: host,
  anchorUnit: 0,
  width: 100,
  height: n * 20,
  boxes: [],
  rows: Array.from({ length: n }, (_, i) => ({
    kind: 'text',
    section: 0,
    paragraph: 100 + node,
    startUnit: i,
    endUnit: i + 1,
    x: 0,
    y: i * 20,
    width: 20,
    height: 20,
    text: String(i),
  })),
});
const run = (ns = [note()], bs = body(), options = {}) =>
  plan(bs, setting, flows(bs), ns, policy, 1, options);
function verify(result, ns, bs) {
  assert.equal(result.state, 'ready', result.error);
  assert.deepEqual(
    result.page.rows.map((r) => r.paragraph),
    bs.map((r) => r.paragraph),
  );
  const fragments = [];
  for (const page of result.page.pages) {
    const selected = result.notesFor(result.page.rows, page.ordinal, 0);
    if (!selected.length) continue;
    const bottom = result.page.rows
      .filter((r) => r.pageOrdinal === page.ordinal)
      .reduce((n, r) => Math.max(n, r.y + r.height), page.page.y);
    const area = placeFootnoteArea(selected, policy, page.page, bottom, 1);
    assert.equal(area.state, 'placed', area.error);
    assert(
      area.rows.every((r) => r.y >= bottom && r.y + r.height <= page.page.y + page.page.height),
    );
    fragments.push(...selected);
  }
  for (const n of ns) {
    const parts = fragments.filter((f) => f.noteNode === n.noteNode);
    assert.deepEqual(
      parts.flatMap((f) => f.rows.map((r) => r.startUnit)),
      n.rows.map((r) => r.startUnit),
    );
    assert.equal(parts.filter((f) => !f.continuation).length, 1);
    assert.equal(parts[0].fragmentStart, 0);
    assert.equal(parts.at(-1).fragmentEnd, n.rows.length);
  }
  return fragments;
}
test('long note preserves every source row once across bottom-reserved pages', () => {
  const ns = [note()],
    bs = body();
  const r = run(ns, bs);
  const fs = verify(r, ns, bs);
  assert(fs.length >= 3);
  assert(r.passes > 1);
});
test('note-only tail pages retain physical frames and coverage', () => {
  const ns = [note(40, 0, 20)],
    bs = body(1);
  const r = run(ns, bs);
  verify(r, ns, bs);
  assert(r.page.pages.length > r.page.rows.length);
});
test('multiple notes follow canonical reference order rather than note-array order', () => {
  const ns = [note(42, 5, 8), note(40, 0, 10)],
    bs = body();
  const r = run(ns, bs);
  const fs = verify(r, ns, bs);
  assert.equal(fs[0].noteNode, 40);
  assert.equal(fs.at(-1).noteNode, 42);
});
test('last-line reference may defer first complete note row to next page', () => {
  const ns = [note(40, 4, 10)],
    bs = body();
  const r = run(ns, bs);
  const fs = verify(r, ns, bs);
  const anchor = r.page.rows.find((r) => r.paragraph === 4);
  const first = r.page.pages.find((p) => r.notesFor([], p.ordinal, 0).includes(fs[0]));
  assert(first.ordinal > anchor.pageOrdinal);
});
test('one indivisible note row exceeding empty-page capacity is rejected', () => {
  const n = note();
  n.rows = [{ ...n.rows[0], height: 110 }];
  n.height = 110;
  assert.equal(run([n]).error, 'FootnoteContinuationRowOverflow');
});
test('object and multicolumn continuations remain unsupported', () => {
  const n = note();
  n.boxes = [{}];
  assert.equal(run([n]).error, 'UnsupportedFootnoteContinuationContent');
  const bs = body();
  const f = flows(bs);
  f[0].column_declaration = { count: 2 };
  assert.equal(
    plan(bs, setting, f, [note()], policy, 1).error,
    'UnsupportedFootnoteContinuationColumns',
  );
});
test('absent and ambiguous canonical reference rows reject', () => {
  assert.equal(run([note(40, 99)]).error, 'MissingFootnoteContinuationReference');
  const bs = body();
  bs.splice(1, 0, { ...bs[0] });
  assert.equal(run([note()], bs).error, 'AmbiguousFootnoteContinuationReference');
});
test('explicit bounded reflow and page progress reject without partial success', () => {
  assert.equal(run([note()], body(), { maxPasses: 1 }).error, 'FootnoteContinuationReflowLimit');
  assert.equal(run([note()], body(1), { maxPages: 1 }).error, 'FootnoteContinuationPageLimit');
});
test('layout planning does not mutate input notes, rows or policies', () => {
  const ns = [note()],
    bs = body();
  const before = structuredClone({ ns, bs, policy });
  verify(run(ns, bs), ns, bs);
  assert.deepEqual({ ns, bs, policy }, before);
});

const single = {
  ambiguous: false,
  count: 1,
  same_size: true,
  kind: 'newspaper',
  direction: 'left',
  gap: 0,
  sizes: [],
};
test('verified full-width single-column declarations and changes preserve actual H5 flow', () => {
  const bs = body(),
    f = flows(bs);
  f[0] = {
    ...f[0],
    column_start_declaration: single,
    column_declaration: single,
    column_changes: [{ unit: 0, declaration: single }],
  };
  const ns = [note()];
  verify(plan(bs, setting, f, ns, policy, 1), ns, bs);
});
test('narrow single-column and unknown declarations are not full-width proof', () => {
  const bs = body(),
    f = flows(bs);
  f[0].column_declaration = { ...single, same_size: false, sizes: [{ width: 1000, gap: 0 }] };
  assert.equal(
    plan(bs, setting, f, [note()], policy, 1).error,
    'UnsupportedFootnoteContinuationColumns',
  );
  f[0].column_declaration = { count: 1 };
  assert.equal(
    plan(bs, setting, f, [note()], policy, 1).error,
    'UnsupportedFootnoteContinuationColumns',
  );
});
test('source index visits every body row once and each note anchor once', () => {
  for (const n of [8, 16, 32]) {
    const bs = body(n),
      ns = [note(40, 0, 10), note(41, n - 1, 8)],
      r = run(ns, bs);
    verify(r, ns, bs);
    assert.equal(r.counters.sourceRowVisits, n);
    assert.equal(r.counters.sourceAnchorVisits, 2);
    assert.equal(r.counters.physicalRowVisits, n * r.counters.physicalBuilds);
  }
});
test('anchor keep-next group remains together while note starts on a later page', () => {
  const bs = body(),
    ns = [note(40, 3, 10)];
  bs[3].keepNextHeight = 20;
  const r = run(ns, bs);
  verify(r, ns, bs);
  const a = r.page.rows.find((r) => r.paragraph === 3),
    next = r.page.rows.find((r) => r.paragraph === 4);
  assert.equal(a.pageOrdinal, next.pageOrdinal);
});
test('explicit body page break is preserved with continuation reservations', () => {
  const bs = body(),
    ns = [note(40, 5, 10)],
    f = flows(bs);
  f[5].page_break = true;
  const r = plan(bs, setting, f, ns, policy, 1);
  verify(r, ns, bs);
  assert(
    r.page.rows.find((r) => r.paragraph === 5).pageOrdinal >
      r.page.rows.find((r) => r.paragraph === 4).pageOrdinal,
  );
});
test('note number prefix is kept only on its original source row', () => {
  const n = note();
  n.rows[0].numberPrefix = { text: '1)', width: 10, height: 20 };
  const r = run([n]),
    parts = verify(r, [n], body());
  const prefixed = parts.flatMap((n) => n.rows).filter((r) => r.numberPrefix);
  assert.equal(prefixed.length, 1);
  assert.equal(prefixed[0].startUnit, 0);
  assert.equal(prefixed[0].numberPrefix.text, '1)');
});
test('separator and between-note spacing fit every physical continuation area', () => {
  const ns = [note(42, 0, 10), note(43, 0, 6)],
    bs = body();
  const r = run(ns, bs);
  verify(r, ns, bs);
  for (const page of r.page.pages) {
    const selected = r.notesFor([], page.ordinal, 0);
    if (!selected.length) continue;
    const bottom = r.page.rows
      .filter((r) => r.pageOrdinal === page.ordinal)
      .reduce((n, r) => Math.max(n, r.y + r.height), page.page.y);
    const placed = placeFootnoteArea(selected, policy, page.page, bottom, 1);
    assert.equal(placed.state, 'placed');
    assert(placed.separatorY >= bottom);
    assert(placed.separatorY + 1 <= placed.rows[0].y);
    for (let i = 1; i < placed.rows.length; i++)
      assert(placed.rows[i].y >= placed.rows[i - 1].y + placed.rows[i - 1].height);
  }
});
test('beneath-text areas and a single row filling an empty page remain bounded', () => {
  const n = note();
  n.rows = n.rows.slice(0, 2).map((r, i) => ({ ...r, y: i * 96, height: 96 }));
  n.height = 192;
  const bs = body(1),
    p = { ...policy, beneathText: true },
    r = plan(bs, setting, flows(bs), [n], p, 1);
  assert.equal(r.state, 'ready', r.error);
  for (const page of r.page.pages) {
    const ns = r.notesFor([], page.ordinal, 0);
    if (!ns.length) continue;
    const bottom = r.page.rows
      .filter((r) => r.pageOrdinal === page.ordinal)
      .reduce((n, r) => Math.max(n, r.y + r.height), page.page.y);
    assert.equal(placeFootnoteArea(ns, p, page.page, bottom, 1).state, 'placed');
  }
});
test('source and physical row visits are measured separately at 32 64 128 rows', () => {
  for (const n of [32, 64, 128]) {
    const bs = body(n),
      ns = [note(40, 0, 10), note(41, n - 1, 10)],
      r = run(ns, bs);
    verify(r, ns, bs);
    assert.equal(r.counters.sourceRowVisits, n);
    assert.equal(r.counters.sourceAnchorVisits, 2);
    assert.equal(r.counters.physicalRowVisits, n * r.counters.physicalBuilds);
    console.log(
      JSON.stringify({
        bodyRows: n,
        notes: 2,
        ...r.counters,
        passes: r.passes,
        pages: r.page.pages.length,
        scope: 'index visits only; repeated body pagination and note-order sorting remain',
      }),
    );
  }
});
for (const h of [19.2, 13.333333333333334, 17.6])
  test('fractional rebased row bounds reserve complete actual geometry ' + h, () => {
    let y = 0;
    const n = note(40, 0, 100);
    n.rows = n.rows.map((r) => {
      const row = { ...r, y, height: h };
      y += h;
      return row;
    });
    n.height = y;
    const bs = body(),
      r = run([n], bs);
    const parts = verify(r, [n], bs);
    for (const part of parts) assert(part.rows.every((row) => row.y + row.height <= part.height));
    console.log(
      JSON.stringify({
        rowHeight: h,
        pages: r.page.pages.length,
        fragments: parts.length,
        sourceUnits: parts.flatMap((p) => p.rows).length,
      }),
    );
  });
