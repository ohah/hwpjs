import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './non-text-history-fixture.mjs';
import { createCanvasSurface } from '../src/surface.ts';
const tick = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
async function cleanup(f) {
  const done = f.surface.dispose();
  while (f.waits.length) f.reject();
  await done;
  await tick();
}
function setup() {
  const f = fixture();
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (s) => f.reports.push(s),
  });
  f.attach(surface);
  return { ...f, surface };
}
test('텍스트 선택 없는 이력은 공개 FIFO 한 번, 그림 선택 없어도 다음 redo 가능', async () => {
  const f = setup();
  try {
    assert.equal(f.surface.canRequestHistory('undo'), true);
    assert.equal(f.surface.requestHistory('undo'), true);
    assert.deepEqual(
      f.requests.map((x) => x.kind),
      ['public-undo'],
    );
    assert.equal(f.surface.requestHistory('undo'), false);
    f.ack({ operationRevision: 2, nativeHistoryRevision: 0, nativeHistoryRevisions: [0, 1] });
    await tick();
    assert.notEqual(f.canvas().dataset.selectionAuthority, 'history-unresolved');
    assert.equal(f.surface.requestHistory('redo'), true);
    f.ack({ operationRevision: 3, nativeHistoryRevision: 1, nativeHistoryRevisions: [1, 0] });
    await tick();
    assert.deepEqual(
      f.requests.map((x) => x.kind),
      ['public-undo', 'public-redo'],
    );
  } finally {
    await cleanup(f);
  }
});
test('공개 history 실패 뒤 재접수, 가짜 텍스트 위치 없음', async () => {
  const f = setup();
  try {
    assert(f.surface.requestHistory('undo'));
    f.reject();
    await tick();
    assert(f.surface.requestHistory('undo'));
    assert.equal(f.canvas().dataset.caret, '');
  } finally {
    const done = f.surface.dispose();
    f.reject();
    await done;
    await tick();
  }
});
for (const mode of ['close', 'document', 'lease', 'refresh'])
  test('늦은 응답은 현재 권한을 발급하지 않음: ' + mode, async () => {
    const f = setup();
    try {
      assert(f.surface.requestHistory('undo'));
      const before = f.reports.length;
      let disposal;
      if (mode === 'close') disposal = f.surface.dispose();
      if (mode === 'document') f.install({ documentId: 'other', generation: 2 });
      if (mode === 'lease') f.revoke();
      f.ack(mode === 'refresh' ? { status: 'refresh-required' } : {});
      await tick();
      await disposal;
      assert.equal(
        f.reports.slice(before).some((s) => s.includes('텍스트 복원 위치 없음')),
        false,
      );
    } finally {
      await cleanup(f);
    }
  });
for (const mode of ['compositionstart', 'draft', 'core-selection', 'unavailable'])
  test('텍스트·IME·권한 경계는 공개 비텍스트 경로를 타지 않음: ' + mode, async () => {
    const f = setup();
    try {
      if (mode === 'compositionstart') {
        f.select();
        f.input().dispatchEvent(new Event('compositionstart'));
      }
      if (mode === 'draft') f.input().value = '미반영';
      if (mode === 'core-selection')
        f.install({ selection: { section: 0, paragraph: 0, startUnit: 0, endUnit: 0 } });
      if (mode === 'unavailable') f.install({ nativeHistoryRevisions: [1] });
      f.surface.requestHistory('undo');
      await tick();
      assert.equal(
        f.requests.some((x) => x.kind.startsWith('public-')),
        false,
      );
    } finally {
      await cleanup(f);
    }
  });

