import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { SET_OBJECT_BODY_FLOW_COMMAND } from '../../src/commands/object-body-flow.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import type { EditorRuntime, RuntimeReply } from '../../src/contracts.ts';
const selector = { kind: 'drawing', section: 0, node: 17 } as const;
const flow = { textWrap: 'SQUARE', textFlow: 'BOTH_SIDES' } as const;
type Options = {
  format?: 'hwp5' | 'hwpx';
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
  let revision = 0,
    closed = false;
  const calls: { kind: string; [key: string]: unknown }[] = [];
  const content = () => ({
    format: o.format ?? 'hwpx',
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
    geometry: {
      format: 'hwpx',
      selector: { ...selector, node: o.wrongNode ? 18 : 17 },
      owner: {
        ownerNode: 17,
        componentNode: null,
        paragraph: 0,
        anchorUnit: 0,
        sourceSha256: Array(32).fill(1),
        link: 'rect:owned',
      },
      frame: {
        width: 10,
        height: 20,
        horizontalOffset: 0,
        verticalOffset: 0,
        treatAsCharacter: false,
      },
      editable: { size: true, position: true },
      reason: null,
      historyRevision: revision,
      binding: { session: 'native-session', serial: String(revision) },
    },
    flow,
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
      if (message.kind === 'object-body-flow-query')
        return {
          ...base,
          bodyFlow: o.old ? null : native(),
          reason: 'ObjectBodyFlowUnavailable',
        };
      if (message.kind === 'object-geometry-query') return { ...base, geometry: native().geometry };
      if (message.kind === 'object-body-flow-set') {
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
    dispose() {
      closed = true;
    },
  };
  if (o.atomic !== false)
    bindRuntimeAdmission(
      runtime,
      async (m, c, admit) => {
        admit();
        return runtime.request(m, c);
      },
      () => !closed && (o.admitted?.() ?? true),
    );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format: o.format ?? 'hwpx', editable: true });
  return {
    editor,
    calls,
    writes: () => calls.filter((c) => c.kind === 'object-body-flow-set'),
  };
}
async function target(editor: ReturnType<typeof createEditor>) {
  const r = await editor.getObjectBodyFlow(selector);
  if (r.state !== 'available') throw Error(r.reason);
  assert.deepEqual(Object.keys(r.observation).sort(), ['drawingNode', 'flow', 'format', 'section']);
  return r.target;
}
test('body flow current target sends one transaction and owns caller values without a geometry patch', async () => {
  const h = await setup();
  try {
    const dirty = { textWrap: 'BEHIND_TEXT', textFlow: 'BOTH_SIDES' };
    const pending = h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, {
      target: await target(h.editor),
      flow: dirty as typeof flow,
    });
    dirty.textWrap = 'IN_FRONT_OF_TEXT';
    const result = await pending;
    assert.equal(result.status, 'committed-with-snapshot');
    assert.equal(result.state.nativeHistoryRevision, 1);
    assert.equal(h.writes().length, 1);
    const request = h.writes()[0].request as {
      geometry: { patch: object };
      flow: typeof flow;
    };
    assert.deepEqual(request.geometry.patch, {});
    assert.equal(request.flow.textWrap, 'BEHIND_TEXT');
    assert.equal(h.calls.filter((c) => c.kind === 'object-geometry-set').length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('body flow second edit must capture current state after the first commit', async () => {
  const h = await setup();
  try {
    const old = await target(h.editor);
    assert.equal(
      (await h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, { target: old, flow })).status,
      'committed-with-snapshot',
    );
    assert.equal(
      (await h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, { target: old, flow })).status,
      'rejected-unapplied',
    );
    assert.equal(
      (
        await h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, {
          target: await target(h.editor),
          flow,
        })
      ).state.nativeHistoryRevision,
      2,
    );
    assert.equal(h.writes().length, 2);
  } finally {
    await h.editor.dispose();
  }
});
test('body flow clone other editor and geometry V1 target cannot become body flow authority', async () => {
  const a = await setup(),
    b = await setup();
  try {
    for (const foreign of [structuredClone(await target(a.editor)), await target(b.editor)])
      assert.equal(
        (
          await a.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, {
            target: foreign,
            flow,
          })
        ).status,
        'rejected-unapplied',
      );
    const g = await a.editor.getObjectGeometry(selector);
    if (g.state !== 'available') throw Error('ExpectedGeometry');
    assert.equal(
      (
        await a.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, {
          // @ts-expect-error Geometry V1 target is intentionally a distinct opaque type.
          target: g.target,
          flow,
        })
      ).status,
      'rejected-unapplied',
    );
    assert.equal(a.writes().length, 0);
  } finally {
    await a.editor.dispose();
    await b.editor.dispose();
  }
});
test('body flow selection-only state and queued state transition both invalidate a captured target', async () => {
  for (const queued of [false, true]) {
    const h = await setup();
    try {
      const t = await target(h.editor),
        selection = h.editor.setSelection(null);
      if (!queued) await selection;
      const result = h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, {
        target: t,
        flow,
      });
      await selection;
      assert.equal((await result).status, 'rejected-unapplied');
      assert.equal(h.writes().length, 0);
    } finally {
      await h.editor.dispose();
    }
  }
});
test('body flow final runtime admission is checked again before mutation', async () => {
  let allowed = true;
  const h = await setup({ admitted: () => allowed });
  try {
    const t = await target(h.editor);
    allowed = false;
    assert.equal(
      (await h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, { target: t, flow })).status,
      'rejected-unapplied',
    );
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
for (const options of [
  { format: 'hwp5' },
  { readOnly: true },
  { limited: true },
  { protocol: 1 },
  { atomic: false },
] as Options[])
  test('body flow unavailable gate ' + JSON.stringify(options), async () => {
    const h = await setup(options);
    try {
      assert.equal((await h.editor.getObjectBodyFlow(selector)).state, 'unavailable');
      assert.equal(h.calls.filter((c) => c.kind === 'object-body-flow-query').length, 0);
    } finally {
      await h.editor.dispose();
    }
  });
test('body flow known old ABI does not expose a target', async () => {
  const h = await setup({ old: true });
  try {
    assert.deepEqual(await h.editor.getObjectBodyFlow(selector), {
      state: 'unavailable',
      reason: 'ObjectBodyFlowUnavailable',
    });
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('body flow Native selector mismatch is rejected before any write', async () => {
  const h = await setup({ wrongNode: true });
  try {
    await assert.rejects(h.editor.getObjectBodyFlow(selector), /ObjectBodyFlowBindingMismatch/);
    assert.equal(h.writes().length, 0);
  } finally {
    await h.editor.dispose();
  }
});
test('body flow exact-value no-op is Native validated and does not increment history', async () => {
  const h = await setup({ noOp: true });
  try {
    const r = await h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, {
      target: await target(h.editor),
      flow,
    });
    assert.equal(r.status, 'known-no-op');
    assert.equal(r.state.nativeHistoryRevision, 0);
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('body flow applied projection failure is refresh required without replay', async () => {
  const h = await setup({ reply: { content: undefined, error: 'ProjectionFailed' } });
  try {
    const r = await h.editor.dispatchCommand(SET_OBJECT_BODY_FLOW_COMMAND, {
      target: await target(h.editor),
      flow,
    });
    assert.equal(r.status, 'committed-refresh-required');
    assert.equal(h.writes().length, 1);
  } finally {
    await h.editor.dispose();
  }
});
test('body flow experimental wire cannot bypass typed owner admission', async () => {
  const h = await setup();
  try {
    for (const kind of ['object-body-flow-query', 'object-body-flow-set'])
      assert.throws(
        () =>
          h.editor.requestExperimental(
            { kind },
            { mutation: true, token: h.editor.getEditorState().token },
          ),
        /UseTyped/,
      );
  } finally {
    await h.editor.dispose();
  }
});
