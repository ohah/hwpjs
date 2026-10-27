import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisplayResourceCache } from '../../web/preview/display-resource-cache.mjs';
const plain = (cache, editor) =>
  cache.beginRequest({ kind: 'splice' }, { format: 'hwpx', editor, historyEnabled: true });

test('header snapshots are privately owned; text ranges and arguments always read native', () => {
  const cache = createDisplayResourceCache();
  let reads = 0,
    ranges = 0;
  const source = [{ id: 1, data: new Uint8Array([4]) }];
  const editor = {
    characterShapes(...args) {
      reads++;
      return args.length ? [{ id: args[0] }] : source;
    },
    characterRanges() {
      return ++ranges;
    },
  };
  const view = cache.view(editor);
  plain(cache, editor);
  const first = view.characterShapes();
  first[0].id = 99;
  first[0].data[0] = 8;
  source[0].id = 7;
  assert.equal(view.characterShapes()[0].id, 1);
  assert.equal(view.characterShapes()[0].data[0], 4);
  assert.equal(reads, 1);
  assert.equal(view.characterRanges(), 1);
  assert.equal(view.characterRanges(), 2);
  view.characterShapes(5);
  assert.equal(reads, 2);
  cache.finishRequest();
  plain(cache, editor);
  assert.equal(view.characterShapes()[0].id, 1);
});

test('all mutation, lifecycle, unknown and failed boundaries invalidate, including caught getter failure', () => {
  for (const kind of [
    'font',
    'character-properties',
    'paragraph-alignment',
    'split',
    'merge',
    'undo',
    'redo',
    'load',
    'enable',
    'unlock',
    'refresh',
    'save',
    'unknown-external',
  ]) {
    const cache = createDisplayResourceCache();
    let n = 0;
    const editor = { fontFaces: () => [{ id: ++n }] };
    const view = cache.view(editor);
    view.fontFaces();
    cache.beginRequest({ kind }, { format: 'hwpx', editor, historyEnabled: true });
    assert.equal(view.fontFaces()[0].id, 2, kind);
  }
  const cache = createDisplayResourceCache();
  let n = 0,
    fail = false;
  const editor = {
    fontFaces: () => [{ id: ++n }],
    characterShapes() {
      if (fail) throw Error('query failed');
      return [];
    },
  };
  const view = cache.view(editor);
  view.fontFaces();
  plain(cache, editor);
  fail = true;
  assert.throws(() => view.characterShapes(), /query failed/);
  view.fontFaces();
  cache.finishRequest();
  assert.equal(view.fontFaces()[0].id, 3);
  plain(cache, editor);
  cache.finishRequest(true);
  assert.equal(view.fontFaces()[0].id, 4);
});

test('source identity, disposal and independent runtimes cannot reuse another native owner', () => {
  const cache = createDisplayResourceCache(),
    a = { fontFaces: () => ['a'] },
    b = { fontFaces: () => ['b'] };
  const av = cache.view(a);
  assert.deepEqual(av.fontFaces(), ['a']);
  assert.deepEqual(cache.view(b).fontFaces(), ['b']);
  assert.throws(() => av.fontFaces(), /StaleDisplayResourceOwner/);
  cache.reset();
  assert.deepEqual(cache.view(a).fontFaces(), ['a']);
  const other = createDisplayResourceCache();
  assert.deepEqual(other.view(b).fontFaces(), ['b']);
});

test('read-only resource requests preserve values; unenabled/non-HWPX splice does not', () => {
  for (const kind of [
    'picture-bytes',
    'table-background-bytes',
    'query-edit-range',
    'query-split-range',
  ]) {
    let n = 0;
    const cache = createDisplayResourceCache(),
      editor = { fontFaces: () => [++n] },
      v = cache.view(editor);
    v.fontFaces();
    cache.beginRequest({ kind }, { format: 'hwpx', editor, historyEnabled: true });
    assert.deepEqual(v.fontFaces(), [1]);
  }
  for (const options of [
    { format: 'hwpx', historyEnabled: false },
    { format: 'hwp5', historyEnabled: true },
  ]) {
    let n = 0;
    const cache = createDisplayResourceCache(),
      editor = { fontFaces: () => [++n] },
      v = cache.view(editor);
    v.fontFaces();
    cache.beginRequest({ kind: 'splice' }, { ...options, editor });
    assert.deepEqual(v.fontFaces(), [2]);
  }
});

test('표 생성 리소스만 순수 텍스트 이력 편집 사이에 소유 복사로 보존한다', () => {
  const cache = createDisplayResourceCache();
  let calls = 0,
    dynamic = 0;
  const source = { paragraph: [7], character: [5], style: [2], border_fill: [3] };
  const editor = {
    tableCreationResources() {
      calls++;
      return source;
    },
    tableBindings() {
      return ++dynamic;
    },
    tableBorderSourcesBatch() {
      return ++dynamic;
    },
  };
  const view = cache.view(editor);
  plain(cache, editor);
  const first = view.tableCreationResources();
  first.character.push(99);
  cache.finishRequest();
  plain(cache, editor);
  assert.deepEqual(view.tableCreationResources(), source);
  assert.equal(calls, 1);
  assert.equal(view.tableBindings(), 1);
  assert.equal(view.tableBindings(), 2);
  assert.equal(view.tableBorderSourcesBatch([0]), 3);
  assert.equal(view.tableBorderSourcesBatch([0]), 4);
  view.tableCreationResources(0);
  assert.equal(calls, 2);
  cache.invalidate();
  view.tableCreationResources();
  assert.equal(calls, 3);
  cache.finishRequest(true);
  view.tableCreationResources();
  assert.equal(calls, 4);
});
test('표 생성 리소스의 형식 구조 이력 오류 문서 경계는 재조회한다', () => {
  for (const kind of [
    'format',
    'font',
    'character-properties',
    'split',
    'merge',
    'insert-table',
    'undo',
    'redo',
    'load',
    'enable',
    'unlock',
    'save',
    'unknown',
  ]) {
    let calls = 0;
    const cache = createDisplayResourceCache(),
      editor = {
        tableCreationResources() {
          return { character: [++calls] };
        },
      };
    const view = cache.view(editor);
    view.tableCreationResources();
    cache.beginRequest({ kind }, { format: 'hwpx', editor, historyEnabled: true });
    assert.deepEqual(view.tableCreationResources(), { character: [2] }, kind);
  }
  let fail = false;
  const cache = createDisplayResourceCache(),
    a = {
      tableCreationResources() {
        if (fail) throw Error('원 조회 거부');
        return [1];
      },
    },
    b = {
      tableCreationResources() {
        return [2];
      },
    };
  const av = cache.view(a);
  av.tableCreationResources();
  cache.invalidate();
  fail = true;
  assert.throws(() => av.tableCreationResources(), /원 조회 거부/);
  cache.finishRequest();
  fail = false;
  assert.deepEqual(av.tableCreationResources(), [1]);
  assert.deepEqual(cache.view(b).tableCreationResources(), [2]);
  assert.throws(() => av.tableCreationResources(), /StaleDisplayResourceOwner/);
});
