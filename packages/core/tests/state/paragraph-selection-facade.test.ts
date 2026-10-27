import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, createParagraphSelection, findTextMatch } from '../../src/index.ts';
import { validateSelection } from '../../src/commands/selection.ts';
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
test('n조회행과 출력target 비용을 분리하며 전체문구 검색을 하지 않는다', () => {
  for (const n of [32, 64, 128]) {
    const rs = Array.from({ length: n }, (_, paragraph) => ({
      section: 0,
      paragraph,
      text: '복제하지않는문구',
      selectionOwner: 'section:0:body',
      editable: true,
    }));
    const s = state(rs),
      owned = (s.content as any).paragraphs;
    let lookupVisits = 0,
      validatorVisits = 0;
    const find = Array.prototype.find,
      filter = Array.prototype.filter;
    Array.prototype.find = function (cb: any, ctx: any) {
      const tracked = this === owned;
      return find.call(this, function (v: any, i: number, a: any) {
        if (tracked) lookupVisits++;
        return cb.call(ctx, v, i, a);
      });
    };
    Array.prototype.filter = function (cb: any, ctx: any) {
      const tracked = this === owned;
      return filter.call(this, function (v: any, i: number, a: any) {
        if (tracked) validatorVisits++;
        return cb.call(ctx, v, i, a);
      });
    };
    let t;
    try {
      t = createParagraphSelection(s, at(n - 1));
    } finally {
      Array.prototype.find = find;
      Array.prototype.filter = filter;
    }
    assert.equal(lookupVisits, n);
    assert.equal(validatorVisits, n);
    assert.equal(Object.hasOwn(t!, 'text'), false);
    console.log(
      JSON.stringify({
        scope: 'pure 실제함수 논리계수',
        n,
        lookupVisits,
        validatorVisits,
        outputTargets: 1,
        outputTextUnits: 0,
      }),
    );
  }
});
