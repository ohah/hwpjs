import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootnoteLockAudit } from '../../web/preview/footnote-lock-audit.mjs';
import { footnoteTextReference } from '../../web/preview/footnote-reference-rows.mjs';
const row = (extra = {}) => ({
  kind: 'text',
  section: 0,
  paragraph: 2,
  startUnit: 0,
  endUnit: 200,
  pageOrdinal: 1,
  y: 3,
  ...extra,
});
const note = (anchorUnit = 1, extra = {}) => ({
  section: 0,
  hostParagraph: 2,
  anchorUnit,
  ...extra,
});
const scan = (audit, rows = [['k', row()]]) => {
  audit.beginScan();
  for (const [key, value] of rows) audit.observeTextRow(key, value);
  audit.endScan();
  return audit.valid();
};
test('등록 좌표는 원 note와 별개의 값이며 caller를 동결하지 않는다', () => {
  const a = createFootnoteLockAudit(),
    n = note(7);
  a.register('k', n, row());
  n.section = 99;
  n.hostParagraph = 99;
  n.anchorUnit = 999;
  assert.equal(Object.isFrozen(n), false);
  assert.equal(scan(a), true);
});
test('같은 행의 서로 다른 note는 합쳐도 각 등록 owner를 검사한다', () => {
  const a = createFootnoteLockAudit();
  a.register('k', note(0), row());
  a.register('k', note(199), row());
  assert.equal(scan(a), true);
  a.register('k', note(70, { hostParagraph: 8 }), row());
  assert.equal(scan(a), false);
});
test('반열린 끝 경계와 비정수 source는 등록 오류를 유지한다', () => {
  for (const n of [note(200), note(-1), note(1.5), note(NaN)]) {
    const a = createFootnoteLockAudit();
    a.register('k', n, row());
    assert.equal(scan(a), false);
  }
});
test('key가 같아도 source span 또는 owner가 달라지면 거부한다', () => {
  for (const changed of [
    row({ startUnit: 1 }),
    row({ endUnit: 201 }),
    row({ paragraph: 3 }),
    row({ section: 1 }),
  ]) {
    const a = createFootnoteLockAudit();
    a.register('k', note(7), row());
    assert.equal(scan(a, [['k', changed]]), false);
  }
});
test('같은 source key를 다른 물리 위치에 등록하면 영구 모순이다', () => {
  for (const changed of [row({ y: 4 }), row({ pageOrdinal: 2 })]) {
    const a = createFootnoteLockAudit();
    a.register('k', note(), row());
    a.register('k', note(2), changed);
    assert.equal(scan(a), false);
    assert.equal(scan(a), false);
  }
});
test('물리 이동과 복귀는 단조성을 가정하지 않고 매 scan 다시 검사한다', () => {
  const a = createFootnoteLockAudit();
  a.register('k', note(), row());
  assert.equal(scan(a, [['k', row({ y: 90 })]]), false);
  assert.equal(scan(a), true);
  assert.equal(scan(a, [['k', row({ pageOrdinal: 4 })]]), false);
  assert.equal(scan(a), true);
});
test('중복과 누락도 다음 scan에서 정상 복귀할 수 있다', () => {
  const a = createFootnoteLockAudit();
  a.register('k', note(), row());
  assert.equal(
    scan(a, [
      ['k', row()],
      ['k', row()],
    ]),
    false,
  );
  assert.equal(scan(a), true);
  assert.equal(scan(a, []), false);
  assert.equal(scan(a), true);
});
test('비대상 key와 gap은 locked owner를 대신하지 못한다', () => {
  const a = createFootnoteLockAudit();
  a.register('k', note(), row());
  assert.equal(
    scan(a, [
      ['other', row()],
      ['k', row({ kind: 'gap' })],
    ]),
    false,
  );
  assert.equal(
    scan(a, [
      ['other', row()],
      ['k', row()],
    ]),
    true,
  );
});
test('미완료 scan과 scan 도중 새 등록은 최종 인증하지 않는다', () => {
  const a = createFootnoteLockAudit();
  a.register('k', note(), row());
  a.beginScan();
  a.observeTextRow('k', row());
  assert.equal(a.valid(), false);
  a.register('k', note(2), row());
  a.endScan();
  assert.equal(a.valid(), false);
  assert.equal(scan(a), true);
  a.endScan();
  assert.equal(a.valid(), false);
});
test('엄격 물리 equality는 -0과 0을 같게, NaN을 다르게 취급한다', () => {
  const a = createFootnoteLockAudit();
  a.register('k', note(), row({ y: -0 }));
  assert.equal(scan(a, [['k', row({ y: 0 })]]), true);
  const b = createFootnoteLockAudit();
  b.register('k', note(), row({ y: NaN }));
  assert.equal(scan(b, [['k', row({ y: NaN })]]), false);
});
for (const n of [32, 64, 128]) {
  test(`같은 행 ${n}개 등록의 기존 누적 검사와 매 scan 판정 동치 및 계수`, () => {
    const counts = {},
      a = createFootnoteLockAudit(counts),
      old = [];
    let oldChecks = 0;
    for (let i = 0; i < n; i++) {
      const source = note(i);
      old.push(source);
      a.register('k', source, row());
      const actual = row();
      const expected = old.every((v) => {
        oldChecks++;
        return footnoteTextReference(actual, v);
      });
      assert.equal(scan(a, [['k', actual]]), expected);
    }
    assert.equal(oldChecks, (n * (n + 1)) / 2);
    assert.equal(counts.registrations, n);
    assert.equal(counts.registrationReferenceChecks, n);
    assert.equal(counts.textRowVisits, n);
    assert.equal(counts.scanReferenceChecks, 2 * n - 1);
    assert.equal(counts.mapLookups, 2 * n);
  });
}

