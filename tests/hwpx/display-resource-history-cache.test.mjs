import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisplayResourceCache } from '../../web/preview/display-resource-cache.mjs';
function setup() {
  let version = 1,
    calls = 0,
    fail = false;
  const editor = {
    characterShapes() {
      calls++;
      if (fail) throw Error('원 조회 오류');
      return [{ id: version }];
    },
  };
  const cache = createDisplayResourceCache();
  const view = cache.view(editor);
  const run = (kind, { enabled = true, error = false } = {}) => {
    cache.beginRequest({ kind }, { format: 'hwpx', editor, historyEnabled: enabled });
    let value;
    try {
      value = view.characterShapes();
    } finally {
      cache.finishRequest(
        error,
        enabled ? undefined : { historyRevision: 0, historyRevisions: [0] },
      );
    }
    return value;
  };
  return {
    editor,
    cache,
    view,
    run,
    calls: () => calls,
    version: (n) => (version = n),
    fail: (x) => (fail = x),
  };
}
test('새 이력 시작이 없으면 undo/redo는 기존처럼 원 조회를 수행한다', () => {
  const f = setup();
  f.run('undo');
  f.run('redo');
  assert.equal(f.calls(), 2);
});
test('성공한 새 이력 뒤 본문 splice와 undo/redo만 있으면 분리 복사만 재사용한다', () => {
  const f = setup();
  const a = f.run('enable', { enabled: false });
  a[0].id = 7;
  for (const k of ['splice', 'splice', 'undo', 'undo', 'redo', 'splice', 'undo'])
    assert.deepEqual(f.run(k), [{ id: 1 }]);
  assert.equal(f.calls(), 1);
});
test('실패한 enable은 자격을 만들지 않는다', () => {
  const f = setup();
  f.run('enable', { enabled: false, error: true });
  f.run('undo');
  assert.equal(f.calls(), 2);
});
test('서식 명령 뒤에는 이전 본문 구간으로 되돌아가도 보수적으로 재조회한다', () => {
  const f = setup();
  f.run('enable', { enabled: false });
  f.version(2);
  assert.deepEqual(f.run('format'), [{ id: 2 }]);
  f.version(1);
  assert.deepEqual(f.run('undo'), [{ id: 1 }]);
  f.run('undo');
  assert.equal(f.calls(), 4);
});
test('이미 켜진 이력의 enable 재요청은 새 이력이라고 가정하지 않는다', () => {
  const f = setup();
  f.run('enable', { enabled: true });
  f.run('undo');
  assert.equal(f.calls(), 2);
});
test('문서 owner 교체는 재사용 자격과 옛 facade를 무효화한다', () => {
  const f = setup();
  f.run('enable', { enabled: false });
  const next = { characterShapes: () => [{ id: 9 }] };
  f.cache.beginRequest({ kind: 'undo' }, { format: 'hwpx', editor: next, historyEnabled: true });
  assert.deepEqual(f.cache.view(next).characterShapes(), [{ id: 9 }]);
  assert.throws(() => f.view.characterShapes(), /StaleDisplayResourceOwner/);
  f.cache.finishRequest();
});
test('원 조회 오류는 그대로 전파하며 이후 undo도 재조회한다', () => {
  const f = setup();
  f.run('enable', { enabled: false });
  f.run('query-edit-range', { error: true });
  f.fail(true);
  assert.throws(() => f.run('undo'), /원 조회 오류/);
  f.fail(false);
  f.run('undo');
  assert.equal(f.calls(), 3);
});
test('reset과 알 수 없는 요청은 자격을 해제한다', () => {
  const f = setup();
  f.run('enable', { enabled: false });
  f.run('future-command');
  f.run('undo');
  assert.equal(f.calls(), 3);
  f.cache.reset();
  const view = f.cache.view(f.editor);
  f.cache.beginRequest(
    { kind: 'undo' },
    { format: 'hwpx', editor: f.editor, historyEnabled: true },
  );
  view.characterShapes();
  f.cache.finishRequest();
  assert.equal(f.calls(), 4);
});

test('권위 있는 단일 이력 root metadata가 없거나 다르면 재사용하지 않는다', () => {
  for (const metadata of [
    undefined,
    {},
    { historyRevision: 0, historyRevisions: [0, 1] },
    { historyRevision: 1, historyRevisions: [0] },
    { historyRevision: 0, historyRevisions: null },
  ]) {
    let calls = 0;
    const editor = {
      characterShapes() {
        calls++;
        return [];
      },
    };
    const cache = createDisplayResourceCache(),
      view = cache.view(editor);
    cache.beginRequest({ kind: 'enable' }, { format: 'hwpx', editor, historyEnabled: false });
    view.characterShapes();
    cache.finishRequest(false, metadata);
    cache.beginRequest({ kind: 'undo' }, { format: 'hwpx', editor, historyEnabled: true });
    view.characterShapes();
    cache.finishRequest();
    assert.equal(calls, 2);
  }
});

test('외부 invalidate와 refresh는 다음 undo 전 재사용 자격을 해제한다', () => {
  for (const kind of ['invalidate', 'refresh']) {
    const f = setup();
    f.run('enable', { enabled: false });
    if (kind === 'invalidate') f.cache.invalidate();
    else f.run('refresh');
    f.run('undo');
    f.run('redo');
    assert.equal(f.calls(), kind === 'invalidate' ? 3 : 4);
  }
});
test('새 이력의 첫 헤더 조회가 실패하면 root metadata만으로 자격을 얻지 않는다', () => {
  const f = setup();
  f.fail(true);
  assert.throws(() => f.run('enable', { enabled: false }), /원 조회 오류/);
  f.fail(false);
  f.run('undo');
  f.run('redo');
  assert.equal(f.calls(), 3);
});

test('헤더 입력 alias와 반환 alias는 기존 두 소유 복사로 격리한다', () => {
  const raw = [{ id: 1 }];
  const editor = { characterShapes: () => raw };
  const cache = createDisplayResourceCache(),
    view = cache.view(editor);
  cache.beginRequest({ kind: 'enable' }, { format: 'hwpx', editor, historyEnabled: false });
  const first = view.characterShapes();
  cache.finishRequest(false, { historyRevision: 0, historyRevisions: [0] });
  first[0].id = 9;
  assert.equal(raw[0].id, 1);
  raw[0].id = 8;
  cache.beginRequest({ kind: 'undo' }, { format: 'hwpx', editor, historyEnabled: true });
  assert.deepEqual(view.characterShapes(), [{ id: 1 }]);
  cache.finishRequest();
});
test('OOM 원 오류 객체를 유지하고 새 이력 자격을 부여하지 않는다', () => {
  const error = new Error('OutOfMemory');
  let fail = true,
    calls = 0;
  const editor = {
    characterShapes() {
      calls++;
      if (fail) throw error;
      return [];
    },
  };
  const cache = createDisplayResourceCache(),
    view = cache.view(editor);
  cache.beginRequest({ kind: 'enable' }, { format: 'hwpx', editor, historyEnabled: false });
  assert.throws(
    () => view.characterShapes(),
    (value) => value === error,
  );
  cache.finishRequest(false, { historyRevision: 0, historyRevisions: [0] });
  fail = false;
  for (const kind of ['undo', 'redo']) {
    cache.beginRequest({ kind }, { format: 'hwpx', editor, historyEnabled: true });
    view.characterShapes();
    cache.finishRequest();
  }
  assert.equal(calls, 3);
});
