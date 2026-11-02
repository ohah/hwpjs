import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, tick } from './undo-onset-fixture.mjs';
async function scenario(t, enabled) {
  const f = fixture(t, 'AB', 1, true, enabled);
  for (let i = 0; i < 80; i++) f.type('a');
  assert.equal(f.direct.requestHistory('undo'), true);
  for (let i = 0; i < 80; i++) f.type('b');
  const start = f.previews(),
    read = f.reads(),
    stage = f.stages();
  let receipts = 0;
  for (let i = 0; i < 80; i++) {
    assert.equal(f.waiting[0].kind, 'splice');
    f.ack();
    if (f.direct.consumeDeferredTypingProjection()) receipts++;
    assert.equal(f.direct.consumeDeferredTypingProjection(), false);
    await tick();
    if (i < 79)
      assert.equal(
        f.requests.some((x) => x.kind === 'undo'),
        false,
      );
  }
  assert.equal(f.requests.length, 81);
  assert.equal(f.waiting[0].kind, 'undo');
  const result = {
    previews: f.previews() - start,
    stages: f.stages() - stage,
    reads: f.reads() - read,
    receipts,
    order: f.requests.map((x) => x.kind),
  };
  f.ack();
  await tick();
  f.frame();
  await tick();
  return result;
}
test('FIFO80 splice 뒤 undo1: 내부port 중간geometry만유예/raw순서동일', async (t) => {
  const raw = await scenario(t, false),
    candidate = await scenario(t, true);
  assert.deepEqual(candidate.order, raw.order);
  assert.equal(raw.stages, 0);
  assert.equal(raw.previews, 80);
  assert.equal(candidate.stages, 79);
  assert.equal(candidate.previews, 1);
  assert.equal(candidate.receipts, 79);
  assert.ok(candidate.reads < raw.reads);
  console.log('ONSET_CANDIDATE_COUNTS ' + JSON.stringify({ raw, candidate }));
});
test('재진입 reset/close 또는 거부는 old receipt를 발급하지 않음', async (t) => {
  for (const mode of ['reset', 'close', 'reject']) {
    const f = fixture(t, 'AB', 1, true, true);
    f.type('a');
    f.type('b');
    f.direct.requestHistory('undo');
    f.stageHook(() => {
      if (mode === 'reset') f.direct.reset();
      if (mode === 'close') f.direct.close();
      return false;
    });
    f.ack();
    await tick();
    assert.equal(f.direct.consumeDeferredTypingProjection(), false);
    if (mode !== 'reject') assert.equal(f.requests.filter((x) => x.kind === 'undo').length, 0);
  }
});
test('history없는일반입력과마지막ACK는원preview경로', async (t) => {
  const f = fixture(t, 'AB', 1, true, true);
  f.type('a');
  f.type('b');
  f.ack();
  await tick();
  f.ack();
  await tick();
  assert.equal(f.stages(), 0);
  assert.equal(f.direct.consumeDeferredTypingProjection(), false);
  assert.equal(f.requests.filter((x) => x.kind === 'splice').length, 2);
});
test('undo 뒤 새 입력 branch와 keyup0, 중간 paint없이 FIFO resume', async (t) => {
  const f = fixture(t, 'AB', 1, true, true);
  for (let i = 0; i < 4; i++) f.type('a');
  assert(f.direct.requestHistory('undo'));
  for (let i = 0; i < 3; i++) f.type('b');
  for (let i = 0; i < 20 && (f.waiting.length || !f.direct.settled()); i++) {
    if (f.waiting.length) f.ack();
    await tick();
    f.frame();
    await tick();
  }
  assert.equal(f.text, 'AaaabbbB');
  assert.deepEqual(
    f.requests.map((x) => x.kind),
    ['splice', 'splice', 'splice', 'splice', 'undo', 'splice', 'splice', 'splice'],
  );
  assert.equal(f.direct.requestHistory('redo'), false);
  const count = f.requests.length;
  f.fire('keyup', { key: 'z', code: 'KeyZ', metaKey: false, ctrlKey: false });
  await tick();
  assert.equal(f.requests.length, count);
  assert.equal(f.direct.settled(), true);
});
test('명시 typing style은 plain held 경로를 사용하지 않고 ACK/요청kind 유지', async (t) => {
  const f = fixture(t, 'AB', 1, true, true);
  assert.equal(f.direct.setCharacterProperties({ bold: true }), true);
  f.type('a');
  f.type('b');
  assert.equal(f.direct.requestHistory('undo'), true);
  assert.equal(f.waiting[0].kind, 'splice-character-properties');
  f.ack();
  await tick();
  assert.equal(f.stages(), 0);
  assert.equal(f.direct.consumeDeferredTypingProjection(), false);
  assert.equal(f.requests[1].kind, 'splice-character-properties');
});
