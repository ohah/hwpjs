import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
// Pure public fallback policy only; this custom runtime never receives Native authority.
async function fixture(initial = {}, editable = true) {
  let extra = initial;
  const e = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        return {
          kind: m.kind,
          content: { format: 'hwp5', readOnly: false, paragraphs: [] },
          ...extra,
        };
      },
      dispose() {},
    }),
  });
  await e.load(new Uint8Array([1]), { format: 'hwp5', editable });
  const lease = e.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition() {},
  });
  return {
    e,
    async close() {
      lease.release();
      await e.dispose();
    },
    set(v) {
      extra = v;
    },
    get caps() {
      return e.getEditorState().capabilities;
    },
    async refresh() {
      await lease.request(
        { kind: 'set-edit-window', offset: null, count: null },
        { token: e.getEditorState().token, coordinates: 'legacy-native' },
      );
      return e.getEditorState().capabilities;
    },
  };
}
test('explicit capabilities overrides inheritance and catchall extras', async () => {
  const f = await fixture({ old: 1 });
  try {
    f.set({ capabilities: { only: 2 }, extra: 3, changed: true });
    const c = await f.refresh();
    assert.equal(c.only, 2);
    for (const k of ['old', 'extra', 'changed']) assert.equal(Object.hasOwn(c, k), false);
    assert(Object.isFrozen(c));
  } finally {
    await f.close();
  }
});
test('absent/null/undefined capabilities retain legacy inheritance and extra reply keys', async () => {
  for (const patch of [{}, { capabilities: null }, { capabilities: undefined }]) {
    const f = await fixture({ old: 1 });
    try {
      f.set({ ...patch, changed: true, extra: 3 });
      const c = await f.refresh();
      assert.equal(c.old, 1);
      assert.equal(c.changed, true);
      assert.equal(c.extra, 3);
    } finally {
      await f.close();
    }
  }
});
test('explicit own undefined and absent properties remain distinguishable', async () => {
  const f = await fixture({ capabilities: { value: undefined } });
  try {
    assert.equal(Object.hasOwn(f.caps, 'value'), true);
    const a = f.caps;
    f.set({ capabilities: {} });
    const b = await f.refresh();
    assert.notEqual(a, b);
    assert.equal(Object.hasOwn(b, 'value'), false);
    f.set({ capabilities: { value: undefined } });
    const c = await f.refresh();
    assert.equal(Object.hasOwn(c, 'value'), true);
    assert.equal(c.value, undefined);
  } finally {
    await f.close();
  }
});
test('full fallback preserves allocation policy even with identical scalar metadata', async () => {
  const f = await fixture({ capabilities: { extra: 1 } });
  try {
    const a = f.caps;
    const b = await f.refresh();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  } finally {
    await f.close();
  }
});
test('catchall excludes transport/history/content fields but preserves changed and unknown extras', async () => {
  const f = await fixture();
  try {
    f.set({
      changed: true,
      unknownExtra: 7,
      historyRevision: 1,
      historyRevisions: [0, 1],
      historyStats: { protocolVersion: 2 },
      nativeTextDelta: { bad: true },
      meta: { application: 'unapplied', changed: false },
    });
    const c = await f.refresh();
    assert.equal(c.changed, true);
    assert.equal(c.unknownExtra, 7);
    for (const k of [
      'kind',
      'content',
      'meta',
      'historyRevision',
      'historyRevisions',
      'historyStats',
      'nativeTextDelta',
    ])
      assert.equal(Object.hasOwn(c, k), false);
  } finally {
    await f.close();
  }
});
test('readonly policy is applied after explicit override and remains readonly on fallback', async () => {
  const f = await fixture(
    { capabilities: { historyAvailable: true, readOnly: false, extra: 1 } },
    false,
  );
  try {
    assert.equal(f.caps.readOnly, true);
    assert.equal(f.caps.historyAvailable, false);
    assert.equal(f.caps.extra, 1);
    f.set({ capabilities: { historyAvailable: true, readOnly: false, extra: 2 } });
    const c = await f.refresh();
    assert.equal(c.readOnly, true);
    assert.equal(c.historyAvailable, false);
    assert.equal(c.extra, 2);
  } finally {
    await f.close();
  }
});