import {
  paginatePlainFootnoteContinuations as raw,
  paginateMeasuredPlainFootnoteContinuations as measured,
} from '../../web/preview/plain-footnote-continuation.mjs';
const pageSetting = {
  section_ordinal: 0,
  width: 7500,
  height: 7500,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const pagePolicy = {
  state: 'selected',
  kind: 'footnote',
  section: 0,
  aboveLine: 0,
  belowLine: 0,
  betweenNotes: 0,
  beneathText: false,
};
const pageArgs = () => [
  [
    {
      kind: 'text',
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 10,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      text: 'abcdefghij',
    },
  ],
  pageSetting,
  [{ section: 0, paragraph: 0, top_level: true, column_break: null, page_break: null }],
  [1, 2, 3].map((id) => ({
    kind: 'footnote',
    section: 0,
    hostParagraph: 0,
    anchorUnit: id,
    noteNode: id,
    width: 100,
    height: 2,
    boxes: [],
    rows: [
      {
        kind: 'text',
        section: 0,
        paragraph: 100 + id,
        startUnit: 0,
        endUnit: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 2,
        text: 'x',
      },
    ],
  })),
  pagePolicy,
  0,
];
const output = (result) => {
  if (result.state !== 'ready') return result;
  const { notesFor, counters, ...rest } = result;
  const { lockAudit: _lockAudit, ...originalCounters } = counters;
  return {
    ...rest,
    counters: originalCounters,
    fragments: result.page.pages.map((p) => notesFor(result.page.rows, p.ordinal, 0)),
    otherColumn: notesFor([], 0, 1),
  };
};
test('정규 측정 진입점은 같은 행의 여러 note를 원본과 같은 페이지·fragment로 반환한다', () => {
  const input = pageArgs(),
    snapshot = structuredClone(input);
  const before = raw(...input),
    after = measured(...input);
  assert.equal(after.state, 'ready');
  assert.deepEqual(output(after), output(before));
  assert.deepEqual(input, snapshot);
  assert.equal(after.counters.lockAudit.registrations, 3);
  assert.equal(after.counters.lockAudit.scanReferenceChecks, 5);
});
test('정규 진입점의 final pass 제한 오류는 audit 최종 검사보다 먼저다', () => {
  const a = raw(...pageArgs(), { maxPasses: 1 });
  const b = measured(...pageArgs(), { maxPasses: 1 });
  assert.deepEqual(b, a);
  assert.equal(b.error, 'FootnoteContinuationReflowLimit');
});
test('정규 진입점은 limited 결과를 AnchorMoved로 대체하지 않는다', () => {
  const input = pageArgs();
  input[0].push({ ...input[0][0], paragraph: 1 });
  input[2].push({ ...input[2][0], paragraph: 1 });
  const a = raw(...input, { maxRows: 1 }),
    b = measured(...input, { maxRows: 1 });
  assert.deepEqual(b, a);
  assert.equal(b.limited, true);
});
test('raw 임의 caller의 잠금 뒤 좌표 변경은 기존 live 재검사로 거부한다', () => {
  const run = (fn) => {
    const input = pageArgs();
    input[3] = [input[3][0]];
    const note = input[3][0],
      rows = note.rows;
    rows.slice = function (...args) {
      note.anchorUnit = 99;
      return Array.prototype.slice.apply(this, args);
    };
    return fn(...input);
  };
  assert.equal(run(raw).error, 'FootnoteContinuationAnchorMoved');
  assert.equal(run(measured).state, 'ready');
  assert.equal(raw.length, 6);
  assert.equal(measured.length, 6);
  assert.throws(() => measured(...pageArgs(), null), TypeError);
});
