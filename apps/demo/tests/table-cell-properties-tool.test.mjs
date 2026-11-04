import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { createTableCellPropertiesController } from '../src/table-cell-properties-tool.ts';
import { fixture, changed } from './table-cell-properties-fixture.mjs';
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
function setup(onStatus) {
  const f = fixture(),
    port = createTableCellPropertiesPort(f.editor, f.api),
    messages = [],
    views = [];
  let focus = 0,
    handlers;
  const controller = createTableCellPropertiesController({
    root: { querySelector: () => null },
    port,
    onStatus: (s) => {
      messages.push(s);
      onStatus?.();
    },
    onClose: () => {
      focus++;
    },
    createView(_root, _capture, callbacks) {
      handlers = callbacks;
      const v = {
        destroyed: 0,
        busy: false,
        status: '',
        stale: '',
        focus() {},
        destroy() {
          this.destroyed++;
        },
        setBusy(b) {
          this.busy = b;
        },
        setStatus(s) {
          this.status = s;
        },
        setStale(s) {
          this.stale = s;
        },
      };
      views.push(v);
      return v;
    },
  });
  return {
    f,
    port,
    controller,
    views,
    messages,
    get focus() {
      return focus;
    },
    get handlers() {
      return handlers;
    },
  };
}
test('창 열기와 취소는 Native0/동일 선택에서만 focus 복귀', () => {
  const s = setup();
  s.controller.open();
  s.handlers.dismiss();
  assert.equal(s.f.mutationCalls().length, 0);
  assert.equal(s.focus, 1);
  s.controller.dispose();
  assert.equal(s.f.listeners.size, 0);
});
test('선택 이동은 기존 초안 비활성, 문서 교체는 닫고 focus0', () => {
  const s = setup();
  s.controller.open();
  s.f.replace({ selection: { ...s.f.state.selection, startUnit: 1 } });
  assert.ok(s.views[0].stale);
  s.f.replace({ documentId: 'new-doc' });
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.focus, 0);
  s.controller.dispose();
});
test('적용 중 중복0/창 닫기 뒤 접수된 ACK는 삭제·재적용하지 않음', async () => {
  const s = setup();
  let resolve;
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    return new Promise((r) => {
      resolve = r;
    });
  };
  s.controller.open();
  s.handlers.apply(changed);
  await tick();
  s.handlers.apply(changed);
  s.handlers.dismiss();
  resolve({ status: 'committed-with-snapshot', state: s.f.state });
  await tick();
  assert.equal(s.f.mutationCalls().length, 1);
  assert.equal(s.messages.length, 0);
  s.controller.dispose();
});
test('commit-refresh+error는 실패 재접수 UI가 아니라 완료 경고', async () => {
  const s = setup();
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    return { status: 'committed-refresh-required', error: 'SnapshotMissing', state: s.f.state };
  };
  s.controller.open();
  s.handlers.apply(changed);
  await tick();
  assert.equal(s.views[0].destroyed, 1);
  assert.match(s.messages[0], /다시 적용하지/);
  assert.equal(s.focus, 0);
  assert.equal(s.f.mutationCalls().length, 1);
  s.controller.dispose();
});
test('dispose 중 late ACK는 UI/focus를 갱신하지 않음', async () => {
  const s = setup();
  let resolve;
  s.f.editor.requestExperimental = () =>
    new Promise((r) => {
      resolve = r;
    });
  s.controller.open();
  s.handlers.apply(changed);
  await tick();
  s.controller.dispose();
  resolve({ status: 'committed-with-snapshot', state: s.f.state });
  await tick();
  assert.equal(s.messages.length, 0);
  assert.equal(s.focus, 0);
  assert.equal(s.f.listeners.size, 0);
});
test('view destroy 오류에도 소유 listener/port는 정리', () => {
  const s = setup();
  s.controller.open();
  s.views[0].destroy = () => {
    throw Error('ViewDispose');
  };
  assert.throws(() => s.controller.dispose());
  assert.equal(s.f.listeners.size, 0);
  assert.equal(s.port.presentation().enabled, false);
});
test('성공 알림에서 문서를 교체하면 이전 셀 focus를 되찾지 않음', async () => {
  let s;
  s = setup(() => s.f.replace({ documentId: 'new-doc', selection: null }));
  s.f.editor.requestExperimental = async () => {
    s.f.replace({ selection: undefined, operationRevision: 1 });
    return { status: 'committed-with-snapshot', state: s.f.state };
  };
  s.controller.open();
  s.handlers.apply(changed);
  await tick();
  assert.equal(s.focus, 0);
  assert.equal(s.messages.length, 1);
  s.controller.dispose();
});
