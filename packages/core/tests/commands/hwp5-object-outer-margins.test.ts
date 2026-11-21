import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, SET_OBJECT_OUTER_MARGINS_COMMAND } from '../../src/index.ts';
import { bindRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import type { EditorRuntime, RuntimeReply } from '../../src/contracts.ts';
const selector = { kind: 'textbox', section: 0, node: 17 } as const;
const margins = { left: 0, right: 1, top: 2, bottom: 3 };
type Options = {
  format?: 'hwp5';
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
  let revision = 0,
    closed = false;
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
    schemaVersion: 1 as const, format: 'hwp5' as const,
    selector: { ...selector, node: o.wrongNode ? 18 : 17 },
    owner: { control_node: 8, component_node: 17, paragraph_node: 0, paragraph: 0, anchor_unit: 0, instance_id: 7, source_sha256: Array(32).fill(1) },
    ticket: {document: {lo: 1, hi: 1}, generation: {lo: 2, hi: 1}, owner: {lo: 3, hi: 1}, epoch: {lo: revision, hi: 1}},
    viewEpoch: {lo: revision, hi: 1}, historyRevision: revision, margins,
    editable: !o.policy || o.policy === 'square', reason: o.policy && o.policy !== 'square' ? 'UnverifiedMarginEffect' : null,
    wrapOrdinal: o.policy === 'raw3' ? 3 : 0, inline: o.policy === 'inline',
    ownerScope: 'h5-margins:12345678-1234-4123-8123-123456789abc',
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
      if (message.kind === 'object-outer-margins-query')
        return {
          ...base,
          outerMargins: o.old ? null : native(),
          reason: 'ObjectOuterMarginsUnavailable',
        };
      if (message.kind === 'object-outer-margins-set') {
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
  await editor.load(new Uint8Array([1]), { format: o.format ?? 'hwp5', editable: true });
  return {
    editor,
    calls,
    writes: () => calls.filter((c) => c.kind === 'object-outer-margins-set'),
  };
}

async function target(editor: ReturnType<typeof createEditor>) {
  const r = await editor.getObjectOuterMargins(selector);
  if (r.state !== 'available') throw Error(r.reason);
  assert.equal(r.observation.format, 'hwp5'); assert.equal(r.observation.kind, 'textbox');
  return r.target;
}
test('H5 current typed textbox target reuses public command and whole witness', async () => {
  const h = await setup();
  try {
    const t = await target(h.editor);
    const result = await h.editor.dispatchCommand(SET_OBJECT_OUTER_MARGINS_COMMAND, {target: t, margins: {...margins, left: 10}});
    assert.equal(result.status, 'committed-with-snapshot'); assert.equal(h.writes().length, 1);
    const r = h.writes()[0].request as any;
    assert.equal(r.witness.selector.kind, 'textbox'); assert.equal(r.witness.ticket.owner.hi, 1); assert.equal(r.geometry, undefined);
    const stale = await h.editor.dispatchCommand(SET_OBJECT_OUTER_MARGINS_COMMAND, {target: t, margins});
    assert.equal(stale.status, 'rejected-unapplied'); assert.equal(h.writes().length, 1);
  } finally { await h.editor.dispose(); }
});
test('H5 exact no-op keeps revision and uses Native validation once', async () => {
  const h = await setup({noOp: true});
  try {
    const r = await h.editor.dispatchCommand(SET_OBJECT_OUTER_MARGINS_COMMAND, {target: await target(h.editor), margins});
    assert.equal(r.state.nativeHistoryRevision, 0); assert.equal(h.writes().length, 1);
  } finally { await h.editor.dispose(); }
});
for (const policy of ['raw3', 'inline'] as const) test(`H5 ${policy} cannot issue public write target`, async () => {
  const h = await setup({policy});
  try {const r = await h.editor.getObjectOuterMargins(selector); assert.equal(r.state, 'unavailable'); assert.equal(h.writes().length, 0);}
  finally { await h.editor.dispose(); }
});
test('H5 foreign editor target is rejected before runtime mutation', async () => {
  const a = await setup(), b = await setup();
  try {
    const result = await b.editor.dispatchCommand(SET_OBJECT_OUTER_MARGINS_COMMAND, {target: await target(a.editor), margins});
    assert.equal(result.status, 'rejected-unapplied'); assert.equal(b.writes().length, 0);
  } finally {await a.editor.dispose(); await b.editor.dispose();}
});
