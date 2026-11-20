import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDocumentTextReadView } from '../src/document-text-read-view.ts';
function harness(patch: any = {}) {
  let state: any = {
      status: 'ready',
      documentId: 'd',
      generation: 1,
      operationRevision: 2,
      viewRevision: 1,
      capabilities: { readOnly: true },
    },
    evidence = false,
    active = true;
  const calls: string[] = [];
  const port = {
    state: () => state,
    current: () => active,
    hasEvidence: () => evidence,
    bindingAvailable: async () => {
      calls.push('binding');
      return true;
    },
    refresh: async () => {
      calls.push('refresh');
      state = { ...state, viewRevision: 2 };
      evidence = true;
    },
    wait: async (current: () => boolean) => {
      calls.push('paint');
      return current();
    },
    ...patch,
  };
  return {
    port,
    calls,
    evidence() {
      evidence = true;
    },
    cancel() {
      active = false;
    },
    change(p: any) {
      state = { ...state, ...p };
    },
  };
}
test('revoked read source requires a fresh Native view and painted readiness, not a getter-only re-tag', async () => {
  const h = harness();
  assert.equal(await prepareDocumentTextReadView(h.port), 'refreshed');
  assert.deepEqual(h.calls, ['binding', 'refresh', 'paint']);
  assert.equal(h.port.state().viewRevision, 2);
});
test('current read source waits for actual painted readiness without refreshing or enabling History', async () => {
  const h = harness();
  h.evidence();
  assert.equal(await prepareDocumentTextReadView(h.port), 'current');
  assert.deepEqual(h.calls, ['paint']);
  assert.equal(h.port.state().nativeHistoryRevision, undefined);
});
test('readonly missing optional Native capability cannot fall back to a writable or synthetic frame', async () => {
  const h = harness({ bindingAvailable: async () => false });
  assert.equal(await prepareDocumentTextReadView(h.port), 'unavailable');
  assert.deepEqual(h.calls, []);
});
test('getter success without a newly issued view source cannot certify the old content', async () => {
  const h = harness({ refresh: async () => {} });
  assert.equal(await prepareDocumentTextReadView(h.port), 'unavailable');
  assert.deepEqual(h.calls, ['binding']);
});
test('document, operation or Surface changes during await cancel without refreshing a successor', async () => {
  for (const patch of [{ documentId: 'new' }, { generation: 2 }, { operationRevision: 3 }]) {
    const h = harness();
    h.port.bindingAvailable = async () => {
      h.change(patch);
      return true;
    };
    assert.equal(await prepareDocumentTextReadView(h.port), 'unavailable');
    assert.deepEqual(h.calls, []);
  }
  const h = harness();
  h.port.bindingAvailable = async () => {
    h.cancel();
    return true;
  };
  assert.equal(await prepareDocumentTextReadView(h.port), 'unavailable');
});
test('failed Native refresh and incomplete paint preserve failure rather than claim readiness', async () => {
  const h = harness({
    refresh: async () => {
      throw Error('HistoryReloadRequired');
    },
  });
  await assert.rejects(prepareDocumentTextReadView(h.port), /HistoryReloadRequired/);
  const p = harness({ wait: async () => false });
  assert.equal(await prepareDocumentTextReadView(p.port), 'unavailable');
});
