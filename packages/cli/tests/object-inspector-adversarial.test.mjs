import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { inspectDocumentObject } from '../src/document-objects.mjs';
import { buildObjectReference } from '../src/object-reference.mjs';

// 실제 서비스의 DI 경계 검사입니다. SDK 인스턴스·Native·파일 입력을 사용하지 않습니다.
const bytes = new TextEncoder().encode('상세 조회용 합성 스냅샷');
const wasm = Uint8Array.of(0, 97, 115, 109);
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
let nextId = 0;
const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'unresolved' },
});
const paragraph = (displayText) => ({
  id: 'p:' + nextId++,
  type: 'paragraph',
  displayText,
  source: { section: 0, paragraph: 1 },
  editability: 'unknown',
});
const ref = (kind, node = 77, format = 'hwpx', section = 0) =>
  buildObjectReference({
    sourceSha256,
    format,
    section,
    kind,
    node,
  });
const object = (kind, node = 77, format = 'hwpx', section = 0) => {
  const common = { id: kind + ':' + node, reference: ref(kind, node, format, section) };
  if (kind === 'image')
    return {
      ...common,
      type: 'image',
      sourceInfo: { section, pictureNode: node },
      altState: 'not-exposed',
      alt: null,
    };
  if (kind === 'table')
    return {
      ...common,
      type: 'table',
      source: { section, tableNode: node },
      rows: 1,
      columns: 1,
      cells: [],
    };
  return {
    ...common,
    type: 'unknown',
    kind,
    source: { section, node },
    diagnostic: { code: 'ObjectDetailsDeferred', message: '상세 내용은 선택 조회' },
  };
};
const cell = (blocks) => ({
  id: 'cell:' + nextId++,
  source: { listNode: 9 },
  row: 0,
  column: 0,
  rowSpan: 1,
  columnSpan: 1,
  geometryKnown: true,
  contentState: 'observed',
  blocks,
});
const model = (body, format = 'hwpx') => ({
  version: 1,
  format,
  sourceSha256,
  sections: [{ id: 'section:0', source: { section: 0 }, header: area(), body, footer: area() }],
  unplaced: [],
  warnings: [],
  coverage: { inventoryComplete: true },
});
const chart = (node = 77) => ({
  kind: 'chart_display',
  pair: { wrapper_node: node, section_ordinal: 0, declared_external: false },
  rich_text: [],
  series_text: [],
  points: [],
  bindings: [],
});

function fixture({
  kind = 'chart',
  format = 'hwpx',
  node = 77,
  section = 0,
  methods = {},
  document: overrides = {},
  close,
  collect,
} = {}) {
  const block = object(kind, node, format, section);
  const snapshot = model([block], format);
  const calls = [],
    accesses = [];
  const counts = { opened: 0, collected: 0, closed: 0 };
  const sdk = new Proxy(
    {},
    {
      get(_target, key) {
        accesses.push(key);
        if (!Object.hasOwn(methods, key)) return undefined;
        return (...args) => {
          calls.push({ method: key, args });
          return methods[key](...args);
        };
      },
    },
  );
  const document = {
    format,
    sourceSha256,
    sectionCount: 1,
    sdk,
    async close() {
      counts.closed++;
      if (close) await close();
    },
    ...overrides,
  };
  const dependencies = {
    async openDocument(input) {
      counts.opened++;
      assert.equal(input.bytes, bytes);
      assert.equal(input.wasm, wasm);
      assert.equal(input.expectedSha256, sourceSha256);
      return document;
    },
    async readDocumentModel(input) {
      counts.collected++;
      assert.equal(input.sdk, sdk);
      assert.equal(input.format, document.format);
      assert.equal(input.sourceSha256, document.sourceSha256);
      return collect ? collect(input) : snapshot;
    },
  };
  const run = (input = {}, injected = {}) =>
    inspectDocumentObject(
      {
        bytes,
        wasm,
        reference: block.reference,
        format: 'text',
        ...input,
      },
      { ...dependencies, ...injected },
    );
  return { block, snapshot, calls, accesses, counts, document, run };
}

test('잘못된 section 개수와 범위는 모델·상세 query 없이 close한다', async () => {
  for (const overrides of [{ sectionCount: 0 }, { sectionCount: 4097 }]) {
    const f = fixture({ document: overrides });
    await assert.rejects(f.run());
    assert.deepEqual(f.counts, { opened: 1, collected: 0, closed: 1 });
    assert.deepEqual(f.accesses, []);
  }
  const f = fixture({ section: 1 });
  await assert.rejects(f.run(), /InvalidObjectSection/);
  assert.deepEqual(f.counts, { opened: 1, collected: 0, closed: 1 });
});

