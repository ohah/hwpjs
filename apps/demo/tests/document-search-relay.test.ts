import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentSearchRelay } from '../src/document-search-relay.ts';
const observation: any = { native: { ref: 'read-only' } };
test('framework relay refuses an unmounted or disposed Surface without a selection call', async () => {
  const relay = createDocumentSearchRelay();
  assert.equal(await relay.select(observation, () => true), null);
  let calls = 0;
  relay.connect({
    async selectDocumentText() {
      calls++;
      return null;
    },
  });
  relay.dispose();
  assert.equal(await relay.select(observation, () => true), null);
  assert.equal(calls, 0);
});
test('framework relay preserves observation and current guard for one connected Surface', async () => {
  const relay = createDocumentSearchRelay(),
    state: any = { stateVersion: 8 };
  relay.connect({
    async selectDocumentText(value, current) {
      assert.equal(value, observation);
      assert.equal(current(), true);
      return { state };
    },
  });
  assert.equal((await relay.select(observation, () => true))?.state, state);
  relay.dispose();
});
test('framework reconnect and disposal invalidate delayed old-Surface receipts', async () => {
  for (const dispose of [false, true]) {
    const relay = createDocumentSearchRelay();
    let finish!: () => void, current!: () => boolean;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    relay.connect({
      async selectDocumentText(_value, guard) {
        current = guard;
        await gate;
        return { state: {} as any };
      },
    });
    const pending = relay.select(observation, () => true);
    if (dispose) relay.dispose();
    else
      relay.connect({
        async selectDocumentText() {
          return null;
        },
      });
    assert.equal(current(), false);
    finish();
    assert.equal(await pending, null);
    relay.dispose();
  }
});

test('a delayed old-Surface read-view refresh cannot confirm after framework replacement', async () => {
  const relay = createDocumentSearchRelay();
  let finish!: () => void;
  const gate = new Promise<void>((r) => {
    finish = r;
  });
  let current!: () => boolean;
  relay.connect({
    selectDocumentText: async () => null,
    prepareDocumentTextReadView: async (guard) => {
      current = guard;
      await gate;
      return 'refreshed';
    },
  });
  const pending = relay.prepareRead(() => true);
  relay.connect({ selectDocumentText: async () => null });
  assert.equal(current(), false);
  finish();
  assert.equal(await pending, 'unavailable');
  relay.dispose();
});
