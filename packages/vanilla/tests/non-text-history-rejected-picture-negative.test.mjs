// 실제 Canvas/Surface의 거부 완료 경계만 검사한다. Core 결과·renderer는 통제하며 Native 증거가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './non-text-history-fixture.mjs';
import { createCanvasSurface } from '../src/surface.ts';
const tick = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
async function selected() {
  const f = fixture();
  const picture = {
    section: 0,
    pictureNode: 7,
    geometry: { width: 7200, height: 3600, widthRelative: 4, heightRelative: 2 },
  };
  f.install({ content: { ...f.state().content, pictures: [picture] } });
  const read = f.renderer.selectedPicture;
  f.renderer.selectedPicture = () => {
    const p = read();
    return p
      ? (f
          .state()
          .content.pictures.find(
            (row) => row.section === p.section && row.pictureNode === p.pictureNode,
          ) ?? null)
      : null;
  };
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (s) => f.reports.push(s),
  });
  const event = new Event('pointerdown', { cancelable: true });
  Object.assign(event, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
  f.canvas().dispatchEvent(event);
  await tick();
  assert.equal(surface.getContextPicture()?.pictureNode, 7, '음성 전 실제 Canvas 선택 전제');
  return { ...f, surface };
}
async function done(f) {
  const p = f.surface.dispose();
  while (f.waits.length) f.reject();
  await p;
}
const reject = (f, overrides = {}) => {
  const state = f.state();
  const w = f.waits.shift();
  assert.ok(w);
  w.resolve({
    status: 'rejected-unapplied',
    state,
    changed: null,
    error: 'ReadOnlyDocument',
    ...overrides,
  });
};
test('Promise 오류만으로는 Native 미적용을 확정하지 않음', async () => {
  const f = await selected();
  try {
    assert(f.surface.requestHistory('undo'));
    f.reject();
    await tick();
    assert.equal(f.surface.getContextPicture(), null);
    assert.equal(f.requests.length, 1);
  } finally {
    await done(f);
  }
});
test('applied 또는 알려진 no-op의 새 상태는 기존 완료 경로를 사용', async () => {
  for (const status of ['committed-with-snapshot', 'known-no-op']) {
    const f = await selected();
    try {
      const before = f.state();
      assert(f.surface.requestHistory('undo'));
      f.ack({ operationRevision: before.operationRevision + 1 }, { status });
      await tick();
      assert.notEqual(f.state(), before);
      assert.equal(f.surface.getContextPicture(), null);
      assert.equal(f.requests.length, 1);
    } finally {
      await done(f);
    }
  }
});
test('unknown commit 응답과 같은 Core 상태도 명시적 미적용으로 보지 않음', async () => {
  const f = await selected();
  try {
    const before = f.state();
    assert(f.surface.requestHistory('undo'));
    reject(f, {
      status: 'committed-refresh-required',
      error: 'UnknownApplication',
      reply: { meta: { application: 'unknown' } },
    });
    await tick();
    assert.equal(f.state(), before);
    assert.equal(f.surface.getContextPicture(), null);
  } finally {
    await done(f);
  }
});
test('changed/applied 모순과 잘못된 bool은 보존 경로를 사용하지 않음', async () => {
  const cases = [
    { changed: true },
    { changed: 1 },
    { changed: 'true' },
    { reply: { applied: null } },
    ...['applied', 'changed'].flatMap((field) =>
      [true, 1, 'true'].map((value) => ({ reply: { [field]: value } })),
    ),
    ...[true, 1, 'true'].map((changed) => ({ reply: { meta: { changed } } })),
    { reply: { meta: { application: 'unknown' } } },
  ];
  for (const result of cases) {
    const f = await selected();
    try {
      assert(f.surface.requestHistory('undo'));
      reject(f, result);
      await tick();
      assert.equal(f.surface.getContextPicture(), null, JSON.stringify(result));
      assert.equal(f.requests.length, 1);
    } finally {
      await done(f);
    }
  }
});
test('같은 상태의 미반영 draft는 그림 보존을 허가하지 않음', async () => {
  const f = await selected();
  try {
    const before = f.state();
    assert(f.surface.requestHistory('undo'));
    f.input().value = '미반영';
    reject(f);
    await tick();
    assert.equal(f.state(), before);
    assert.equal(f.surface.getContextPicture(), null);
  } finally {
    await done(f);
  }
});
test('사용자가 해제한 현재 그림을 옛 그림으로 되살리지 않음', async () => {
  const f = await selected();
  try {
    const before = f.state();
    assert(f.surface.requestHistory('undo'));
    f.renderer.pictureAtLogicalPoint = () => null;
    f.renderer.layout = () => ({ width: 800, height: 600, rows: [] });
    const event = new Event('pointerdown', { cancelable: true });
    Object.assign(event, { button: 0, clientX: 700, clientY: 550, pointerId: 2 });
    f.canvas().dispatchEvent(event);
    assert.equal(f.renderer.selectedPicture(), null);
    reject(f);
    await tick();
    assert.equal(f.state(), before);
    assert.equal(f.surface.getContextPicture(), null);
  } finally {
    await done(f);
  }
});
test('문서 교체·lease 해지·닫힘 후에는 거부 결과로 옛 그림을 발행하지 않음', async () => {
  for (const mode of ['document', 'lease', 'closed']) {
    const f = await selected();
    try {
      const old = f.state();
      assert(f.surface.requestHistory('undo'));
      const reports = f.reports.length;
      let closing;
      if (mode === 'document') f.install({ documentId: 'other', generation: old.generation + 1 });
      if (mode === 'lease') f.revoke();
      if (mode === 'closed') closing = f.surface.dispose();
      reject(f, { state: old });
      await tick();
      await closing;
      assert.notEqual(f.surface.getContextPicture()?.pictureNode, 7);
      assert.equal(
        f.reports.slice(reports).some((s) => s.includes('실행 취소/다시 실행 실패')),
        false,
      );
    } finally {
      await done(f);
    }
  }
});
test('새 body/table Core 선택은 거부 결과의 옛 그림 대신 현재 caret으로 투영', async () => {
  for (const owner of ['section:0:body', 'section:0:table:9:list:10']) {
    const f = await selected();
    try {
      const old = f.state();
      assert(f.surface.requestHistory('undo'));
      const selection = {
        ...old.token,
        affinity: 'forward',
        coordinateSpace: 'display',
        format: 'hwpx',
        owner,
        section: 0,
        paragraph: 0,
        startUnit: 1,
        endUnit: 1,
      };
      const row = { ...old.content.paragraphs[0], selectionOwner: owner };
      if (owner !== 'section:0:body') row.tableCell = { tableNode: 9, listNode: 10 };
      f.install({ content: { ...old.content, paragraphs: [row] }, selection });
      reject(f, { state: old });
      await tick();
      assert.equal(f.state().selection, selection);
      assert.equal(f.canvas().dataset.caret, '0:0:1');
      assert.equal(f.requests.length, 1);
    } finally {
      await done(f);
    }
  }
});
test('명시적 거부라도 result.state가 다르면 같은 현재 그림을 보존하지 않음', async () => {
  const f = await selected();
  try {
    const before = f.state();
    assert(f.surface.requestHistory('undo'));
    reject(f, { state: { ...before } });
    await tick();
    assert.equal(f.state(), before);
    assert.equal(f.surface.getContextPicture(), null);
  } finally {
    await done(f);
  }
});

test('선택적 변경 플래그의 null은 적용 모순으로 만들지 않음', async () => {
  const f = await selected();
  try {
    const before = f.state();
    assert(f.surface.requestHistory('undo'));
    reject(f, {
      changed: null,
      reply: { applied: false, changed: null, meta: { changed: null, application: 'unapplied' } },
    });
    await tick();
    assert.equal(f.state(), before);
    assert.equal(f.surface.getContextPicture()?.pictureNode, 7);
    assert.equal(f.requests.length, 1);
  } finally {
    await done(f);
  }
});
