// 실제 공개 Core와 실제 Bridge/FIFO를 쓰되 runtime 응답은 통제한다. Native 검사가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '@hwpjs/core';
import { createControlBridge } from '../src/core-bridge.ts';
function fixture() {
  let revision = 0,
    gate;
  const messages = [];
  const content = () => ({
    format: 'hwp5',
    paragraphs: [0, 1].map((paragraph) => ({
      section: 0,
      paragraph,
      text: '검증본문',
      editable: true,
      selectionOwner: 'section:0:body',
    })),
  });
  const runtime = {
    async request(message) {
      messages.push(structuredClone(message));
      if (['load', 'enable'].includes(message.kind))
        return { kind: message.kind, content: content(), historyRevision: revision };
      if (message.kind === 'formatting-patch') {
        await gate;
        revision++;
        return {
          kind: message.kind,
          content: content(),
          historyRevision: revision,
          meta: { application: 'applied', changed: true },
        };
      }
      return { kind: message.kind, error: '지원하지 않는 통제 명령', applied: false };
    },
    dispose() {},
  };
  return {
    messages,
    editor: createEditor({ runtimeFactory: () => runtime }),
    hold() {
      let release;
      gate = new Promise((r) => {
        release = r;
      });
      return release;
    },
  };
}
const hooks = () => ({ commitComposition: () => 'unchanged', cancelComposition: () => {} });
const request = () => ({
  kind: 'formatting-patch',
  origin: 'canvas',
  request: {
    schemaVersion: 1,
    binding: { session: '통제세션', revision: 0 },
    targets: [{ ref: '통제Native반환참조' }],
    patch: { paragraph: { alignment: 'CENTER' } },
  },
});
const options = (e) => ({ token: e.getEditorState().token, coordinates: 'legacy-native' });
async function tick() {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}
test('실제 Core 선택 null에서 Bridge와 기존 lease mutation FIFO를 통과한다', async () => {
  const f = fixture(),
    e = f.editor;
  await e.load(new Uint8Array([1]), { format: 'hwp5', editable: true });
  await e.setSelection(null);
  const lease = e.acquireInputSurface(hooks());
  const results = [],
    acks = [],
    errors = [];
  const b = createControlBridge(
    {
      state: () => e.getEditorState(),
      lease,
      acknowledge: (r) => acks.push(r),
      error: (r) => errors.push(r),
    },
    (r) => results.push(r),
  );
  try {
    assert.equal(e.getEditorState().selection, null);
    assert.equal(b.request(request()), true);
    assert.equal(b.request(request()), false);
    await b.flush();
    assert.equal(results[0].status, 'committed-with-snapshot');
    assert.equal(acks[0].applied, true);
    assert.equal(f.messages.filter((m) => m.kind === 'formatting-patch').length, 1);
    assert.equal(errors.length, 0);
  } finally {
    b.close();
    lease.release();
    await e.dispose();
  }
});
test('허용 분류 추가로 저장·열기·잠금 해제와 잘못된 좌표를 우회하지 않는다', async () => {
  const f = fixture(),
    e = f.editor;
  await e.load(new Uint8Array([1]), { format: 'hwp5', editable: true });
  const lease = e.acquireInputSurface(hooks());
  try {
    for (const kind of ['load', 'save', 'unlock', 'refresh', 'unknown'])
      await assert.rejects(lease.request({ kind }, options(e)), /UnsupportedSurfaceOperation/);
    await assert.rejects(
      lease.request(request(), { ...options(e), coordinates: 'display' }),
      /InvalidSurfaceCoordinates/,
    );
    assert.equal(f.messages.filter((m) => m.kind === 'formatting-patch').length, 0);
  } finally {
    lease.release();
    await e.dispose();
  }
});
test('읽기 전용과 오래된 token은 runtime 변경 전에 거부한다', async () => {
  const f = fixture(),
    e = f.editor;
  await e.load(new Uint8Array([1]), { format: 'hwp5', editable: false });
  const lease = e.acquireInputSurface(hooks());
  try {
    const result = await lease.request(request(), options(e));
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(f.messages.filter((m) => m.kind === 'formatting-patch').length, 0);
    await assert.rejects(
      lease.request(request(), {
        ...options(e),
        token: { ...e.getEditorState().token, generation: 99 },
      }),
    );
  } finally {
    lease.release();
    await e.dispose();
  }
});
test('FIFO 대기 중 해제된 lease는 추가 Native 요청을 시작하지 않는다', async () => {
  const f = fixture(),
    e = f.editor;
  await e.load(new Uint8Array([1]), { format: 'hwp5', editable: true });
  const lease = e.acquireInputSurface(hooks());
  const release = f.hold();
  try {
    const first = lease.request(request(), options(e));
    const firstDone = first.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await tick();
    assert.equal(f.messages.filter((m) => m.kind === 'formatting-patch').length, 1);
    const second = lease.request(request(), options(e));
    const secondDone = second.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    lease.release();
    release();
    assert.ok((await firstDone).error);
    assert.ok((await secondDone).error);
    assert.equal(f.messages.filter((m) => m.kind === 'formatting-patch').length, 1);
  } finally {
    release();
    lease.release();
    await e.dispose();
  }
});
