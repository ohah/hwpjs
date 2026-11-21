import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, SET_HWP5_VERTICAL_MARGINS_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import type { EditorRuntime, RuntimeReply } from '../../src/contracts.ts';
const selector = { kind: 'textbox', section: 0, node: 17 } as const;
const margins = { left: 0, right: 1, top: 2, bottom: 3 };
type Options = {
  format?: 'hwp5' | 'hwpx';
  observation?: (v: any) => any;
  delayedQuery?: () => Promise<void>;
  policy?: 'square' | 'raw3' | 'inline';
  readOnly?: boolean;
  limited?: boolean;
  protocol?: 1 | 2;
  atomic?: boolean;
  old?: boolean;
  noOp?: boolean;
  reply?: Partial<RuntimeReply>;
  wrongNode?: boolean;
  admitted?: () => boolean;
};
// Private synthetic adapter only: this does not qualify an artifact or execute a Native engine.
async function setup(o: Options = {}) {
  let revision = 0;
  const calls: { kind: string; [key: string]: unknown }[] = [];
  const content = () => ({
    format: o.format ?? 'hwp5',
    readOnly: !!o.readOnly,
    limited: !!o.limited,
    totalParagraphs: 1,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: '\ufffc',
        editable: true,
        selectionOwner: 'section:0:body',
      },
    ],
  });
  const native = () => ({
    schemaVersion: 1 as const,
    profile: 'hwp5-observed-vertical-outer-margins-v1' as const,
    witness: {
      schemaVersion: 1 as const,
      format: 'hwp5' as const,
      selector: { ...selector, node: o.wrongNode ? 18 : 17 },
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
        epoch: { lo: revision, hi: 1 },
      },
      viewEpoch: { lo: revision, hi: 1 },
      historyRevision: revision,
      margins,
      editable: !o.policy || o.policy === 'square',
      reason: o.policy && o.policy !== 'square' ? 'UnverifiedMarginEffect' : null,
      wrapOrdinal: o.policy === 'raw3' ? 3 : 1,
      inline: o.policy === 'inline',
      ownerScope: 'h5-vertical-margins:12345678-1234-4123-8123-123456789abc',
    },
  });
  const runtime: EditorRuntime = {
    async request(message, context): Promise<RuntimeReply> {
      calls.push(message);
      const base: RuntimeReply = {
        kind: message.kind,
        historyRevision: revision,
        historyStats: {
          protocolVersion: o.protocol ?? 2,
          requested: {},
          resolved: {},
          retainedBytes: null,
          metadataOwnedBytes: null,
          currentOwnedBytes: null,
          undoOwnedBytes: null,
          redoOwnedBytes: null,
          evictedCount: null,
        },
        meta: { context, application: 'unapplied', changed: false },
      };
      if (message.kind === 'hwp5-vertical-object-margins-query') {
        await o.delayedQuery?.();
        return {
          ...base,
          verticalMargins: o.old ? null : (o.observation?.(native()) ?? native()),
          reason: 'Hwp5VerticalMarginsUnavailable',
        };
      }
      if (message.kind === 'hwp5-vertical-object-margins-set') {
        if (o.noOp) return { ...base, changed: false, applied: false };
        revision++;
        return {
          ...base,
          historyRevision: revision,
          content: content(),
          changed: true,
          applied: true,
          meta: { context, application: 'applied', changed: true },
          ...o.reply,
        };
      }
      return { ...base, content: content() };
    },
    dispose() {},
  };
  const editor = createEditor({
    runtimeFactory: () => {
      let disposed = false;
      const fresh: EditorRuntime = {
        ...runtime,
        dispose() {
          disposed = true;
        },
      };
      if (o.atomic !== false)
        bindRuntimeAdmission(
          fresh,
          async (m, c, admit) => {
            admit();
            return fresh.request(m, c);
          },
          () => !disposed && (o.admitted?.() ?? true),
        );
      return fresh;
    },
  });
  await editor.load(new Uint8Array([1]), { format: o.format ?? 'hwp5', editable: true });
  return {
    editor,
    calls,
    writes: () => calls.filter((c) => c.kind === 'hwp5-vertical-object-margins-set'),
  };
}

