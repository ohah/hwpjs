import test from 'node:test';
import assert from 'node:assert/strict';
import { contextTarget, mountDemoContextMenu, type ContextTarget } from '../src/context-menu.ts';
import { contextCommandIds, contextCommandLabel } from '../src/command-support.ts';
const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
};
function state(extra: Record<string, unknown> = {}) {
  const row = {
    section: 0,
    paragraph: 1,
    text: 'AB',
    editable: true,
    selectionOwner: 'section:0:body',
    ...extra,
  };
  const owner = extra.tableCell ? 'section:0:table:7:list:9' : row.selectionOwner;
  return {
    ...token,
    token,
    status: 'ready',
    content: { format: 'hwpx', paragraphs: [row] },
    selection: {
      ...token,
      coordinateSpace: 'display',
      format: 'hwpx',
      owner,
      section: 0,
      paragraph: 1,
      startUnit: 0,
      endUnit: 1,
      affinity: 'forward',
    },
  } as any;
}
test('공개 선택 validator를 통과한 본문과 셀만 표시 종류를 구분한다', () => {
  assert.equal(contextTarget(state(), null).kind, 'body');
  assert.equal(
    contextTarget(state({ tableCell: { tableNode: 7, listNode: 9 } }), null).kind,
    'table-cell',
  );
  for (const change of ['clipped', 'duplicate', 'owner', 'epoch']) {
    const s = state();
    if (change === 'clipped') s.content.paragraphs[0].clipped = true;
    if (change === 'duplicate') s.content.paragraphs.push({ ...s.content.paragraphs[0] });
    if (change === 'owner') s.selection.owner = 'forged';
    if (change === 'epoch') s.selection.operationRevision--;
    assert.equal(contextTarget(s, null).kind, 'none', change);
  }
});
test('그림 관측은 기존 텍스트보다 우선하지만 속성 명령을 만들지 않는다', () => {
  const picture = { ...token, section: 0, pictureNode: 13 };
  assert.equal(contextTarget(state(), picture).kind, 'picture');
  assert.equal(contextTarget(state(), undefined).kind, 'none');
  assert.equal(contextTarget(state(), { ...picture, generation: 0 }).kind, 'none');
  assert.equal(contextTarget(state(), { ...picture, pictureNode: -1 }).kind, 'none');
  assert.ok(!contextCommandIds('picture').includes('character-properties'));
  assert.ok(!contextCommandIds('picture').includes('object-properties'));
});
test('셀 도구는 기존 명령 ID를 재사용하고 capability를 만들지 않는다', () => {
  assert.equal(contextCommandLabel('paragraph-properties', 'table-cell'), '셀 문단 속성');
  for (const id of ['font-name', 'text-color', 'align-left', 'character-properties'] as const)
    assert.ok(contextCommandIds('table-cell').includes(id));
  assert.ok(!contextCommandIds('none').includes('paste'));
});
function harness() {
  const document: any = new EventTarget();
  document.defaultView = Object.assign(new EventTarget(), { innerWidth: 600, innerHeight: 400 });
  class Node extends EventTarget {
    nodeType = 1;
    children: any[] = [];
    dataset: any = {};
    style: any = {};
    attributes: any = {};
    disabled = false;
    hidden = false;
    parent: any = null;
    isConnected = true;
    tag: string;
    constructor(tag: string) {
      super();
      this.tag = tag;
    }
    append(...nodes: any[]) {
      for (const n of nodes) {
        n.parent = this;
        this.children.push(n);
      }
    }
    replaceChildren(...nodes: any[]) {
      this.children = [];
      this.append(...nodes);
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((n: any) => n !== this);
    }
    setAttribute(k: string, v: any) {
      this.attributes[k] = v;
    }
    contains(n: any) {
      while (n) {
        if (n === this) return true;
        n = n.parent;
      }
      return false;
    }
    focus() {
      document.activeElement = this;
      onFocus?.();
    }
    closest() {
      return this.tag === 'button' ? this : null;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 150, height: 100 };
    }
  }
  document.createElement = (tag: string) => new Node(tag);
  document.head = new Node('head');
  document.body = new Node('body');
  const root: any = new Node('main'),
    input = new Node('input');
  root.ownerDocument = document;
  document.body.append(root, input);
  let onFocus: (() => void) | undefined;
  input.focus();
  let target: ContextTarget = { kind: 'body', key: 'e:d:1:2:3:body' },
    enabled = true;
  const calls: string[] = [],
    listeners = new Set<() => void>(),
    errors: unknown[] = [];
  const control = mountDemoContextMenu({
    root,
    getTarget: () => target,
    getState: () => ({
      title: '',
      status: '',
      actions: { copy: { enabled }, bold: { enabled }, 'paragraph-properties': { enabled } },
    }),
    execute: (a) => {
      calls.push(a.command);
    },
    subscribe: (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    onError: (e) => errors.push(e),
  });
  const menu = document.body.children.find((n: any) => n.attributes.role === 'menu');
  const send = (node: any, type: string, values: any = {}) => {
    const e = new Event(type, { cancelable: true });
    const { target: to, ...rest } = values;
    Object.assign(e, rest);
    if (to) Object.defineProperty(e, 'target', { value: to });
    node.dispatchEvent(e);
  };
  return {
    control,
    calls,
    errors,
    menu,
    listeners,
    open: () => send(root, 'contextmenu', { button: 2, clientX: 40, clientY: 40 }),
    click: (id: string) =>
      send(menu, 'click', { target: menu.children.find((n: any) => n.dataset.commandId === id) }),
    setTarget: (v: ContextTarget) => {
      target = v;
    },
    setEnabled: (v: boolean) => {
      enabled = v;
    },
    setFocus: (f: () => void) => {
      onFocus = f;
    },
  };
}
for (const change of ['owner', 'document', 'undo', 'view', 'range'])
  test(`메뉴 연 뒤 ${change} 변경은 기존 버튼 실행을 거부한다`, () => {
    const h = harness();
    try {
      h.open();
      h.setTarget({ kind: 'body', key: change });
      h.click('copy');
      assert.deepEqual(h.calls, []);
    } finally {
      h.control.close();
    }
  });