test('dispose는 이미 접수된 Core 작업을 drain하고 늦은 알림은 내보내지 않음', async () => {
  const f = setup();
  assert(f.surface.requestHistory('undo'));
  let completed = false;
  const before = f.reports.length;
  const disposal = f.surface.dispose().then(() => (completed = true));
  await tick();
  assert.equal(completed, false);
  f.ack({ operationRevision: 2 });
  await disposal;
  assert.equal(completed, true);
  assert.equal(f.reports.length, before);
});
test('입력·그림 포인터·중복 이력은 비텍스트 Core 접수 중 차단', async () => {
  const f = setup();
  try {
    assert(f.surface.requestHistory('undo'));
    const before = f.pictureSelections();
    assert.equal(f.surface.getContextPicture(), undefined);
    const pointer = new Event('pointerdown', { cancelable: true });
    Object.assign(pointer, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    f.canvas().dispatchEvent(pointer);
    assert.equal(f.pictureSelections(), before);
    const input = new Event('beforeinput', { cancelable: true });
    Object.assign(input, { inputType: 'insertText', data: 'x' });
    f.input().dispatchEvent(input);
    assert.equal(input.defaultPrevented, true);
    assert.equal(f.requests.length, 1);
    assert.equal(f.surface.requestHistory('redo'), false);
    f.ack();
    await tick();
  } finally {
    await cleanup(f);
  }
});
test('응답이 복원한 실제 텍스트 선택을 정규 경로로 재투영하고 null로 덮지 않음', async () => {
  const f = setup();
  try {
    assert(f.surface.requestHistory('undo'));
    const selection = {
      ...f.state().token,
      operationRevision: 2,
      affinity: 'forward',
      coordinateSpace: 'display',
      format: 'hwpx',
      owner: 'section:0:body',
      section: 0,
      paragraph: 0,
      startUnit: 1,
      endUnit: 1,
    };
    f.ack({
      operationRevision: 2,
      nativeHistoryRevision: 0,
      nativeHistoryRevisions: [0, 1],
      selection,
    });
    await tick();
    assert.equal(f.state().selection, selection);
    assert.equal(f.canvas().dataset.caret, '0:0:1');
    f.surface.requestHistory('redo');
    await tick();
    assert.equal(
      f.requests.some((x) => x.kind === 'public-redo'),
      false,
    );
  } finally {
    await cleanup(f);
  }
});
test('해제 뒤 완료 알림에서 새 redo 권한이 보이고 동기 재진입은 단일 접수', async () => {
  const f = fixture();
  let observed = false;
  let surface;
  surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (s) => {
      f.reports.push(s);
      if (s.includes('텍스트 복원 위치 없음')) {
        observed = surface.canRequestHistory('redo');
        assert(surface.requestHistory('redo'));
      }
    },
  });
  f.attach(surface);
  const g = { ...f, surface };
  try {
    assert(surface.requestHistory('undo'));
    f.ack({ operationRevision: 2, nativeHistoryRevision: 0, nativeHistoryRevisions: [0, 1] });
    await tick();
    assert(observed);
    assert.deepEqual(
      f.requests.map((x) => x.kind),
      ['public-undo', 'public-redo'],
    );
  } finally {
    await cleanup(g);
  }
});
for (const mode of ['poisoned', 'readonly', 'refresh-required', 'closed'])
  test('비텍스트라도 기존 Core 이력 권한 거부: ' + mode, async () => {
    const f = setup();
    try {
      if (mode === 'poisoned') f.install({ historyRecoveryRequired: true });
      if (mode === 'readonly')
        f.install({ capabilities: { historyAvailable: true, readOnly: true } });
      if (mode === 'refresh-required') f.install({ status: 'refresh-required' });
      if (mode === 'closed') await f.surface.dispose();
      assert.equal(f.surface.requestHistory('undo'), false);
      assert.equal(f.requests.length, 0);
    } finally {
      await cleanup(f);
    }
  });
test('기존 unresolved 텍스트 barrier를 비텍스트로 세탁하지 않음', async () => {
  const f = setup();
  try {
    f.select();
    assert(f.surface.requestHistory('undo'));
    await tick();
    assert.equal(f.requests[0].kind, 'undo');
    f.ack({
      selection: null,
      operationRevision: 2,
      nativeHistoryRevision: 0,
      nativeHistoryRevisions: [0, 1],
    });
    await tick();
    f.surface.requestHistory('redo');
    await tick();
    assert.equal(
      f.requests.some((x) => x.kind.startsWith('public-')),
      false,
    );
  } finally {
    await cleanup(f);
  }
});