async function target(editor: ReturnType<typeof createEditor>) {
  const r = await editor.getHwp5VerticalMargins(selector);
  if (r.state !== 'available') throw Error(r.reason);
  assert.equal(r.observation.format, 'hwp5');
  assert.equal(r.observation.selector.kind, 'textbox');
  return r.target;
}
test('H5 raw1 current typed textbox target reuses public command and whole witness', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    const result = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: t,
      top: 750,
      bottom: 1500,
    });
    assert.equal(result.status, 'committed-with-snapshot');
    assert.equal(h.writes().length, 1);
    const r = h.writes()[0].request as any;
    assert.equal(r.profile, 'hwp5-observed-vertical-outer-margins-v1');
    assert.equal(r.top, 750);
    assert.equal(r.bottom, 1500);
    assert.equal(r.margins, undefined);
    assert.equal(r.witness.selector.kind, 'textbox');
    assert.equal(r.witness.ticket.owner.hi, 1);
    assert.equal(r.geometry, undefined);
    const stale = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: t,
      top: 2,
      bottom: 3,
    });
    assert.equal(stale.status, 'rejected-unapplied');
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('H5 raw1 exact no-op keeps revision and uses Native validation once', async () => {
  const h = await setup({ noOp: true });
  try {
    const r = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: await target(h.editor),
      top: 2,
      bottom: 3,
    });
    assert.equal(r.state.nativeHistoryRevision, 0);
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
for (const policy of ['raw3', 'inline'] as const)
  test(`H5 raw1 ${policy} cannot issue public write target`, async () => {
    const h = await setup({ policy });
    try {
      const r = await h.editor.getHwp5VerticalMargins(selector);
      assert.equal(r.state, 'unavailable');
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('H5 raw1 foreign editor target is rejected before runtime mutation', async () => {
  const a = await setup(),
    b = await setup();
  try {
    const result = await b.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: await target(a.editor),
      top: 2,
      bottom: 3,
    });
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(b.writes().length, 0);
  } finally {
    await a.editor.dispose();
    await b.editor.dispose();
  }
});

for (const options of [
  { readOnly: true },
  { limited: true },
  { format: 'hwpx' as const },
  { protocol: 1 as const },
  { atomic: false },
  { old: true },
])
  test(`H5 raw1 refuses unavailable context ${JSON.stringify(options)}`, async () => {
    const h = await setup(options);
    try {
      assert.equal((await h.editor.getHwp5VerticalMargins(selector)).state, 'unavailable');
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('H5 raw1 cloned owner cannot gain authority', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    for (const fake of [{ ...t }, structuredClone(t)]) {
      const r = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
        target: fake as typeof t,
        top: 10,
        bottom: 20,
      });
      assert.equal(r.status, 'rejected-unapplied');
    }
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('H5 raw1 target expires after reload with same native revision', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    await h.editor.load(new Uint8Array([2]), { format: 'hwp5', editable: true });
    const r = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: t,
      top: 10,
      bottom: 20,
    });
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const value of [-32769, 32768, NaN, Infinity, -0, 1.5, -1])
  test(`H5 raw1 rejects invalid new vertical value ${String(value)}`, async () => {
    const h = await setup();
    try {
      const t = await target(h.editor);
      if (value !== -1)
        assert.throws(
          () =>
            h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
              target: t,
              top: value,
              bottom: 3,
            }),
          /InvalidVerticalMargins/,
        );
      else {
        const r = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
          target: t,
          top: value,
          bottom: 3,
        });
        assert.equal(r.status, 'rejected-unapplied');
      }
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('H5 raw1 payload is copied before queue and old Square path is never used', async () => {
  const h = await setup();
  try {
    const input = { target: await target(h.editor), top: 750, bottom: 1500 };
    const pending = h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, input);
    input.top = 999;
    const r = await pending;
    assert.equal(r.status, 'committed-with-snapshot');
    assert.equal((h.writes()[0].request as any).top, 750);
    assert.equal(
      h.calls.some(
        (c) => c.kind === 'object-outer-margins-set' || c.kind === 'object-body-flow-set',
      ),
      false,
    );
  } finally {
    await h.editor.dispose();
  }
});
for (const [name, change] of [
  ['profile', (v: any) => ({ ...v, profile: 'square' })],
  [
    'selector',
    (v: any) => ({ ...v, witness: { ...v.witness, selector: { ...selector, node: 18 } } }),
  ],
  ['revision', (v: any) => ({ ...v, witness: { ...v.witness, historyRevision: 99 } })],
  ['raw0', (v: any) => ({ ...v, witness: { ...v.witness, wrapOrdinal: 0 } })],
] as const)
  test(`H5 raw1 refuses mismatched ${name}`, async () => {
    const h = await setup({ observation: change });
    try {
      await assert.rejects(h.editor.getHwp5VerticalMargins(selector));
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });

for (const queued of [false, true])
  test(`H5 raw1 selection transition invalidates target queued=${queued}`, async () => {
    const h = await setup();
    try {
      const t = await target(h.editor),
        selection = h.editor.setSelection(null);
      if (!queued) await selection;
      const pending = h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
        target: t,
        top: 750,
        bottom: 1500,
      });
      await selection;
      assert.equal((await pending).status, 'rejected-unapplied');
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('H5 raw1 final admission is checked after target issuance', async () => {
  let allowed = true;
  const h = await setup({ admitted: () => allowed });
  try {
    const t = await target(h.editor);
    allowed = false;
    const r = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: t,
      top: 750,
      bottom: 1500,
    });
    assert.equal(r.status, 'rejected-unapplied');
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const kind of ['hwp5-vertical-object-margins-query', 'hwp5-vertical-object-margins-set'])
  test(`H5 raw1 experimental ${kind} cannot bypass typed owner`, async () => {
    const h = await setup();
    try {
      assert.throws(
        () => h.editor.requestExperimental({ kind, qualified: true }, { allowUnsafe: true } as any),
        /UseTypedEditorOperation/,
      );
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('H5 raw1 public view preserves signed horizontal values without exposing witness', async () => {
  const h = await setup({
    observation: (v) => ({
      ...v,
      witness: { ...v.witness, margins: { ...v.witness.margins, left: -32768, right: 32767 } },
    }),
  });
  try {
    const r = await h.editor.getHwp5VerticalMargins(selector);
    assert.equal(r.state, 'available');
    if (r.state !== 'available') throw Error('not available');
    assert.equal(r.observation.left, -32768);
    assert.equal(r.observation.right, 32767);
    assert.equal('witness' in r.observation, false);
    assert.equal('ticket' in r.observation, false);
    assert.throws(() =>
      h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
        target: r.target,
        top: 1,
        bottom: 2,
        left: 0,
      } as any),
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});

for (const reason of [
  'UnsupportedOuterMarginCaptionFlow',
  'OuterMarginsReadOnly',
  'UnsupportedOuterMarginTableOwner',
])
  test(`H5 raw1 readonly ${reason} never issues a target`, async () => {
    const h = await setup({
      observation: (v) => ({ ...v, witness: { ...v.witness, editable: false, reason } }),
    });
    try {
      const r = await h.editor.getHwp5VerticalMargins(selector);
      assert.deepEqual(r, { state: 'unavailable', reason });
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('H5 raw1 preserves already applied result through projection failure without replay', async () => {
  const h = await setup({ reply: { content: undefined, error: 'ProjectionFailed' } });
  try {
    const r = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: await target(h.editor),
      top: 750,
      bottom: 1500,
    });
    assert.equal(r.status, 'committed-refresh-required');
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('H5 raw1 exact retained negative passes complete witness once', async () => {
  const h = await setup({
    observation: (v) => ({
      ...v,
      witness: { ...v.witness, margins: { ...v.witness.margins, top: -3 } },
    }),
  });
  try {
    const r = await h.editor.dispatchCommand(SET_HWP5_VERTICAL_MARGINS_COMMAND, {
      target: await target(h.editor),
      top: -3,
      bottom: 1500,
    });
    assert.equal(r.status, 'committed-with-snapshot');
    assert.equal((h.writes()[0].request as any).top, -3);
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
