import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, createParagraphSelection, findTextMatch } from '../../src/index.ts';
import { validateSelection } from '../../src/commands/selection.ts';
import { createParagraphRowLookup } from '../../src/internal/paragraph-index.ts';
const base = {
  editorId: 'pure',
  documentId: 'doc',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
  stateVersion: 4,
  status: 'ready' as const,
};
const rows = [
  { section: 0, paragraph: 0, text: '가😀나', selectionOwner: 'section:0:body', editable: true },
  {
    section: 0,
    paragraph: 1,
    text: '',
    selectionOwner: null,
    tableCell: { tableNode: 10, listNode: 20 },
    editable: true,
  },
  {
    section: 0,
    paragraph: 2,
    text: '같은문구',
    selectionOwner: null,
    tableCell: { tableNode: 10, listNode: 21 },
    editable: true,
  },
  {
    section: 0,
    paragraph: 3,
    text: '같은문구',
    selectionOwner: null,
    tableCell: { tableNode: 10, listNode: 22 },
    editable: true,
  },
];
function state(paragraphs = rows, extra = {}) {
  return new EditorState({ ...base, content: { format: 'hwpx', paragraphs }, ...extra });
}
const at = (paragraph: number, startUnit = 0, endUnit = startUnit) => ({
  section: 0,
  paragraph,
  startUnit,
  endUnit,
});
test('빈셀 0..0은 canonical table owner의 frozen target 하나다', () => {
  const s = state(),
    t = createParagraphSelection(s, at(1));
  assert.equal(t.owner, 'section:0:table:10:list:20');
  assert.equal(t.startUnit, 0);
  assert.equal(t.endUnit, 0);
  assert.equal(Object.isFrozen(t), true);
  assert.deepEqual(t, {
    ...s.token,
    coordinateSpace: 'display',
    format: 'hwpx',
    owner: t.owner,
    section: 0,
    paragraph: 1,
    startUnit: 0,
    endUnit: 0,
    affinity: 'forward',
  });
  assert.equal(Object.hasOwn(t, 'reference'), false);
  assert.equal(Object.hasOwn(t, 'text'), false);
});
test('동일문구 두셀을 텍스트검색 없이 서로 다른 좌표로 선택한다', () => {
  const s = state(),
    a = createParagraphSelection(s, at(2, 1, 3)),
    b = createParagraphSelection(s, at(3, 1, 3));
  assert.notEqual(a.owner, b.owner);
  assert.equal(a.paragraph, 2);
  assert.equal(b.paragraph, 3);
  assert.equal(findTextMatch(s, '같은문구')?.paragraph, 2);
});
test('본문 UTF16 범위와 backward affinity를 유지한다', () => {
  const s = state(),
    t = createParagraphSelection(s, { ...at(0, 1, 3), affinity: 'backward' });
  assert.equal(t.owner, 'section:0:body');
  assert.equal(t.affinity, 'backward');
  assert.deepEqual(validateSelection(t, s), s.content.paragraphs[0]);
});
test('기존 scalar 및 범위 validator가 잘못된 경계를 거부한다', () => {
  const s = state();
  for (const v of [
    at(-1),
    at(99),
    at(0, -1),
    at(0, 3, 1),
    at(0, 0, 5),
    at(0, NaN),
    at(0, Infinity),
    { ...at(0), section: 0.5 },
  ])
    assert.throws(() => createParagraphSelection(s, v));
  assert.throws(
    () => createParagraphSelection(s, at(0, 2, 3)),
    new RegExp('InvalidScalarBoundary'),
  );
  assert.throws(
    () => createParagraphSelection(s, { ...at(0), endUnit: null } as any),
    new RegExp('InvalidTextPosition'),
  );
  assert.throws(
    () => createParagraphSelection(s, { ...at(0), affinity: null } as any),
    new RegExp('InvalidCoordinateSpace'),
  );
});
test('owner reference token 및 알수없는 options는 입력받지 않는다', () => {
  const s = state();
  for (const key of ['owner', 'reference', 'token', 'generation', 'viewRevision'])
    assert.throws(
      () => createParagraphSelection(s, { ...at(1), [key]: 'forged' } as any),
      new RegExp('InvalidParagraphSelectionOptions'),
    );
  let reads = 0;
  const options = { ...at(1) };
  Object.defineProperty(options, 'owner', {
    get() {
      reads++;
      return 'forged';
    },
  });
  assert.throws(
    () => createParagraphSelection(s, options),
    new RegExp('InvalidParagraphSelectionOptions'),
  );
  assert.equal(reads, 0);
  assert.throws(
    () => createParagraphSelection(s, Object.assign(Object.create({ x: 1 }), at(1))),
    new RegExp('InvalidParagraphSelectionOptions'),
  );
});
test('잘못된 owner token과 오래된 view는 기존 validator에서 거부한다', () => {
  const s = state(),
    t = createParagraphSelection(s, at(1));
  assert.throws(
    () => validateSelection({ ...t, owner: 'section:0:body' }, s),
    new RegExp('InvalidSelectionOwner'),
  );
  for (const [key, value] of [
    ['editorId', 'other'],
    ['documentId', 'other'],
    ['generation', 2],
    ['operationRevision', 3],
    ['viewRevision', 4],
  ])
    assert.throws(() => validateSelection({ ...t, [key]: value }, s), new RegExp('StaleTarget'));
  assert.throws(
    () => validateSelection(t, state(rows, { viewRevision: 4 })),
    new RegExp('StaleTarget'),
  );
});
test('중복 row identity clipped 및 충돌 owner를 기존 경계에서 거부한다', () => {
  assert.throws(
    () => createParagraphSelection(state([...rows, rows[1]]), at(1)),
    new RegExp('InvalidSelectionOwner'),
  );
  assert.throws(
    () =>
      createParagraphSelection(
        state(rows.map((r) => (r.paragraph === 1 ? { ...r, clipped: true } : r))),
        at(1),
      ),
    new RegExp('InvalidSelectionOwner'),
  );
  assert.throws(
    () =>
      createParagraphSelection(
        state(
          rows.map((r) =>
            r.paragraph === 1 ? { ...r, drawingText: { drawingNode: 2, listNode: 3 } } : r,
          ),
        ),
        at(1),
      ),
    new RegExp('InvalidSelectionOwner'),
  );
});
test('선택 facade는 편집권한을 발급하지 않는다', () => {
  const s = state(rows.map((r) => ({ ...r, editable: false }))),
    t = createParagraphSelection(s, at(1));
  assert.throws(() => validateSelection(t, s, true), new RegExp('SelectionNotEditable'));
  for (const status of ['empty', 'loading', 'refresh-required', 'disposed'])
    assert.throws(
      () => createParagraphSelection(state(rows, { status } as any), at(1)),
      new RegExp('EditorNotReady'),
    );
});
test('선택 출력·중복 거부와 소유 관측의 최초 색인 및 반복 조회 비용을 분리한다', () => {
  for (const n of [32, 64, 128]) {
    const rs = Array.from({ length: n }, (_, paragraph) => ({
      section: 0,
      paragraph,
      text: '복제하지않는문구',
      selectionOwner: 'section:0:body',
      editable: true,
    }));
    const s = state(rs),
      owned = (s.content as { paragraphs: typeof rs }).paragraphs;
    let indexVisits = 0,
      fallbackVisits = 0;
    // 기존 내부 tap으로 행 방문만 관측합니다. 공개 선택 권한은 facade/validator로 검사합니다.
    const lookup = createParagraphRowLookup((phase) => {
      if (phase === 'index') indexVisits++;
      else fallbackVisits++;
    });
    const selected = owned[n - 1];
    assert.equal(lookup(owned, 0, n - 1), selected);
    assert.equal(indexVisits, n);
    assert.equal(fallbackVisits, 0);
    for (const queries of [1, 4, 16]) {
      for (let i = 0; i < queries; i++) {
        const t = createParagraphSelection(s, at(n - 1));
        assert.equal(t.owner, 'section:0:body');
        assert.equal(t.paragraph, n - 1);
        assert.equal(Object.isFrozen(t), true);
        assert.equal(Object.hasOwn(t, 'text'), false);
        assert.equal(Object.hasOwn(t, 'reference'), false);
        assert.equal(validateSelection(t, s), selected);
        assert.equal(lookup(owned, 0, n - 1), selected);
        assert.equal(lookup(owned, 0, n), undefined);
      }
      assert.equal(indexVisits, n);
      assert.equal(fallbackVisits, 0);
    }
    // 같은 좌표의 새 관측은 새 행을 조회하고, 이전 토큰은 정상 validator가 거부합니다.
    const next = state(
      rs.map((r) => ({ ...r, text: '새 문구' })),
      { operationRevision: 3 },
    );
    const nextRows = (next.content as { paragraphs: typeof rs }).paragraphs;
    assert.equal(lookup(nextRows, 0, n - 1), nextRows[n - 1]);
    assert.notEqual(nextRows[n - 1], selected);
    assert.equal(indexVisits, n * 2);
    assert.equal(
      validateSelection(createParagraphSelection(next, at(n - 1)), next).text,
      '새 문구',
    );
    assert.throws(
      () => validateSelection(createParagraphSelection(s, at(n - 1)), next),
      /StaleTarget/,
    );
    // 첫 행을 조용히 택하지 않고 중복 좌표를 거부하며 반복 실패도 재순회하지 않습니다.
    const duplicateState = state([...rs, { ...rs[n - 1] }]);
    const duplicateRows = (duplicateState.content as { paragraphs: typeof rs }).paragraphs;
    const beforeDuplicate = indexVisits;
    for (let i = 0; i < 4; i++) {
      assert.equal(lookup(duplicateRows, 0, n - 1), undefined);
      assert.throws(
        () => createParagraphSelection(duplicateState, at(n - 1)),
        /InvalidSelectionOwner/,
      );
    }
    assert.equal(indexVisits - beforeDuplicate, n + 1);
    assert.equal(fallbackVisits, 0);
    // 외부 mutable 배열은 캐시 권한이 없으며 mutation을 다음 조회에서 다시 관측합니다.
    const external = rs.map((r) => ({ ...r }));
    const beforeFallback = fallbackVisits;
    for (let i = 0; i < 4; i++) assert.equal(lookup(external, 0, n - 1), external[n - 1]);
    assert.equal(fallbackVisits - beforeFallback, n * 4);
    external.push({ ...external[n - 1] });
    assert.equal(lookup(external, 0, n - 1), undefined);
    assert.equal(fallbackVisits - beforeFallback, n * 4 + n + 1);
    console.log(
      JSON.stringify({
        scope: '순수 선택 계약 및 기존 독립 lookup tap, 공개 facade find 비용과 별도',
        n,
        indexVisits,
        fallbackVisits,
        queries: [1, 4, 16],
        outputTextUnits: 0,
      }),
    );
  }
});
