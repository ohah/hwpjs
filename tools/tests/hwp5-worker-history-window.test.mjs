import test from 'node:test';
import assert from 'node:assert/strict';
import { channel, module, bytes } from './helpers/cow-worker-fixtures.mjs';
import {
  cloneData,
  row,
  insertExpected,
  assertFullSnapshot,
} from './helpers/hwp5-native-text-expectation.mjs';
const splice = (p, at, text) => ({
  kind: 'splice',
  section: 0,
  paragraph: p,
  startUnit: at,
  endUnit: at,
  text,
});
async function pair(paragraph) {
  const a = channel(),
    b = channel();
  try {
    const initial = [];
    for (const c of [a, b]) {
      await c.send({
        kind: 'initialize-runtime',
        wasmModule: module,
        referenceScope: 'regular-worker-history',
      });
      assert.equal(c.brand, false, 'structured clone module has no Worker-local authority');
      await c.send({ kind: 'load', format: 'hwp5', bytes });
      const r = await c.send({ kind: 'enable' });
      assert.equal(r.error, undefined);
      initial.push(r);
    }
    assert.deepEqual(initial[0].content, initial[1].content);
    const original = cloneData(initial[0].content),
      flow = original.currentParagraphFlows.find(
        (f) => f.section === 0 && f.paragraph === paragraph,
      );
    assert(flow);
    const owner = {
      section: 0,
      paragraph,
      sourceNode: flow.source_node,
      parentNode: flow.parent_node,
    };
    return {
      a,
      b,
      original,
      owner,
      initial: initial[0],
      close: () => Promise.all([a.close(), b.close()]),
    };
  } catch (error) {
    await Promise.all([a.close(), b.close()]);
    throw error;
  }
}
function hint(s, operation, beforeRevision, expectedRevision, beforeEpoch) {
  return {
    kind: 'history-window-v1',
    operation,
    beforeRevision,
    expectedRevision,
    beforeEpoch,
    owner: { ...s.owner },
  };
}
function packet(reply, s, expected, preference, priorEpoch) {
  assert.equal(reply.error, undefined);
  assert.equal(reply.meta.application, 'applied');
  assert.equal(reply.meta.changed, true);
  const p = reply.content;
  assert(p);
  assert.equal(p.viewKind, 'history-owner-window');
  assert.equal(p.version, 1);
  assert.equal(p.operation, preference.operation);
  assert.deepEqual(p.owner, s.owner);
  assert.equal(p.beforeRevision, preference.beforeRevision);
  assert.equal(p.revision, preference.expectedRevision);
  assert.equal(reply.historyRevision, preference.expectedRevision);
  assert.equal(p.beforeEpoch, priorEpoch);
  assert(BigInt(p.epoch) > BigInt(priorEpoch));
  assert.equal(p.window.epoch, p.epoch);
  const r = row(expected, s.owner.paragraph);
  assert.equal(p.window.startUnit, 0);
  assert.equal(p.window.endUnit, r.text.length + 1);
  assert.equal(p.window.totalUnits, r.text.length + 1);
  assert.equal(p.window.text, r.text + '\r');
  assert.deepEqual(p.characterRanges, r.characterRanges);
  assert.deepEqual(p.reference, { ...r.currentReference, epoch: p.epoch });
  assert.equal(p.window.section, s.owner.section);
  assert.equal(p.window.sourceNode, s.owner.sourceNode);
  assert.equal(p.window.parentNode, s.owner.parentNode);
}
for (const paragraph of [4, 15, 18])
  test(`Worker history data ${paragraph}: actual receipt / one undo-redo / complete full fallback`, async () => {
    const s = await pair(paragraph);
    try {
      const at = paragraph === 4 ? 2 : 0,
        next = insertExpected(s.original, paragraph, at, '가');
      const thin = await s.a.send(splice(paragraph, at, '가'), 'owner-window-v1');
      const full = await s.b.send(splice(paragraph, at, '가'));
      assert.equal(thin.content.viewKind, 'owner-window-patch');
      assert.equal(full.content.viewKind, undefined);
      assertFullSnapshot(full.content, next, s.original);
      let epoch = thin.content.receipt.epoch,
        rev = thin.historyRevision,
        beforeFull = full.content;
      const parent = s.initial.historyRevision,
        child = rev;
      for (const [operation, expectedRevision, expected] of [
        ['undo', parent, s.original],
        ['redo', child, next],
      ]) {
        const pref = hint(s, operation, rev, expectedRevision, epoch),
          before = { ...s.a.counts };
        const r = await s.a.send({ kind: operation }, pref),
          f = await s.b.send({ kind: operation });
        packet(r, s, expected, pref, epoch);
        assert.equal(f.content.viewKind, undefined);
        assertFullSnapshot(f.content, expected, beforeFull);
        assert.equal(
          s.a.counts[`hwp5_edit_${operation}`] - (before[`hwp5_edit_${operation}`] ?? 0),
          1,
        );
        for (const name of ['hwp5_edit_current_text_preview', 'hwp5_edit_last_text_delta_receipt'])
          assert.equal(
            (s.a.counts[name] ?? 0) - (before[name] ?? 0),
            0,
            name + ' not used for history thin path',
          );
        epoch = r.content.epoch;
        rev = r.historyRevision;
        beforeFull = f.content;
      }
      const count = s.a.counts.hwp5_edit_current_text_preview ?? 0;
      const fresh = await s.a.send({ kind: 'refresh' });
      assertFullSnapshot(fresh.content, next, s.original);
      assert.deepEqual(
        fresh.content,
        beforeFull,
        'full materialization agrees with separate full Native instance',
      );
      assert.equal((s.a.counts.hwp5_edit_current_text_preview ?? 0) - count, 1);
    } finally {
      await s.close();
    }
  });