test('full-path content Proxy cannot change already assembled capability extras', async () => {
  let raw,
    traps = 0;
  const e = createEditor({
    runtimeFactory: () => ({
      async request(message, context) {
        raw = { kind: message.kind, extra: 'before', content: null, meta: { context } };
        raw.content = new Proxy(
          { format: 'hwp5', paragraphs: [], limited: false },
          {
            ownKeys(target) {
              traps++;
              raw.extra = 'after';
              return Reflect.ownKeys(target);
            },
          },
        );
        return raw;
      },
      dispose() {},
    }),
  });
  try {
    await e.load(new Uint8Array([1]), { format: 'hwp5', editable: false });
    assert(traps > 0, 'counterexample must actually reflect content');
    assert.equal(raw.extra, 'after');
    assert.equal(
      e.getEditorState().capabilities.extra,
      'before',
      'assemble before observing content',
    );
  } finally {
    await e.dispose();
  }
});
for (const kind of ['Map', 'Set'])
  test(`custom full-path ${kind} retains non-plain observation semantics`, async () => {
    const value = kind === 'Map' ? new Map([['value', 1]]) : new Set([1, 2]);
    const f = await fixture({ capabilities: value });
    try {
      const c = f.caps;
      if (kind === 'Map') {
        assert(c instanceof Map);
        assert.deepEqual(Array.from(c.entries()), [['value', 1]]);
      } else {
        assert(c instanceof Set);
        assert.deepEqual(Array.from(c.values()), [1, 2]);
      }
      // This proves only full fallback, never COW reachability/authority for external Map/Set.
    } finally {
      await f.close();
    }
  });
test('custom full-path Date retains legacy UnsupportedPayload rejection', async () => {
  const e = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        return {
          kind: m.kind,
          content: { format: 'hwp5', paragraphs: [], limited: false },
          capabilities: new Date(0),
        };
      },
      dispose() {},
    }),
  });
  try {
    await assert.rejects(
      e.load(new Uint8Array([1]), { format: 'hwp5', editable: true }),
      /UnsupportedPayload/,
    );
  } finally {
    await e.dispose();
  }
});

test('source: SSOT raw assembly precedes content; reuse only owned plain records', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../../src/editor/create-editor.ts', import.meta.url), 'utf8')
    .replace(/\s+/g, '')
    .replace(/,([)}\]])/g, '$1');
  assert(s.includes('functionassembleCapabilities(reply:RuntimeReply,inherit=true):unknown'));
  assert(
    s.includes(
      'functionobserveCapabilities(value:unknown,editable?:boolean,reuseCurrent=false):unknown',
    ),
  );
  assert(
    s.includes(
      'isOwnedImmutableObservation(previousValue)&&plainRecord(previousValue)&&plainRecord(projected)',
    ),
  );
  assert(s.includes('returnproto===Object.prototype||proto===null;'));
  const begin = s.indexOf('functioncontentPatch('),
    end = s.indexOf('asyncfunctionfinishCandidate(', begin),
    body = s.slice(begin, end);
  const assembly = body.indexOf('constcapabilities=assembleCapabilities(reply,inherit);');
  assert(
    assembly >= 0 &&
      assembly <
        body.indexOf(
          'content:ownObservation(writePolicy.observe(reply.content,observedEditable))()',
        ),
  );
  assert(body.includes('capabilities:observeCapabilities(capabilities,observedEditable)'));
  assert(
    s.includes('capabilities:observeCapabilities(assembleCapabilities(reply),undefined,true)'),
  );
});
