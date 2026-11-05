import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlBridge } from '../src/core-bridge.ts';
import {
  surfaceOperation,
  SURFACE_MUTATION_KINDS,
} from '../../core/src/commands/surface-protocol.ts';

// 실제 Bridge와 분류표를 검사한다. Core FIFO·Native 대역의 성공을 실제 엔진 증거로 쓰지 않는다.
function fixture(observer) {
  let state = {
    status: 'ready',
    selection: null,
    documentId: 'd1',
    generation: 1,
    operationRevision: 0,
    token: { documentId: 'd1', generation: 1 },
  };
  let active = true,
    resolve,
    reject;
  const calls = [],
    acknowledgements = [],
    errors = [];
  const answer = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  const bridge = createControlBridge(
    {
      state: () => state,
      lease: {
        isActive: () => active,
        request: (...args) => {
          calls.push(args);
          return answer;
        },
      },
      acknowledge: (...args) => acknowledgements.push(args),
      error: (e) => errors.push(e),
    },
    observer,
  );
  const message = {
    kind: 'formatting-patch',
    origin: 'canvas',
    request: {
      schemaVersion: 1,
      binding: { session: 's1', revision: 0 },
      targets: [{ ref: '실제 반환 참조 대역' }],
      patch: { paragraph: { alignment: 'center' } },
    },
  };
  return {
    bridge,
    message,
    calls,
    acknowledgements,
    errors,
    resolve,
    reject,
    get state() {
      return state;
    },
    set state(value) {
      state = value;
    },
    deactivate() {
      active = false;
    },
    result(status = 'committed-with-snapshot') {
      return { status, state, reply: { kind: 'formatting-patch' } };
    },
  };
}

test('허용 종류는 서식 변경이며 저장·열기·잠금 해제는 허용하지 않는다', () => {
  assert.equal(surfaceOperation('formatting-patch'), 'mutation');
  assert.equal(SURFACE_MUTATION_KINDS.filter((k) => k === 'formatting-patch').length, 1);
  for (const kind of ['load', 'save', 'unlock', 'refresh', 'unknown'])
    assert.equal(surfaceOperation(kind), undefined);
});
test('Core 선택 null에서도 기존 lease로 원본 payload와 token을 한 번 전달한다', async () => {
  const seen = [];
  const f = fixture((...args) => seen.push(args));
  assert.equal(f.bridge.request(f.message), true);
  f.message.request.patch.paragraph.alignment = 'right';
  await Promise.resolve();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0].request.patch.paragraph.alignment, 'center');
  assert.deepEqual(f.calls[0][1], { token: f.state.token, coordinates: 'legacy-native' });
  const result = f.result();
  f.resolve(result);
  await f.bridge.flush();
  assert.equal(seen[0][0], result);
  assert.equal(f.acknowledgements[0].length, 2);
  assert.equal(f.acknowledgements[0][0].applied, true);
  assert.equal(f.bridge.busy(), false);
});
test('미완료 요청 중 재진입과 다른 명령은 접수하지 않는다', async () => {
  const f = fixture();
  assert.equal(f.bridge.request(f.message), true);
  assert.equal(f.bridge.request({ kind: 'undo' }), false);
  await Promise.resolve();
  f.resolve(f.result());
  await f.bridge.flush();
  assert.equal(f.calls.length, 1);
});
test('실행 전 문서 교체와 lease 상실은 Native 요청 없이 끝난다', async () => {
  for (const invalidate of [
    (f) => {
      f.state = { ...f.state, documentId: 'd2', generation: 2 };
    },
    (f) => f.deactivate(),
  ]) {
    const f = fixture();
    assert.equal(f.bridge.request(f.message), true);
    invalidate(f);
    await f.bridge.flush();
    assert.equal(f.calls.length, 0);
    assert.equal(f.acknowledgements.length, 0);
  }
});
test('접수 뒤 close는 작업을 drain하되 늦은 ACK를 게시하지 않는다', async () => {
  const f = fixture();
  f.bridge.request(f.message);
  await Promise.resolve();
  f.bridge.close();
  let drained = false;
  const wait = f.bridge.flush().then(() => {
    drained = true;
  });
  await Promise.resolve();
  assert.equal(drained, false);
  f.resolve(f.result());
  await wait;
  assert.equal(f.acknowledgements.length, 0);
  assert.equal(f.bridge.request(f.message), false);
});
test('관측 콜백 오류가 실제 ACK를 미적용 응답으로 바꾸지 않는다', async () => {
  const error = Error('관측 실패');
  const f = fixture(() => {
    throw error;
  });
  f.bridge.request(f.message);
  await Promise.resolve();
  f.resolve(f.result());
  await f.bridge.flush();
  assert.equal(f.acknowledgements.length, 1);
  assert.equal(f.acknowledgements[0][0].applied, true);
  assert.deepEqual(f.errors, [error]);
});
test('명시 거부 결과와 예외는 성공으로 바꾸지 않는다', async () => {
  const f = fixture();
  f.bridge.request(f.message);
  await Promise.resolve();
  f.resolve({ ...f.result('rejected-unapplied'), error: Error('권한 거부') });
  await f.bridge.flush();
  assert.equal(f.acknowledgements[0][0].applied, false);
  const g = fixture();
  g.bridge.request(g.message);
  await Promise.resolve();
  g.reject(Error('통신 실패'));
  await g.bridge.flush();
  assert.equal(g.acknowledgements.length, 1);
  assert.equal(g.acknowledgements[0][0].applied, false);
  assert.equal(g.errors.length, 1);
});
test('늦은 다른 operation 응답은 관측과 ACK 모두 게시하지 않는다', async () => {
  let observed = 0;
  const f = fixture(() => observed++);
  f.bridge.request(f.message);
  await Promise.resolve();
  const old = f.result();
  f.state = { ...f.state, operationRevision: 1 };
  f.resolve(old);
  await f.bridge.flush();
  assert.equal(observed, 0);
  assert.equal(f.acknowledgements.length, 0);
});
