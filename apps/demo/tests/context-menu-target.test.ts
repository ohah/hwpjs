import test from 'node:test';
import assert from 'node:assert/strict';
import { contextTarget, mountDemoContextMenu, type ContextTarget } from '../src/context-menu.ts';
import {
  CONTEXT_COMMAND_IDS,
  contextCommandIds,
  contextCommandLabel,
} from '../src/command-support.ts';
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
test('그림 관측은 기존 텍스트보다 우선하고 개체 속성만 추가한다', () => {
  const picture = { ...token, section: 0, pictureNode: 13 };
  assert.equal(contextTarget(state(), picture).kind, 'picture');
  assert.equal(contextTarget(state(), undefined).kind, 'none');
  assert.equal(contextTarget(state(), { ...picture, generation: 0 }).kind, 'none');
  assert.equal(contextTarget(state(), { ...picture, pictureNode: -1 }).kind, 'none');
  assert.ok(!contextCommandIds('picture').includes('character-properties'));
  assert.ok(contextCommandIds('picture').includes('object-properties'));
  assert.equal(CONTEXT_COMMAND_IDS.filter((id) => id === 'object-properties').length, 1);
  for (const kind of ['body', 'table-cell', 'none'] as const)
    assert.ok(!contextCommandIds(kind).includes('object-properties'));
});
test('셀 도구는 기존 명령 ID를 재사용하고 capability를 만들지 않는다', () => {
  assert.equal(contextCommandLabel('paragraph-properties', 'table-cell'), '셀 문단 속성');
  for (const id of ['font-name', 'text-color', 'align-left', 'character-properties'] as const)
    assert.ok(contextCommandIds('table-cell').includes(id));
  assert.ok(!contextCommandIds('none').includes('paste'));
});
function harness(surfaceText = false) {
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
  let textCurrent = true,
    textEpoch = 0,
    textKey = 'range:A';
  let textCaptureThrows = false;
  let onTextCurrent: (() => void) | undefined;
  let onState: (() => void) | undefined;
  const calls: string[] = [],
    listeners = new Set<() => void>(),
    errors: unknown[] = [];
  const control = mountDemoContextMenu({
    root,
    getTarget: () => target,
    captureTextSelection: surfaceText
      ? () => {
          if (textCaptureThrows) throw Error('UnavailableSelection');
          const epoch = textEpoch,
            key = textKey;
          return {
            current() {
              onTextCurrent?.();
              return textCurrent && epoch === textEpoch && key === textKey;
            },
          };
        }
      : undefined,
    getState: () => (
      onState?.(),
      {
        title: '',
        status: '',
        actions: {
          copy: { enabled },
          bold: { enabled },
          'paragraph-properties': { enabled },
          'object-properties': { enabled },
        },
      }
    ),
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
    setTextCurrent: (value: boolean) => {
      textCurrent = value;
    },
    setSurfaceSelection: (key: string) => {
      textKey = key;
      textEpoch++;
    },
    setSurfaceKeyOnly: (key: string) => {
      textKey = key;
    },
    setCaptureThrows: () => {
      textCaptureThrows = true;
    },
    onTextCurrent: (fn: () => void) => {
      onTextCurrent = fn;
    },
    onState: (fn: () => void) => {
      onState = fn;
    },
    keyboardOpen: (values: Record<string, unknown> = {}) =>
      send(root, 'keydown', { key: 'F10', shiftKey: true, ...values }),
    escape: () => send(menu, 'keydown', { key: 'Escape' }),
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

test('그림 메뉴 개체 속성은 기존 실행 경로로 한 번 전달된다', () => {
  const h = harness();
  try {
    h.setTarget({ kind: 'picture', key: 'picture:13' });
    h.open();
    assert.ok(h.menu.children.some((n: any) => n.dataset.commandId === 'object-properties'));
    h.click('object-properties');
    assert.deepEqual(h.calls, ['object-properties']);
  } finally {
    h.control.close();
  }
});
for (const change of ['disabled', 'picture', 'document', 'body', 'focus'] as const)
  test(`그림 속성 메뉴 ${change} 변경 후 실행은 거부한다`, () => {
    const h = harness();
    try {
      h.setTarget({ kind: 'picture', key: 'picture:13' });
      h.open();
      if (change === 'disabled') h.setEnabled(false);
      else if (change === 'focus')
        h.setFocus(() => h.setTarget({ kind: 'picture', key: 'picture:14' }));
      else h.setTarget({ kind: change === 'body' ? 'body' : 'picture', key: change });
      h.click('object-properties');
      assert.deepEqual(h.calls, []);
    } finally {
      h.control.close();
    }
  });

test('Surface 다문단 캡처는 owner 분류 없이 기존 텍스트 명령을 한 번 전달한다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'canvas-multi' });
    h.open();
    assert.ok(h.menu.children.some((n: any) => n.dataset.commandId === 'bold' && !n.disabled));
    assert.ok(h.menu.children.some((n: any) => n.dataset.commandId === 'copy' && !n.disabled));
    assert.ok(
      !h.menu.children.some((n: any) =>
        ['object-properties', 'table-cell-properties', 'insert-image'].includes(
          n.dataset.commandId,
        ),
      ),
    );
    h.click('bold');
    assert.deepEqual(h.calls, ['bold']);
  } finally {
    h.control.close();
  }
});
for (const unavailable of ['absent', 'false', 'throw'] as const)
  test(`다문단 캡처 ${unavailable}는 기존 문서 목록으로만 fallback한다`, () => {
    const h = harness(unavailable !== 'absent');
    try {
      h.setTarget({ kind: 'none', key: 'none' });
      if (unavailable === 'false') h.setTextCurrent(false);
      if (unavailable === 'throw') h.setCaptureThrows();
      h.open();
      assert.deepEqual(
        h.menu.children.map((n: any) => n.dataset.commandId),
        contextCommandIds('none'),
      );
      h.click('bold');
      assert.deepEqual(h.calls, []);
    } finally {
      h.control.close();
    }
  });
for (const change of ['Canvas A→B', '외부 선택 null', 'IME', 'pending', 'lease 종료'] as const)
  test(`동일 Core token의 ${change}도 캡처가 무효하면 실행하지 않는다`, () => {
    const h = harness(true);
    try {
      h.setTarget({ kind: 'none', key: 'same-core-token' });
      h.open();
      h.setTextCurrent(false);
      h.click('copy');
      assert.deepEqual(h.calls, []);
    } finally {
      h.control.close();
    }
  });
test('다문단 포커스 복원 중 current 무효화는 dispatch 전에 거부한다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'multi' });
    h.open();
    h.setFocus(() => h.setTextCurrent(false));
    h.click('copy');
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});
test('다문단 표시 콜백 재진입 후에는 이미 보인 버튼도 실행하지 않는다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'multi' });
    h.open();
    h.onState(() => h.setTextCurrent(false));
    h.click('bold');
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});
test('다문단 캡처 current의 예외와 종료 재진입은 fail closed다', () => {
  for (const mode of ['throw', 'close']) {
    const h = harness(true);
    try {
      h.setTarget({ kind: 'none', key: 'multi' });
      h.open();
      h.onTextCurrent(() => {
        if (mode === 'throw') throw Error('CurrentUnavailable');
        h.control.close();
      });
      h.click('bold');
      assert.deepEqual(h.calls, []);
    } finally {
      h.control.close();
    }
  }
});
test('그림과 단일 셀은 다문단 캡처 포트가 있어도 기존 메뉴를 유지한다', () => {
  for (const kind of ['picture', 'table-cell'] as const) {
    const h = harness(true);
    try {
      h.setCaptureThrows();
      h.setTarget({ kind, key: kind });
      h.open();
      assert.deepEqual(
        h.menu.children.map((n: any) => n.dataset.commandId),
        contextCommandIds(kind),
      );
    } finally {
      h.control.close();
    }
  }
});
test('ShiftF10은 다문단 메뉴를 열고 Escape는 편집 없이 닫는다; IME는 열지 않는다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'multi' });
    h.keyboardOpen({ isComposing: true });
    assert.equal(h.menu.hidden, true);
    h.keyboardOpen();
    assert.equal(h.menu.hidden, false);
    assert.ok(h.menu.children.some((n: any) => n.dataset.commandId === 'copy'));
    h.escape();
    assert.equal(h.menu.hidden, true);
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});

