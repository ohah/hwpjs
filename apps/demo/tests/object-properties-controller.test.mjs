import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesController } from '../src/object-properties-controller.ts';
const draft = { width: '50.8', height: '25.4' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(options = {}) {
  let state = {
    editorId: 'editor',
    documentId: 'doc',
    generation: 1,
    stateVersion: 0,
    status: 'ready',
  };
  let target = { section: 0, pictureNode: 7, width: 7200, height: 3600 };
  let why = null,
    listener,
    effect;
  let work = async () => ({ status: 'committed-with-snapshot', state });
  const views = [],
    messages = [],
    errors = [];
  let reads = 0,
    submissions = 0,
    focused = 0;
  const port = {
    capture() {
      reads++;
      effect?.();
      return { state, target, reason: why };
    },
    availability() {
      return { enabled: !why, reason: why ?? undefined };
    },
    subscribe(fn) {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
    async apply(captured, value) {
      submissions++;
      return work(captured, value);
    },
  };
  const tool = createObjectPropertiesController({
    port,
    createView(capture, initial, callbacks) {
      const view = {
        capture,
        initial,
        callbacks,
        focused: 0,
        destroyed: 0,
        busy: false,
        status: '',
        reason: null,
        focus() {
          this.focused++;
        },
        destroy() {
          this.destroyed++;
        },
        setBusy(v) {
          this.busy = v;
        },
        setStatus(v) {
          this.status = v;
        },
        setAvailability(v) {
          this.reason = v;
        },
      };
      views.push(view);
      return view;
    },
    onStatus(s) {
      messages.push(s);
      options.status?.(s);
    },
    onClose() {
      focused++;
    },
    onError(error) {
      errors.push(error);
    },
    onPresentationChange() {
      options.presentation?.();
    },
  });
  return {
    tool,
    port,
    views,
    messages,
    errors,
    current: () => state,
    submissions: () => submissions,
    focused: () => focused,
    reads: () => reads,
    state(delta) {
      state = { ...state, stateVersion: state.stateVersion + 1, ...delta };
      listener?.();
    },
    reason(v) {
      why = v;
    },
    work(fn) {
      work = fn;
    },
    effect(fn) {
      effect = fn;
    },
    target(v) {
      target = v;
    },
  };
}
test('지원·선택 부재는 더미 모달 생성 없이 안내', () => {
  const h = setup();
  h.reason('지원하지 않는 그림');
  h.target(null);
  h.tool.open();
  assert.equal(h.views.length, 0);
  assert.match(h.messages[0], /지원하지/);
  h.tool.dispose();
});
test('반복 open은 같은 창 focus, close/no-open/dispose는 반복 안전', () => {
  const h = setup();
  h.tool.close();
  assert.equal(h.focused(), 0);
  h.tool.open();
  h.tool.open();
  assert.equal(h.views.length, 1);
  assert.equal(h.views[0].focused, 1);
  h.tool.close();
  h.tool.close();
  assert.equal(h.focused(), 1);
  assert.equal(h.views[0].destroyed, 1);
  h.tool.dispose();
  h.tool.dispose();
});
test('중복 확인은 요청1회, 처리 중 닫기는 명령 취소로 오인 안 함', async () => {
  const h = setup();
  let resolve;
  h.work(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  h.tool.open();
  const view = h.views[0];
  view.callbacks.onApply(draft);
  view.callbacks.onApply(draft);
  assert.equal(h.submissions(), 1);
  view.callbacks.onDismiss();
  assert.equal(view.destroyed, 1);
  h.tool.open();
  assert.equal(h.views.length, 1);
  resolve({ status: 'committed-with-snapshot' });
  await tick();
  assert.equal(h.messages.length, 0);
  assert.equal(h.submissions(), 1);
  h.tool.dispose();
});
test('다른 문서로 교체 후 늦은 결과는 안내·focus 모두 폐기', async () => {
  const h = setup();
  let resolve;
  h.work(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  h.tool.open();
  h.views[0].callbacks.onApply(draft);
  h.state({ documentId: 'new' });
  assert.equal(h.views[0].destroyed, 1);
  resolve({ status: 'committed-refresh-required', error: 'late' });
  await tick();
  assert.deepEqual(h.messages, []);
  assert.equal(h.focused(), 0);
  h.tool.dispose();
});
test('같은 문서의 선택/state 변경은 원 초안 적용 차단', async () => {
  const h = setup();
  h.tool.open();
  h.state({});
  assert.match(h.views[0].reason, /선택/);
  h.views[0].callbacks.onApply(draft);
  await tick();
  assert.equal(h.submissions(), 0);
  h.tool.dispose();
});
test('화면 갱신 콜백 재진입 이후에도 port가 admission을 다시 검사', async () => {
  let h;
  h = setup({
    presentation() {
      if (h.current().stateVersion === 0) h.state({});
    },
  });
  let native = 0;
  h.work(async (captured) => {
    if (captured.state !== h.current()) return { status: 'rejected-unapplied', error: 'stale' };
    native++;
    return { status: 'committed-with-snapshot' };
  });
  h.tool.open();
  h.views[0].callbacks.onApply(draft);
  await tick();
  assert.equal(native, 0);
  assert.equal(h.submissions(), 1);
  h.tool.dispose();
});
test('반영 후 표시 실패는 적용 성공을 취소하거나 자동 재전송 안 함', async () => {
  const h = setup();
  h.work(async () => ({ status: 'committed-refresh-required', error: 'ProjectionFailed' }));
  h.tool.open();
  h.views[0].callbacks.onApply(draft);
  await tick();
  assert.equal(h.submissions(), 1);
  assert.equal(h.views[0].destroyed, 1);
  assert.match(h.messages[0], /반영됐지만/);
  assert.equal(h.focused(), 0);
  h.tool.dispose();
});
test('알 수 없는 요청 오류는 미적용으로 단정하거나 자동 재시도 안 함', async () => {
  const h = setup();
  h.work(async () => {
    throw Error('transport');
  });
  h.tool.open();
  h.views[0].callbacks.onApply(draft);
  await tick();
  assert.match(h.messages[0], /결과를 확인할 수 없습니다/);
  assert.equal(h.submissions(), 1);
  assert.equal(h.views[0].destroyed, 1);
  h.tool.dispose();
});
test('확정 no-op은 이력 없이 정상 종결', async () => {
  const h = setup();
  h.work(async () => ({ status: 'known-no-op' }));
  h.tool.open();
  h.views[0].callbacks.onApply(draft);
  await tick();
  assert.match(h.messages[0], /변경하지/);
  assert.equal(h.focused(), 1);
  h.tool.dispose();
});
test('이미 종료된 이벤트·조회 중 close 재진입은 창이나 요청을 되살리지 않음', async () => {
  const h = setup();
  h.tool.open();
  const callback = h.views[0].callbacks.onApply;
  h.tool.dispose();
  callback(draft);
  h.tool.open();
  await tick();
  assert.equal(h.submissions(), 0);
  const b = setup();
  b.effect(() => b.tool.close());
  b.tool.open();
  assert.equal(b.views.length, 0);
  b.tool.dispose();
});
test('성공 후 외부 안내 콜백 예외가 Native 실패로 변환되지 않음', async () => {
  const h = setup({
    status() {
      throw Error('UI failed');
    },
  });
  h.tool.open();
  h.views[0].callbacks.onApply(draft);
  await tick();
  assert.equal(h.submissions(), 1);
  assert.equal(h.errors.length, 1);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /바꿨습니다/);
  h.tool.dispose();
});