test('선택 개체를 먼저 찾았어도 다른 모델 행의 잘못된 ref를 확인하기 전에는 query하지 않는다', async () => {
  for (const invalid of ['stale', 'source-node']) {
    const f = fixture({
      methods: {
        chartDisplay() {
          throw new Error('모델 검증 전 호출 금지');
        },
      },
    });
    const other = object('image', 78);
    if (invalid === 'stale')
      other.reference = other.reference.replace(sourceSha256, '0'.repeat(64));
    else other.sourceInfo.pictureNode = 79;
    // 서비스 stack에서 선택 행이 먼저 관측되고 잘못된 비선택 행이 나중에 검증됩니다.
    f.snapshot.sections[0].body.unshift(other);
    await assert.rejects(f.run());
    assert.deepEqual(f.accesses, []);
    assert.deepEqual(f.calls, []);
    assert.equal(f.counts.closed, 1);
  }
});

test('중복 reference·같은 block 반복·서로 다른 ref의 중복 ID·cycle 모델을 모두 거부한다', async () => {
  const variants = [
    (f) => {
      f.snapshot.sections[0].body.push({ ...f.block, id: '복제 reference' });
    },
    (f) => {
      f.snapshot.sections[0].body.push(f.block);
    },
    (f) => {
      f.snapshot.sections[0].body.push({ ...object('chart', 78), id: f.block.id });
    },
    (f) => {
      const t = object('table', 1);
      t.cells.push(cell([t]));
      f.snapshot.sections[0].body.push(t);
    },
  ];
  for (const mutate of variants) {
    const f = fixture({ methods: { chartDisplay: () => chart() } });
    mutate(f);
    await assert.rejects(f.run(), /InvalidObjectModel/);
    assert.deepEqual(f.accesses, []);
    assert.equal(f.counts.closed, 1);
  }
});

test('표 상세는 원문 문단과 직접 중첩 참조를 보존하고 다른 개체 상세 query를 하지 않는다', async () => {
  const f = fixture({ kind: 'table', node: 1 });
  const nested = object('table', 2),
    image = object('image', 3),
    equation = object('equation', 4);
  nested.cells.push(cell([paragraph('중첩 표의 별도 본문')]));
  f.block.rows = 4_000_000_000;
  f.block.columns = 4_000_000_000;
  f.block.cells.push(
    cell([paragraph('원문 Paragraph Table documentSHA256:'), nested, image, equation]),
  );
  const before = structuredClone(f.snapshot);
  const result = await f.run();
  assert.equal(result.status, 'available');
  assert.ok(result.text.includes('원문 Paragraph Table documentSHA256:'));
  for (const block of [nested, image, equation]) assert.ok(result.text.includes(block.reference));
  assert.equal(result.text.includes('중첩 표의 별도 본문'), false);
  assert.ok(result.text.length < 3000);
  assert.deepEqual(f.accesses, []);
  assert.deepEqual(f.snapshot, before);
});

test('행 수와 escape 후 UTF8 누적 예산을 초과하면 절단 결과 없이 거부한다', async () => {
  const rows = [];
  rows.length = 200001;
  const oversized = fixture({ methods: { chartDisplay: () => ({ ...chart(), points: rows }) } });
  await assert.rejects(oversized.run(), /InvalidObjectDetail/);
  assert.equal(oversized.counts.closed, 1);
  for (const text of ['x'.repeat(65537), '\u001b'.repeat(12000), '한'.repeat(23000)]) {
    const f = fixture({ kind: 'equation', methods: { equationScript: () => text } });
    await assert.rejects(f.run(), /ObjectDetailLimitExceeded/);
    assert.equal(f.counts.closed, 1);
  }
});

test('성공과 실패 모두 비동기 close가 완료되기 전에는 결과가 확정되지 않는다', async () => {
  for (const fail of [false, true]) {
    let release, entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const closing = new Promise((resolve) => {
      entered = resolve;
    });
    const primary = new Error('모델 실패');
    const f = fixture({
      kind: 'image',
      collect: fail
        ? () => {
            throw primary;
          }
        : undefined,
      close() {
        entered();
        return gate;
      },
    });
    let settled = false;
    const pending = f.run();
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await closing;
    assert.equal(settled, false);
    assert.equal(f.counts.closed, 1);
    release();
    if (fail) await assert.rejects(pending, (error) => error === primary);
    else assert.equal((await pending).status, 'available');
    assert.equal(settled, true);
  }
});