test('포커스 복원 중 선택 변경도 실행 직전에 다시 차단한다', () => {
  const h = harness();
  try {
    h.open();
    h.setFocus(() => h.setTarget({ kind: 'table-cell', key: 'new' }));
    h.click('copy');
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});
test('현재 권한 해제와 미지원 명령은 실행할 수 없다', () => {
  const h = harness();
  try {
    h.open();
    h.setEnabled(false);
    h.click('copy');
    assert.deepEqual(h.calls, []);
    assert.ok(!h.menu.children.some((n: any) => n.dataset.commandId === 'object-properties'));
  } finally {
    h.control.close();
  }
});
test('정상 명령은 기존 dispatcher에 한 번만 전달하고 종료 후 구독을 해제한다', () => {
  const h = harness();
  h.open();
  h.click('copy');
  assert.deepEqual(h.calls, ['copy']);
  h.control.close();
  assert.equal(h.listeners.size, 0);
  assert.deepEqual(h.errors, []);
});

for (const axis of [
  'editorId',
  'documentId',
  'generation',
  'operationRevision',
  'viewRevision',
  'owner',
  'range',
] as const)
  test(`실제 선택 서명의 ${axis} 변경은 오래된 메뉴를 거부한다`, () => {
    const before = state();
    const after = state();
    if (axis === 'owner') {
      after.content.paragraphs[0].selectionOwner = 'section:0:body:new';
      after.selection.owner = 'section:0:body:new';
    } else if (axis === 'range') {
      after.selection.endUnit = 2;
    } else {
      const value =
        typeof token[axis] === 'number' ? Number(token[axis]) + 1 : `${token[axis]}:new`;
      after[axis] = value;
      after.token = { ...after.token, [axis]: value };
      after.selection = { ...after.selection, [axis]: value };
    }
    const h = harness();
    try {
      h.setTarget(contextTarget(before, null));
      h.open();
      h.setTarget(contextTarget(after, null));
      h.click('copy');
      assert.deepEqual(h.calls, []);
    } finally {
      h.control.close();
    }
  });
