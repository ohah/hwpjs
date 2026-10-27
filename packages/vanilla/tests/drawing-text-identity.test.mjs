import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHwp5DrawingText } from '../../../web/preview/hwp5-drawing-text-projection.mjs';
import { createNativeGeometryDeps } from '../../../web/preview/native-geometry-deps.mjs';
const marker = () => Object.freeze({});
const row = (text = '본문') =>
  Object.freeze(Object.assign(Object.create(null), { section: 0, paragraph: 0, text, label: '' }));
const project = (p) => projectHwp5DrawingText({ paragraphs: [p], currentParagraphFlows: [] });
test('소유권 변화 없는 immutable canonical 행은 identity를 그대로 보존', () => {
  const p = row(),
    r = project(p);
  assert.equal(r.state, 'projected');
  assert.equal(r.paragraphs[0], p);
  assert(Object.isFrozen(r.paragraphs[0]));
});
test('mutable 입력은 이전처럼 독립적인 얕은 행 복제 유지', () => {
  const p = { section: 0, paragraph: 0, text: '본문' },
    r = project(p);
  assert.equal(r.state, 'projected');
  assert.notEqual(r.paragraphs[0], p);
  r.paragraphs[0].text = '화면';
  assert.equal(p.text, '본문');
});
test('immutable accessor는 passthrough하지 않고 기존 읽기 의미 유지', () => {
  let reads = 0;
  const p = { section: 0, paragraph: 0 };
  Object.defineProperty(p, 'text', {
    enumerable: true,
    get() {
      reads++;
      return '본문';
    },
  });
  Object.freeze(p);
  const r = project(p);
  assert.equal(r.state, 'projected');
  assert.notEqual(r.paragraphs[0], p);
  assert.equal(reads, 1);
  assert.equal(r.paragraphs[0].text, '본문');
});
test('명시된 이전 drawingText·drawingCaption은 undefined여도 기존처럼 제거', () => {
  const p = Object.freeze({
      section: 0,
      paragraph: 0,
      text: '본문',
      drawingText: undefined,
      drawingCaption: { drawingNode: 99 },
    }),
    r = project(p);
  assert.equal(r.state, 'projected');
  assert.notEqual(r.paragraphs[0], p);
  assert(!Object.hasOwn(r.paragraphs[0], 'drawingText'));
  assert(!Object.hasOwn(r.paragraphs[0], 'drawingCaption'));
  assert(Object.hasOwn(p, 'drawingText'));
});
test('미연결 drawing owner는 성공으로 가장하지 않고 기존 실패 유지', () => {
  const p = row(),
    r = projectHwp5DrawingText({
      paragraphs: [p],
      currentParagraphFlows: [{ section: 0, paragraph: 0, host: 'drawing' }],
    });
  assert.equal(r.state, 'unavailable');
  assert.equal(r.error, 'MissingHwp5DrawingTextMember');
});
test('canonical 보존은 현재 Native membership만 통과시키고 복제·수정·옛 행을 승격하지 않음', () => {
  // 소비자 단위 등록표이며 실제 Native 발급 증거는 아닙니다.
  const registry = new WeakMap(),
    scope = marker(),
    resourceLease = marker(),
    host = {
      width: 800,
      scale: 1,
      dpr: 1,
      fontEpoch: 0,
      decodedResourceEpoch: 0,
      fontKey: '본문',
      textBoundaryIdentity: marker(),
      measurementPolicy: marker(),
    };
  const deps = createNativeGeometryDeps({
    readEvidence: (e, c) => (registry.get(e)?.content === c ? registry.get(e).metadata : undefined),
  });
  function issue(content, patch = {}) {
    const e = marker();
    registry.set(e, {
      content,
      metadata: Object.freeze({
        scope,
        resourceLease,
        kind: 'full-baseline',
        nativeEpoch: '1',
        nativeRevision: 0,
        ...patch,
      }),
    });
    return e;
  }
  const original = row(),
    content = Object.freeze({
      format: 'hwp5',
      limited: false,
      paragraphs: Object.freeze([original]),
    });
  const a = deps.prepare(content, issue(content), host);
  assert.equal(a.stamp(project(original).paragraphs[0]), 'native:baseline');
  const clone = Object.freeze({ ...original }),
    changed = Object.freeze({ ...original, text: '변경' });
  assert.equal(a.stamp(project(clone).paragraphs[0]), null);
  assert.equal(a.stamp(project(changed).paragraphs[0]), null);
  const next = Object.freeze({
    format: 'hwp5',
    limited: false,
    paragraphs: Object.freeze([changed]),
  });
  const b = deps.prepare(
    next,
    issue(next, {
      kind: 'exclusive-text',
      beforeEpoch: '1',
      nativeEpoch: '2',
      beforeRevision: 0,
      nativeRevision: 1,
      owner: { section: 0, paragraph: 0 },
      ownerTextRunGeneration: 1,
    }),
    host,
  );
  assert.equal(b.stamp(project(changed).paragraphs[0]), 'native:1');
  assert.equal(b.stamp(project(original).paragraphs[0]), null);
  assert.equal(a.stamp(original), null);
});

test('symbol descriptor가 있는 immutable 행은 기존 clone 경로를 유지', () => {
  const symbol = Symbol('관측'),
    p = Object.freeze({ section: 0, paragraph: 0, text: '본문', [symbol]: '보존' }),
    r = project(p);
  assert.equal(r.state, 'projected');
  assert.notEqual(r.paragraphs[0], p);
  assert.equal(r.paragraphs[0][symbol], '보존');
});
test('알 수 없는 prototype의 immutable 행은 기존 clone 경로를 유지', () => {
  const p = Object.freeze(
      Object.assign(Object.create({ extra: true }), { section: 0, paragraph: 0, text: '본문' }),
    ),
    r = project(p);
  assert.equal(r.state, 'projected');
  assert.notEqual(r.paragraphs[0], p);
  assert.equal(r.paragraphs[0].text, '본문');
});
test('유효 drawing owner 변환은 immutable 원본이라도 실제 소유권을 새 clone에 부여', () => {
  const p = row(),
    source = {
      kind: 'body',
      control_node: 1,
      owner_node: 2,
      list_node: 3,
      paragraph_count: 1,
      attributes: 0,
      extra_bytes: 12,
      unknown: null,
      extra_nonzero: false,
      margins: [0, 0, 0, 0],
      last_width: 0,
      body_extra_bytes: 0,
      caption: null,
    };
  const r = projectHwp5DrawingText({
    paragraphs: [p],
    currentParagraphFlows: [
      { section: 0, paragraph: 0, host: 'drawing', parent_node: 2, list_node: 3, top_level: false },
    ],
    hwp5Drawings: [{ section: 0, controlNode: 1, componentNode: 2 }],
    hwp5DrawingBodies: [
      {
        section: 0,
        kind: 'body',
        ownerNode: 2,
        controlNode: 1,
        listNode: 3,
        paragraphs: [0],
        source,
      },
    ],
  });
  assert.equal(r.state, 'projected');
  assert.notEqual(r.paragraphs[0], p);
  assert.deepEqual(r.paragraphs[0].drawingText, { drawingNode: 2, listNode: 3 });
  assert(!Object.hasOwn(p, 'drawingText'));
  assert.equal(r.bindings.length, 1);
});