test('Core token과 Surface key가 원복돼도 capture epoch가 다르면 stale이다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'same-core' });
    h.open();
    h.setSurfaceSelection('range:B');
    h.setSurfaceSelection('range:A');
    h.click('bold');
    assert.deepEqual(h.calls, []);
    h.open();
    h.click('bold');
    assert.deepEqual(h.calls, ['bold']);
  } finally {
    h.control.close();
  }
});
test('epoch를 바꾸지 않아도 Surface key 변경은 기존 캡처를 무효화한다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'same-core' });
    h.open();
    h.setSurfaceKeyOnly('range:B');
    h.click('copy');
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});
test('getState 재진입으로 새 캡처가 생겨도 이전 실행은 새 캡처를 빌리지 않는다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'same-core' });
    h.open();
    let once = false;
    h.onState(() => {
      if (once) return;
      once = true;
      h.setSurfaceSelection('range:B');
      h.open();
    });
    h.click('bold');
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});

test('숨긴 메뉴도 문서 변경 시 이전 Surface 캡처 callback을 버린다', () => {
  const h = harness(true);
  try {
    h.setTarget({ kind: 'none', key: 'old-document' });
    h.open();
    h.escape();
    let reads = 0;
    h.onTextCurrent(() => {
      reads++;
    });
    h.setTarget({ kind: 'none', key: 'new-document' });
    for (const listener of h.listeners) listener();
    const afterInvalidation = reads;
    for (const listener of h.listeners) listener();
    assert.equal(reads, afterInvalidation);
    assert.deepEqual(h.calls, []);
  } finally {
    h.control.close();
  }
});
