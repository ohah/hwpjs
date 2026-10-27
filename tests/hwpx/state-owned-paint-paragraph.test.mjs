import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@hwpjs/core';
import {
  createOwnedBodyDraftProjection,
  createStatePaintParagraphLookup,
} from '../../web/preview/owned-body-draft-paragraph-index.mjs';
const stateFor = (paragraphs) =>
  new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    stateVersion: 0,
    status: 'ready',
    content: { paragraphs, format: 'hwpx', limited: false },
  });
const make = (rows, callback = (p) => ({ ...p, text: 'draft' })) => {
  const state = stateFor(rows),
    content = state.content;
  return {
    state,
    content,
    projection: createOwnedBodyDraftProjection(content.paragraphs, callback, state, content),
  };
};
test('실제 state는 내부 mutable draft 최초 duplicate를 찾고 원본을 보존한다', () => {
  const { content, projection: p } = make([
    { section: 1, paragraph: 2, text: 'first' },
    { section: 1, paragraph: 2, text: 'second' },
  ]);
  const f = p.beginFrame();
  assert.equal(f.kind, 'owned-body-draft');
  assert.equal(f.find(p.paragraphs, { section: 1, paragraph: 2 }), p.paragraphs[0]);
  assert.equal(content.paragraphs[0].text, 'first');
  assert(!Object.isFrozen(p.paragraphs[0]));
});
test('원 Proxy map 탈취 반례는 외부 map 관측을 유지하고 소유권을 얻지 않는다', () => {
  const external = [{ section: 0, paragraph: 0 }];
  let reads = 0;
  const rows = new Proxy(Object.freeze([Object.freeze({ section: 0, paragraph: 0 })]), {
    get(t, k, r) {
      if (k === 'map') {
        reads++;
        return () => external;
      }
      return Reflect.get(t, k, r);
    },
  });
  const p = createOwnedBodyDraftProjection(rows, (p) => p),
    f = p.beginFrame();
  assert.equal(reads, 1);
  assert.equal(f.kind, 'fallback');
  external[0].paragraph = 9;
  assert.equal(f.find(p.paragraphs, { section: 0, paragraph: 0 }), undefined);
  assert.equal(f.find(p.paragraphs, { section: 0, paragraph: 9 }), external[0]);
});
test('외부 getter는 기존 find에서만 읽으며 sparse 오류와 NaN 비교를 보존한다', () => {
  let reads = 0;
  const rows = [
    {
      get section() {
        reads++;
        return 0;
      },
      paragraph: 0,
    },
  ];
  const p = createOwnedBodyDraftProjection(rows, (p) => p);
  assert.equal(reads, 0);
  assert.equal(p.beginFrame().find(p.paragraphs, { section: 0, paragraph: 0 }), rows[0]);
  assert.equal(reads, 1);
  const sparse = [{ section: 0, paragraph: 0 }];
  sparse.length = 2;
  const s = createOwnedBodyDraftProjection(sparse, (p) => p);
  assert.throws(() => s.beginFrame().find(s.paragraphs, { section: 0, paragraph: 1 }), TypeError);
  const n = createOwnedBodyDraftProjection([{ section: NaN, paragraph: 0 }], (p) => p);
  assert.equal(n.beginFrame().find(n.paragraphs, { section: NaN, paragraph: 0 }), undefined);
});
test('외부 subclass species와 custom map/find는 기존 호출 의미를 보존한다', () => {
  let species = 0,
    maps = 0,
    finds = 0;
  class Foreign extends Array {
    static get [Symbol.species]() {
      species++;
      return Array;
    }
  }
  const rows = new Foreign({ section: 0, paragraph: 0 });
  const p = createOwnedBodyDraftProjection(rows, (p) => p);
  assert.equal(species, 1);
  assert.equal(p.beginFrame().kind, 'fallback');
  const other = [{ section: 0, paragraph: 0 }];
  other.map = () => {
    maps++;
    return {
      find() {
        finds++;
        return 'sentinel';
      },
    };
  };
  const q = createOwnedBodyDraftProjection(other, (p) => p);
  assert.equal(q.beginFrame().find(q.paragraphs, {}), 'sentinel');
  assert.equal(maps, 1);
  assert.equal(finds, 1);
});
test('위장 state·state Proxy·다른 content는 private getter 권위를 얻지 못한다', () => {
  const s = stateFor([{ section: 0, paragraph: 0 }]),
    c = s.content;
  for (const state of [
    Object.create(EditorState.prototype),
    new Proxy(s, {
      get() {
        throw Error('호출금지');
      },
    }),
  ])
    assert.equal(createStatePaintParagraphLookup(c.paragraphs, state, c).kind, 'fallback');
  const other = { ...c };
  assert.equal(createStatePaintParagraphLookup(other.paragraphs, s, other).kind, 'fallback');
});
test('실제 prototype getter 교체는 캡처된 권위를 무효화하며 finally 복원한다', () => {
  const s = stateFor([{ section: 0, paragraph: 0 }]),
    c = s.content,
    proto = EditorState.prototype,
    d = Object.getOwnPropertyDescriptor(proto, 'content');
  try {
    Object.defineProperty(proto, 'content', {
      ...d,
      get() {
        return c;
      },
    });
    assert.equal(createStatePaintParagraphLookup(c.paragraphs, s, c).kind, 'fallback');
  } finally {
    Object.defineProperty(proto, 'content', d);
  }
  assert.equal(createStatePaintParagraphLookup(c.paragraphs, s, c).kind, 'owned-body-draft');
});
test('frame 전 좌표 변경과 다른 문서 rows는 이전 index를 재사용하지 않는다', () => {
  const { projection: p } = make([{ section: 0, paragraph: 0 }]);
  p.paragraphs[0].paragraph = 3;
  assert.equal(p.beginFrame().kind, 'fallback');
  const { projection: q } = make([{ section: 0, paragraph: 0 }]);
  const f = q.beginFrame(),
    other = [{ section: 9, paragraph: 8 }];
  assert.equal(f.find(other, other[0]), other[0]);
  f.clear();
  assert.equal(f.find(q.paragraphs, q.paragraphs[0]), q.paragraphs[0]);
});
test('4096 초과 실제 state draft도 source map을 조회하지 않고 원 row를 반환한다', () => {
  const { projection: p } = make(
    Array.from({ length: 5000 }, (_, paragraph) => ({ section: 0, paragraph })),
  );
  const f = p.beginFrame();
  assert.equal(f.kind, 'owned-body-draft');
  assert.equal(f.find(p.paragraphs, { section: 0, paragraph: 4999 }), p.paragraphs[4999]);
});
