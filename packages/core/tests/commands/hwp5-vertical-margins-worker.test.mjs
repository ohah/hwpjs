import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queryHwp5VerticalMargins,
  commitHwp5VerticalMargins,
} from '../../../../web/preview/hwp5-vertical-margins-command.mjs';
const selector = { section: 0, node: 17, kind: 'textbox' };
const context = { format: 'hwp5', qualified: true, historyEnabled: true, historyPoisoned: false };
// Synthetic internal context only. This does not register a Native/SDK artifact.
function setup(options = {}) {
  let rev = 0,
    writes = 0,
    reads = 0;
  const observation = () => ({
    schemaVersion: 1,
    profile: 'hwp5-observed-vertical-outer-margins-v1',
    witness: {
      schemaVersion: 1,
      format: 'hwp5',
      selector: { ...selector },
      owner: {
        control_node: 8,
        component_node: 17,
        paragraph_node: 0,
        paragraph: 0,
        anchor_unit: 0,
        instance_id: 7,
        source_sha256: Array(32).fill(1),
      },
      ticket: {
        document: { lo: 1, hi: 1 },
        generation: { lo: 2, hi: 1 },
        owner: { lo: 3, hi: 1 },
        epoch: { lo: rev, hi: 1 },
      },
      viewEpoch: { lo: rev, hi: 1 },
      historyRevision: rev,
      margins: { left: -10, right: 20, top: options.top ?? 2, bottom: 3 },
      editable: true,
      reason: null,
      wrapOrdinal: 1,
      inline: false,
      ownerScope: 'h5-vertical-margins:12345678-1234-4123-8123-123456789abc',
    },
  });
  const editor = {
    historyStats: () => ({
      protocolVersion: options.protocol ?? 2,
      poisoned: options.poisoned ?? false,
    }),
    supportsVerticalObjectOuterMargins: () => options.supports ?? true,
    historyRevision: () => {
      if (options.badAfter && writes) throw Error('HistoryReadFailed');
      return rev;
    },
    verticalObjectOuterMargins: () => {
      reads++;
      const v = observation();
      if (options.queryRevisionRace) rev++;
      return options.observation?.(v) ?? v;
    },
    setVerticalObjectOuterMargins: () => {
      writes++;
      if (options.noop) return { application: 'unapplied', changed: false, nativeCode: 2 };
      if (options.reject)
        return {
          application: 'unapplied',
          changed: false,
          nativeCode: 0,
          error: 'ProtectedObject',
        };
      if (options.unknown)
        return {
          application: 'unknown',
          changed: null,
          nativeCode: 1,
          error: 'UnknownNativeMutation',
        };
      if (!options.missingRevision) rev++;
      return { application: 'applied', changed: true, nativeCode: 1 };
    },
  };
  return {
    editor,
    observation,
    request: () => ({ ...observation(), top: 750, bottom: 1500 }),
    writes: () => writes,
    reads: () => reads,
    revision: () => rev,
    advance: () => rev++,
  };
}
test('synthetic raw1 query binds complete witness; commit changes revision once', () => {
  const h = setup();
  const r = queryHwp5VerticalMargins(h.editor, selector, context);
  assert.equal(r.verticalMargins.witness.owner.source_sha256.length, 32);
  assert.equal(
    commitHwp5VerticalMargins(h.editor, { ...r.verticalMargins, top: 750, bottom: 1500 }, context)
      .application,
    'applied',
  );
  assert.equal(h.writes(), 1);
  assert.equal(h.revision(), 1);
});
for (const [name, c] of [
  ['unqualified', { ...context, qualified: false }],
  ['HWPX', { ...context, format: 'hwpx' }],
  ['history disabled', { ...context, historyEnabled: false }],
])
  test(`synthetic raw1 ${name} denies before Native`, () => {
    const h = setup();
    assert.equal(queryHwp5VerticalMargins(h.editor, selector, c).verticalMargins, null);
    assert.throws(() => commitHwp5VerticalMargins(h.editor, h.request(), c));
    assert.equal(h.reads(), 0);
    assert.equal(h.writes(), 0);
  });
