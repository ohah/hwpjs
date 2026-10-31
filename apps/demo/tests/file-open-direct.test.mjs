import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentOpenUI } from '../src/document-open-ui.ts';
import { createDemoShell } from '../src/shell.ts';
import { Document, all, fire } from './fake-dom.mjs';
function setup(extra = {}) {
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [],
    order = [];
  let state = {
    title: '',
    status: '',
    openFile: { enabled: true },
    openFixture: { enabled: true },
  };
  const ui = createDocumentOpenUI(root, {
    id: 'direct-case',
    fixtures: [{ id: 'one', name: '예제' }],
    getState: () => state,
    fileConnected: true,
    fixtureConnected: true,
    onFile: (file) => calls.push(file),
    onFixture: (id) => calls.push(id),
    onSelected: () => order.push('selected'),
    ...extra,
  });
  ui.update();
  ui.file.click = () => order.push('picker');
  return {
    doc,
    root,
    ui,
    calls,
    order,
    set state(value) {
      state = value;
    },
    get state() {
      return state;
    },
  };
}
test('두 진입은 이벤트 반환 전에 같은 input을 동기로 열고 선택 때만 파일을 전달한다', () => {
  const h = setup();
  for (const b of [h.ui.directFileAction, h.ui.fileAction]) {
    fire(b, 'click');
    h.order.push('returned');
  }
  assert.deepEqual(h.order, ['picker', 'returned', 'picker', 'returned']);
  assert.deepEqual(h.calls, []);
  const file = { name: '원본.hwp' };
  for (let i = 0; i < 2; i++) {
    h.ui.file.files = [file];
    h.ui.file.value = 'same';
    fire(h.ui.file, 'change');
    assert.equal(h.ui.file.value, '');
  }
  assert.deepEqual(h.calls, [file, file]);
  assert.deepEqual(h.order.slice(4), ['selected', 'selected']);
  h.ui.destroy();
});
test('선택 취소·stale 가용성·busy·연결 없음·종료 후 입력을 거부한다', () => {
  const h = setup();
  h.ui.file.files = [];
  fire(h.ui.file, 'change');
  assert.deepEqual(h.calls, []);
  for (const state of [
    { ...h.state, busy: true },
    { ...h.state, openFile: { enabled: false, reason: '전환 대기' } },
  ]) {
    h.state = state;
    for (const b of [h.ui.directFileAction, h.ui.fileAction]) fire(b, 'click');
    h.ui.file.files = [{ name: '차단.hwp' }];
    h.ui.file.value = 'stale';
    fire(h.ui.file, 'change');
    assert.equal(h.ui.file.value, '');
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.order, []);
    h.ui.update();
    for (const b of [h.ui.directFileAction, h.ui.fileAction]) assert.equal(b.disabled, true);
  }
  h.state = { ...h.state, busy: false, openFile: { enabled: true } };
  h.ui.update();
  h.ui.destroy();
  for (const b of [h.ui.directFileAction, h.ui.fileAction]) fire(b, 'click');
  fire(h.ui.file, 'change');
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.calls, []);
  const disconnected = setup({ fileConnected: false });
  for (const b of [disconnected.ui.directFileAction, disconnected.ui.fileAction]) {
    assert.equal(b.disabled, true);
    fire(b, 'click');
  }
  assert.deepEqual(disconnected.order, []);
  disconnected.ui.destroy();
});
test('파일열기 추가는 예제 선택·없는 fixture 거부·선택 유지를 바꾸지 않는다', () => {
  const h = setup(),
    picker = all(h.root, (n) => n.dataset.role === 'fixture-picker')[0],
    open = all(h.root, (n) => n.dataset.role === 'open-selected-example')[0];
  picker.value = 'bad';
  fire(open, 'click');
  assert.deepEqual(h.calls, []);
  picker.value = 'one';
  h.ui.setFixtures([
    { id: 'one', name: '예제' },
    { id: 'two', name: '다른 예제' },
  ]);
  assert.equal(picker.value, 'one');
  fire(open, 'click');
  assert.deepEqual(h.calls, ['one']);
  h.ui.destroy();
});
test('상단 진입·메뉴 진입·공유 설명은 인스턴스별로 존재하며 도구22를 유지한다', () => {
  const doc = new Document(),
    roots = [],
    shells = [],
    ids = [];
  for (let i = 0; i < 2; i++) {
    const root = doc.createElement('div');
    roots.push(root);
    shells.push(
      createDemoShell(root, {
        framework: 'vanilla',
        routes: { vanilla: '/v/', headless: '/h/', react: '/r/', svelte: '/s/' },
        fixtures: [],
        getState: () => ({
          title: '',
          status: '',
          openFile: { enabled: false, reason: '열기 대기' },
        }),
        onOpenFile() {},
      }),
    );
    const direct = all(root, (n) => n.dataset.role === 'open-document-direct')[0],
      menu = all(root, (n) => n.dataset.role === 'open-document')[0];
    assert.equal(direct.parentElement.tagName, 'HEADER');
    assert.equal(menu.parentElement.className, 'hwp-demo-file-actions');
    assert.equal(direct.textContent, '파일열기');
    for (const b of [direct, menu]) {
      assert.equal(b.type, 'button');
      assert.equal(b.disabled, true);
      assert.equal(b.title, '열기 대기');
      const id = b.getAttribute('aria-describedby'),
        reason = all(root, (n) => n.id === id)[0];
      assert.ok(reason);
      assert.equal(reason.parentElement.tagName, 'HEADER');
      assert.equal(reason.textContent, '열기 대기');
    }
    assert.equal(all(root, (n) => n.className === 'hwp-demo-tool').length, 22);
    ids.push(new Set(all(root, (n) => n.id).map((n) => n.id)));
  }
  assert.equal(
    [...ids[0]].some((id) => ids[1].has(id)),
    false,
  );
  for (const shell of shells) shell.destroy();
  assert.ok(roots.every((root) => root.children.length === 0));
});