test('그림 없는 undo는 텍스트 unresolved barrier를 만들지 않음', async () => {
  const f = setup();
  try {
    assert(f.surface.requestHistory('undo'));
    await tick();
    f.ack({ operationRevision: 2, nativeHistoryRevision: 0, nativeHistoryRevisions: [0, 1] });
    await tick();
    assert.notEqual(f.canvas().dataset.selectionAuthority, 'history-unresolved');
    assert.equal(
      f.reports.some((s) => s.includes('복원 위치를 확인할 수')),
      false,
    );
  } finally {
    await cleanup(f);
  }
});
test('Canvas beforeinput historyUndo도 같은 비텍스트 판정을 재사용', async () => {
  const f = setup();
  try {
    const e = new Event('beforeinput', { cancelable: true });
    Object.assign(e, { inputType: 'historyUndo', data: null, isComposing: false });
    f.input().dispatchEvent(e);
    await tick();
    assert.deepEqual(
      f.requests.map((x) => x.kind),
      ['public-undo'],
    );
    f.ack();
    await tick();
  } finally {
    await cleanup(f);
  }
});
function typeText(f, text) {
  const input = f.input();
  const e = new Event('beforeinput', { cancelable: true });
  Object.assign(e, { inputType: 'insertText', data: text, isComposing: false });
  input.dispatchEvent(e);
  if (!e.defaultPrevented) {
    const a = input.selectionStart,
      b = input.selectionEnd;
    input.value = input.value.slice(0, a) + text + input.value.slice(b);
    input.setSelectionRange(a + text.length, a + text.length);
    input.dispatchEvent(new Event('input'));
  }
}
test('Core 선택 null이어도 대기 splice와 추가 입력 큐가 있으면 비텍스트 경로 없음', async () => {
  const f = setup();
  try {
    f.select();
    typeText(f, 'x');
    await tick();
    assert.equal(f.requests[0].kind, 'splice');
    typeText(f, 'y');
    f.install({ selection: null });
    f.surface.requestHistory('undo');
    await tick();
    assert.equal(f.requests.filter((x) => x.kind.startsWith('public-')).length, 0);
    assert.equal(f.input().value.includes('y'), true);
  } finally {
    await cleanup(f);
  }
});
test('현재 버전 관측 전 Native 상태가 교체되면 비텍스트 접수 거부', async () => {
  const f = setup();
  try {
    const prior = f.state();
    f.editor.getEditorState = () => ({
      ...prior,
      documentId: 'other',
      generation: 2,
      stateVersion: prior.stateVersion + 1,
    });
    assert.equal(f.surface.requestHistory('undo'), false);
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});
test('권한 조회 중 같은 문서의 버전 교체 재진입도 접수 거부', async () => {
  const f = setup();
  try {
    const read = f.editor.getEditorState;
    let count = 0;
    f.editor.getEditorState = () => {
      const s = read();
      if (++count === 2) f.install({ operationRevision: 2 });
      return s;
    };
    assert.equal(f.surface.requestHistory('undo'), false);
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});
test('Core 호출 내부에서 닫혀도 이미 소유한 작업을 dispose가 drain', async () => {
  const f = setup();
  const undo = f.editor.undo;
  let done;
  f.editor.undo = (token) => {
    done = f.surface.dispose();
    return undo(token);
  };
  assert(f.surface.requestHistory('undo'));
  let closed = false;
  done.then(() => (closed = true));
  await tick();
  assert.equal(closed, false);
  f.ack();
  await done;
  assert.equal(closed, true);
  assert.equal(
    f.reports.some((s) => s.includes('텍스트 복원 위치 없음')),
    false,
  );
});

test('텍스트 소유자 없는 draft는 Direct fallback도 거부', async () => {
  const f = setup();
  try {
    f.input().value = '미반영';
    assert.equal(f.surface.requestHistory('undo'), false);
    await tick();
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});
test('Surface 관측 전 선행 상태 리스너 재진입은 stale none을 거부', async () => {
  const f = setup();
  try {
    const read = f.editor.getEditorState;
    const old = read();
    f.editor.getEditorState = () => ({ ...old, stateVersion: old.stateVersion + 1 });
    assert.equal(f.surface.canRequestHistory('undo'), false);
    assert.equal(f.surface.requestHistory('undo'), false);
    await tick();
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});

test('동일 문서의 새 상태 때문에 응답 투영을 버려도 busy 해제 알림은 유지', async () => {
  const f = setup();
  try {
    assert(f.surface.requestHistory('undo'));
    const old = f.state();
    f.ack({ operationRevision: 2 }, { state: old });
    await tick();
    assert.equal(
      f.reports.some((s) => s.includes('변경된 현재 문서 상태')),
      true,
    );
    assert.equal(f.surface.canRequestHistory('undo'), true);
  } finally {
    await cleanup(f);
  }
});

test('알 수 없는 이력 kind는 조회와 실행 모두 기존처럼 거부', async () => {
  const f = setup();
  try {
    for (const kind of ['unknown', '', null, undefined, 0]) {
      assert.equal(f.surface.canRequestHistory(kind), false);
      assert.equal(f.surface.requestHistory(kind), false);
    }
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});
test('생성 중 상태 알림 재진입은 초기화 전 비텍스트 콜백을 거부', async () => {
  const f = fixture();
  let calls = 0;
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: () => {
      calls++;
      const input = f.input();
      const e = new Event('beforeinput', { cancelable: true });
      Object.assign(e, { inputType: 'historyUndo', isComposing: false });
      input.dispatchEvent(e);
    },
  });
  f.attach(surface);
  try {
    assert(calls > 0);
    await tick();
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup({ ...f, surface });
  }
});

test('안정 비텍스트 명시 focus는 이력 없어도 Canvas로만 복귀', async () => {
  const f = setup();
  try {
    f.install({ nativeHistoryRevisions: [1], capabilities: { historyAvailable: false } });
    assert.equal(f.surface.canRequestHistory('undo'), false);
    assert.equal(f.surface.focus(), true);
    assert.equal(f.doc.activeElement, f.canvas());
    assert.equal(f.canvas().dataset.caret, '');
    assert.equal(f.state().selection, null);
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});
test('텍스트 focus는 기존 입력에 복귀하고 Canvas로 바꾸지 않음', async () => {
  const f = setup();
  try {
    f.select();
    assert.equal(f.surface.focus(), true);
    assert.equal(f.doc.activeElement, f.input());
  } finally {
    await cleanup(f);
  }
});
for (const mode of ['modal', 'pending', 'draft', 'closed', 'lease', 'stale'])
  test('비텍스트 focus 거부: ' + mode, async () => {
    const f = setup();
    try {
      if (mode === 'modal') f.doc.modal = true;
      if (mode === 'pending') assert(f.surface.requestHistory('undo'));
      if (mode === 'draft') f.input().value = '미반영';
      if (mode === 'closed') await f.surface.dispose();
      if (mode === 'lease') f.revoke();
      if (mode === 'stale') {
        const state = f.state();
        f.editor.getEditorState = () => ({ ...state, stateVersion: state.stateVersion + 1 });
      }
      const before = f.doc.activeElement;
      assert.equal(f.surface.focus(), false);
      assert.equal(f.doc.activeElement, before);
    } finally {
      await cleanup(f);
    }
  });
test('Canvas focus 중 문서가 교체되면 이전 복귀 성공으로 발급하지 않음', async () => {
  const f = setup();
  try {
    f.canvas().addEventListener('focus', () => f.install({ documentId: 'new', generation: 2 }), {
      once: true,
    });
    assert.equal(f.surface.focus(), false);
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});

test('텍스트 focus 중 새 문서 재진입은 이전 복귀 성공으로 반환하지 않음', async () => {
  const f = setup();
  try {
    f.select();
    f.input().addEventListener('focus', () => f.install({ documentId: 'new', generation: 2 }), {
      once: true,
    });
    assert.equal(f.surface.focus(), false);
  } finally {
    await cleanup(f);
  }
});
test('Canvas focus 중 다른 모달이 열리면 복귀 성공으로 반환하지 않음', async () => {
  const f = setup();
  try {
    f.canvas().addEventListener(
      'focus',
      () => {
        f.doc.modal = true;
      },
      { once: true },
    );
    assert.equal(f.surface.focus(), false);
    assert.equal(f.requests.length, 0);
  } finally {
    await cleanup(f);
  }
});

test('옛 응답과 다른 최신 같은 문서 텍스트 선택도 해제 후 정확히 투영', async () => {
  const f = setup();
  try {
    assert(f.surface.requestHistory('undo'));
    const old = f.state();
    const selection = {
      ...old.token,
      operationRevision: 2,
      affinity: 'forward',
      coordinateSpace: 'display',
      format: 'hwpx',
      owner: 'section:0:body',
      section: 0,
      paragraph: 0,
      startUnit: 1,
      endUnit: 1,
    };
    f.ack(
      { operationRevision: 2, nativeHistoryRevision: 0, nativeHistoryRevisions: [0, 1], selection },
      { state: old },
    );
    await tick();
    assert.equal(f.state().selection, selection);
    assert.equal(f.canvas().dataset.caret, '0:0:1');
    assert.equal(f.surface.focus(), true);
    assert.equal(f.doc.activeElement, f.input());
  } finally {
    await cleanup(f);
  }
});

function otherFocus(f) {
  const other = f.doc.createElement('button');
  other.focus();
  return other;
}
for (const mode of ['draft', 'splice', 'IME'])
  test('텍스트 focus 기존 계약 보존: ' + mode, async () => {
    const f = setup();
    try {
      f.select();
      if (mode === 'splice') {
        typeText(f, 'x');
        await tick();
        assert.equal(f.requests[0].kind, 'splice');
      }
      if (mode === 'draft') {
        f.input().value = 'A임시B';
      }
      if (mode === 'IME') {
        f.input().dispatchEvent(new Event('compositionstart'));
        f.input().value = 'A조합B';
      }
      f.input().setSelectionRange(1, 2);
      f.input().selectionDirection = 'backward';
      const before = {
        value: f.input().value,
        start: f.input().selectionStart,
        end: f.input().selectionEnd,
        direction: f.input().selectionDirection,
        count: f.requests.length,
      };
      otherFocus(f);
      assert.equal(f.surface.focus(), true);
      assert.equal(f.doc.activeElement, f.input());
      assert.deepEqual(
        {
          value: f.input().value,
          start: f.input().selectionStart,
          end: f.input().selectionEnd,
          direction: f.input().selectionDirection,
          count: f.requests.length,
        },
        before,
      );
      assert.equal(
        f.requests.some((x) => x.kind.startsWith('public-')),
        false,
      );
    } finally {
      await cleanup(f);
    }
  });
test('ShadowRoot 비텍스트 Canvas focus는 같은 root 활성 요소로 확인', async () => {
  const f = setup();
  try {
    const host = f.doc.createElement('div');
    const shadow = { activeElement: null };
    const canvas = f.canvas();
    canvas.getRootNode = () => shadow;
    canvas.focus = () => {
      shadow.activeElement = canvas;
      f.doc.activeElement = host;
      canvas.dispatchEvent(new Event('focus'));
    };
    f.install({ nativeHistoryRevisions: [1], capabilities: { historyAvailable: false } });
    assert.equal(f.surface.focus(), true);
    assert.equal(shadow.activeElement, canvas);
    assert.equal(f.doc.activeElement, host);
    assert.equal(f.requests.length, 0);
    assert.equal(f.canvas().dataset.caret, '');
  } finally {
    await cleanup(f);
  }
});

test('텍스트가 남아도 refresh-required의 현재 화면에는 focus 복귀하지 않음', async () => {
  const f = setup();
  try {
    f.select();
    f.install({ status: 'refresh-required' });
    const other = otherFocus(f);
    assert.equal(f.surface.focus(), false);
    assert.equal(f.doc.activeElement, other);
  } finally {
    await cleanup(f);
  }
});