for (const [name, o] of [
  ['legacy', { protocol: 1 }],
  ['old exports', { supports: false }],
])
  test(`synthetic raw1 ${name} denies before Native`, () => {
    const h = setup(o);
    assert.equal(queryHwp5VerticalMargins(h.editor, selector, context).verticalMargins, null);
    assert.throws(() => commitHwp5VerticalMargins(h.editor, h.request(), context));
    assert.equal(h.reads(), 0);
    assert.equal(h.writes(), 0);
  });
test('synthetic raw1 poisoned history rejects before read/write', () => {
  const h = setup({ poisoned: true });
  assert.throws(
    () => queryHwp5VerticalMargins(h.editor, selector, context),
    /HistoryMutationUncertain/,
  );
  assert.throws(
    () => commitHwp5VerticalMargins(h.editor, h.request(), context),
    /HistoryMutationUncertain/,
  );
  assert.equal(h.reads(), 0);
  assert.equal(h.writes(), 0);
});
test('synthetic raw1 query detects mid-read revision change', () => {
  const h = setup({ queryRevisionRace: true });
  assert.throws(() => queryHwp5VerticalMargins(h.editor, selector, context), /BindingMismatch/);
});
test('synthetic raw1 stale revision rejected without mutation', () => {
  const h = setup();
  const r = h.request();
  h.advance();
  assert.throws(() => commitHwp5VerticalMargins(h.editor, r, context), /Stale/);
  assert.equal(h.writes(), 0);
});
test('synthetic raw1 exact no-op retains revision and rejection is atomic', () => {
  for (const o of [{ noop: true }, { reject: true }]) {
    const h = setup(o);
    const r = commitHwp5VerticalMargins(h.editor, h.request(), context);
    assert.equal(r.application, 'unapplied');
    assert.equal(h.revision(), 0);
    assert.equal(h.writes(), 1);
  }
});
test('synthetic raw1 unknown result never retries', () => {
  const h = setup({ unknown: true });
  assert.equal(commitHwp5VerticalMargins(h.editor, h.request(), context).application, 'unknown');
  assert.equal(h.writes(), 1);
});
test('synthetic raw1 post-apply cleanup error preserves applied outcome', () => {
  const h = setup({ badAfter: true });
  const r = commitHwp5VerticalMargins(h.editor, h.request(), context);
  assert.equal(r.application, 'applied');
  assert.equal(r.changed, true);
  assert.equal(r.cleanupError, 'HistoryReadFailed');
  assert.equal(h.writes(), 1);
});
test('synthetic raw1 applied without revision is unknown without replay', () => {
  const h = setup({ missingRevision: true });
  const r = commitHwp5VerticalMargins(h.editor, h.request(), context);
  assert.equal(r.application, 'unknown');
  assert.equal(r.changed, null);
  assert.equal(h.writes(), 1);
});
test('synthetic raw1 retains an existing negative word only exactly', () => {
  const h = setup({ top: -3 });
  assert.equal(
    commitHwp5VerticalMargins(h.editor, { ...h.request(), top: -3 }, context).application,
    'applied',
  );
  const k = setup({ top: -3 });
  assert.throws(() => commitHwp5VerticalMargins(k.editor, { ...k.request(), top: -4 }, context));
  assert.equal(k.writes(), 0);
});
for (const [name, change] of [
  ['Square', (r) => ({ ...r, profile: 'hwp5-square' })],
  ['LR mutation', (r) => ({ ...r, left: 99 })],
  ['overflow', (r) => ({ ...r, bottom: 32768 })],
  ['negative zero', (r) => ({ ...r, top: -0 })],
  ['new negative', (r) => ({ ...r, top: -1 })],
  ['inline', (r) => ({ ...r, witness: { ...r.witness, inline: true } })],
  ['raw0', (r) => ({ ...r, witness: { ...r.witness, wrapOrdinal: 0 } })],
])
  test(`synthetic raw1 rejects ${name} without Native`, () => {
    const h = setup();
    assert.throws(() => commitHwp5VerticalMargins(h.editor, change(h.request()), context));
    assert.equal(h.writes(), 0);
  });