test('Worker history hint stale epoch: full fallback, one mutation, before-derived original DTO', async () => {
  const s = await pair(15);
  try {
    const next = insertExpected(s.original, 15, 0, '가');
    const thin = await s.a.send(splice(15, 0, '가'), 'owner-window-v1');
    await s.b.send(splice(15, 0, '가'));
    const before = { ...s.a.counts },
      pref = hint(s, 'undo', thin.historyRevision, s.initial.historyRevision, '999999999');
    const actual = await s.a.send({ kind: 'undo' }, pref),
      full = await s.b.send({ kind: 'undo' });
    assert.equal(actual.error, undefined);
    assert.equal(actual.content.viewKind, undefined);
    assertFullSnapshot(actual.content, s.original, next);
    assert.deepEqual(actual.content, full.content);
    assert.equal(s.a.counts.hwp5_edit_undo - (before.hwp5_edit_undo ?? 0), 1);
    assert(
      (s.a.counts.hwp5_edit_current_text_preview ?? 0) -
        (before.hwp5_edit_current_text_preview ?? 0) >
        0,
    );
  } finally {
    await s.close();
  }
});
test('Worker public undo/redo ignores message-body history hints and keeps full DTO', async () => {
  const s = await pair(15);
  try {
    const next = insertExpected(s.original, 15, 0, '가');
    const thin = await s.a.send(splice(15, 0, '가'), 'owner-window-v1');
    await s.b.send(splice(15, 0, '가'));
    let prior = next;
    for (const [kind, expected, revision] of [
      ['undo', s.original, s.initial.historyRevision],
      ['redo', next, thin.historyRevision],
    ]) {
      const preference = hint(s, kind, thin.historyRevision, revision, thin.content.receipt.epoch),
        before = { ...s.a.counts };
      const r = await s.a.send({
        kind,
        viewProjection: preference,
        ownerWindowProjection: preference,
      });
      const full = await s.b.send({ kind });
      assert.equal(r.error, undefined);
      assert.equal(r.content.viewKind, undefined);
      assertFullSnapshot(r.content, expected, prior);
      assert.deepEqual(r.content, full.content);
      assert.equal(s.a.counts[`hwp5_edit_${kind}`] - (before[`hwp5_edit_${kind}`] ?? 0), 1);
      prior = expected;
    }
  } finally {
    await s.close();
  }
});

test('Worker history dirty reads: both request-specific shapes before DTO/caps/save equality', async () => {
  const s = await pair(15);
  try {
    const next = insertExpected(s.original, 15, 0, '가');
    const thin = await s.a.send(splice(15, 0, '가'), 'owner-window-v1');
    await s.b.send(splice(15, 0, '가'));
    const pref = hint(
      s,
      'undo',
      thin.historyRevision,
      s.initial.historyRevision,
      thin.content.receipt.epoch,
    );
    const u = await s.a.send({ kind: 'undo' }, pref);
    packet(u, s, s.original, pref, thin.content.receipt.epoch);
    const bu = await s.b.send({ kind: 'undo' });
    assertFullSnapshot(bu.content, s.original, next);
    for (const request of [
      { kind: 'query-window', offset: 14, count: 3 },
      { kind: 'set-edit-window', offset: null, count: null },
      { kind: 'formatting-capabilities' },
      { kind: 'save', allowStaleLayout: true },
    ]) {
      // The shared channel rejects missing shapes on EACH side before these comparisons.
      const x = await s.a.send(request),
        y = await s.b.send(request);
      if (request.kind === 'query-window' || request.kind === 'set-edit-window') {
        for (const reply of [x, y]) {
          const p = row(reply.content, 15),
            want = row(s.original, 15);
          assert.equal(p.text, want.text);
          assert.deepEqual(p.characterRanges, want.characterRanges);
        }
        assert.deepEqual(x.content, y.content);
      } else if (request.kind === 'formatting-capabilities')
        assert.deepEqual(x.formattingCapabilities, y.formattingCapabilities);
      else assert.deepEqual(x.bytes, y.bytes);
      assert.equal(x.historyRevision, y.historyRevision);
    }
  } finally {
    await s.close();
  }
});
