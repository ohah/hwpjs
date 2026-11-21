// Actual Core/UI source with a private synthetic Native transport. Not compiled SDK/Native evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../../packages/core/src/editor/create-editor.ts';
import { bindRuntimeAdmission } from '../../../packages/core/src/internal/runtime-admission.ts';
import { createObjectOuterMarginsForm } from '../src/object-outer-margins-form.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { Document, all } from './fake-dom.mjs';
import { createObjectPropertiesTool } from '../src/object-properties-tool.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = () => new Promise((r) => setImmediate(r));
async function fixture(kind, options = {}) {
  let revision = 0,
    closed = false;
  const calls = [],
    margins = {
      left: options.vertical ? -32768 : options.negative ? -1 : 0,
      right: options.vertical ? -1 : 1,
      top: 2,
      bottom: 3,
    };
  const node = kind === 'picture' ? 11 : 12;
  const format = options.format ?? 'hwp5';
  const content = () => ({
    format,
    readOnly: !!options.readOnly,
    limited: false,
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
    pictures: [
      {
        section: 0,
        pictureNode: 10,
        recordNode: 11,
        source: { component_node: 10, picture_node: 11 },
        sizeProtected: true,
      },
    ],
  });
  const native = () =>
    format === 'hwpx'
      ? {
          geometry: {
            format: 'hwpx',
            selector: { kind: 'drawing', section: 0, node },
            owner: {
              ownerNode: node,
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
          margins,
        }
      : {
          schemaVersion: 1,
          format: 'hwp5',
          selector: { kind, section: 0, node },
          owner: {
            control_node: 8,
            component_node: options.vertical && kind === 'picture' ? 10 : 12,
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
          editable: !options.locked,
          reason: options.locked ? 'OuterMarginsReadOnly' : null,
          wrapOrdinal: 0,
          inline: false,
          ownerScope: 'h5-margins:12345678-1234-4123-8123-123456789abc',
        };
  const runtime = {
    async request(message, context) {
      calls.push(message);
      const base = {
        kind: message.kind,
        historyRevision: revision,
        historyStats: {
          protocolVersion: 2,
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
          outerMargins: options.old
            ? null
            : options.vertical
              ? {
                  ...native(),
                  editable: false,
                  reason: 'OuterMarginsTopBottomFollowUpRequired',
                  wrapOrdinal: 1,
                }
              : native(),
          reason: 'ObjectOuterMarginsUnavailable',
        };
      if (message.kind === 'hwp5-vertical-object-margins-query')
        return {
          ...base,
          verticalMargins: {
            schemaVersion: 1,
            profile: 'hwp5-observed-vertical-outer-margins-v1',
            witness: {
              ...native(),
              wrapOrdinal: 1,
              ownerScope: 'h5-vertical-margins:12345678-1234-4123-8123-123456789abc',
            },
          },
        };
      if (
        message.kind === 'object-outer-margins-set' ||
        message.kind === 'hwp5-vertical-object-margins-set'
      ) {
        if (options.noOp) return { ...base, changed: false, applied: false };
        revision++;
        return {
          ...base,
          historyRevision: revision,
          content: content(),
          changed: true,
          applied: true,
          meta: { context, application: 'applied', changed: true },
        };
      }
      return { ...base, content: content() };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime,
    async (message, context, admit) => {
      admit();
      return runtime.request(message, context);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  await editor.load(new Uint8Array([1]), { format, editable: true });
  const doc = new Document(),
    root = doc.createElement('main'),
    footer = doc.createElement('footer');
  let current = true,
    done = 0;
  const form = createObjectOuterMarginsForm(
    root,
    footer,
    editor,
    { kind, section: 0, node },
    () => current,
    createObjectPropertiesEditGate(),
    () => done++,
  );
  await tick();
  const role = (name) =>
    all(root, (n) => n.dataset.role === name)[0] ?? all(footer, (n) => n.dataset.role === name)[0];
  const input = (value) => {
    role('object-outer-margins-left').value = value;
    role('object-outer-margins-left').dispatchEvent(new Event('input'));
  };
  const apply = () => role('object-outer-margins-apply').dispatchEvent(new Event('click'));
  return {
    editor,
    form,
    calls,
    role,
    input,
    apply,
    node,
    done: () => done,
    writes: () => calls.filter((x) => x.kind === 'object-outer-margins-set'),
    async dispose() {
      current = false;
      form.dispose();
      await editor.dispose();
    },
  };
}
for (const kind of ['picture', 'textbox'])
  test(
    'H5 ' +
      kind +
      ' form uses actual typed Core opaque target and one Native request/history revision',
    async () => {
      const f = await fixture(kind);
      try {
        assert.equal(f.role('object-outer-margins-left').disabled, false);
        f.input('1');
        f.apply();
        await tick();
        assert.equal(f.writes().length, 1);
        const r = f.writes()[0].request;
        assert.deepEqual(r.witness.selector, { kind, section: 0, node: f.node });
        assert.equal(r.schemaVersion, 1);
        assert.deepEqual(r.witness.owner.source_sha256, Array(32).fill(1));
        assert.deepEqual(r.witness.ticket.document, { lo: 1, hi: 1 });
        assert.deepEqual(r.margins, { left: 283, right: 1, top: 2, bottom: 3 });
        assert.equal(f.editor.getEditorState().nativeHistoryRevision, 1);
        assert.equal(
          f.calls.some(
            (x) =>
              x.kind === 'picture-resize' ||
              x.kind === 'replace-picture' ||
              x.kind === 'object-geometry-set',
          ),
          false,
        );
        assert.equal(f.done(), 1);
      } finally {
        await f.dispose();
      }
    },
  );
test('H5 stale selection state is refused before Native margin write', async () => {
  const f = await fixture('picture');
  try {
    await f.editor.setSelection(null);
    f.input('1');
    f.apply();
    await tick();
    assert.equal(f.writes().length, 0);
    assert.equal(f.role('object-outer-margins-apply').disabled, true);
  } finally {
    await f.dispose();
  }
});
for (const options of [{ old: true }, { locked: true }, { readOnly: true }])
  test('H5 Core unavailable/protection remains disabled ' + JSON.stringify(options), async () => {
    const f = await fixture('textbox', options);
    try {
      assert.equal(f.role('object-outer-margins-left').value, '');
      assert.equal(f.role('object-outer-margins-apply').disabled, true);
      f.apply();
      await tick();
      assert.equal(f.writes().length, 0);
      assert.equal(f.done(), 0);
    } finally {
      await f.dispose();
    }
  });
test('unchanged H5 margins still reach Native no-op validation without a history increment', async () => {
  const f = await fixture('textbox', { noOp: true });
  try {
    f.apply();
    await tick();
    assert.equal(f.writes().length, 1);
    assert.equal(f.editor.getEditorState().nativeHistoryRevision, 0);
    assert.equal(f.done(), 1);
  } finally {
    await f.dispose();
  }
});
test('negative observed one-unit sign is visible and must be explicitly corrected before new writes', async () => {
  const f = await fixture('picture', { negative: true });
  try {
    assert.equal(f.role('object-outer-margins-left').value, '-0.004');
    assert.equal(f.role('object-outer-margins-apply').disabled, true);
    f.apply();
    await tick();
    assert.equal(f.writes().length, 0);
    f.input('0');
    assert.equal(f.role('object-outer-margins-apply').disabled, false);
    f.apply();
    await tick();
    assert.equal(f.writes().length, 1);
    assert.equal(f.writes()[0].request.margins.left, 0);
  } finally {
    await f.dispose();
  }
});

test('real picture property tool routes size-protected selection to typed margin-only fallback without resize authority', async () => {
  const f = await fixture('picture'),
    dom = documentFixture();
  f.form.dispose();
  f.calls.length = 0;
  const state = f.editor.getEditorState();
  const host = {
    capturePictureReplacementSelection: () => ({
      section: 0,
      pictureNode: 11,
      current: () => f.editor.getEditorState() === state,
    }),
  };
  const tool = createObjectPropertiesTool({
    root: dom.root,
    editor: f.editor,
    host: () => host,
    onStatus() {},
    onClose() {},
  });
  try {
    tool.open();
    await tick();
    assert.equal(dom.role('object-width'), undefined);
    assert(dom.role('object-outer-margins'));
    const left = dom.role('object-outer-margins-left');
    left.value = '1';
    fire(left, 'input');
    fire(dom.role('object-outer-margins-apply'), 'click');
    await tick();
    assert.equal(f.writes().length, 1);
    assert.deepEqual(f.writes()[0].request.witness.selector, {
      kind: 'picture',
      section: 0,
      node: 11,
    });
    assert.equal(
      f.calls.some((x) => x.kind === 'picture-resize' || x.kind === 'picture-replace'),
      false,
    );
    assert.equal(dom.role('object-outer-margins'), undefined);
  } finally {
    tool.dispose();
    await f.dispose();
  }
});

test('explicit HWPX alias keeps geometry-only margin wire and reaches exact750 via the same public Core command', async () => {
  const f = await fixture('drawing', { format: 'hwpx' });
  try {
    assert.equal(f.role('object-outer-margins-left').disabled, false);
    f.input('2.646');
    f.apply();
    await tick();
    assert.equal(f.writes().length, 1);
    const request = f.writes()[0].request;
    assert.equal(request.margins.left, 750);
    assert.deepEqual(request.expectedMargins, { left: 0, right: 1, top: 2, bottom: 3 });
    assert.deepEqual(request.geometry.selector, { kind: 'drawing', section: 0, node: 12 });
    assert.deepEqual(request.geometry.patch, {});
    assert.equal('witness' in request, false);
    assert.equal(f.editor.getEditorState().nativeHistoryRevision, 1);
  } finally {
    await f.dispose();
  }
});
for (const kind of ['picture', 'textbox'])
  test(
    'H5 ' + kind + ' three-decimal fields deliver exact750/1500 through one typed Core request',
    async () => {
      const f = await fixture(kind);
      try {
        f.input('2.646');
        const right = f.role('object-outer-margins-right');
        right.value = '5.292';
        right.dispatchEvent(new Event('input'));
        f.apply();
        await tick();
        assert.equal(f.writes().length, 1);
        const request = f.writes()[0].request;
        assert.deepEqual(request.witness.selector, { kind, section: 0, node: f.node });
        assert.deepEqual(request.margins, { left: 750, right: 1500, top: 2, bottom: 3 });
        assert.equal(f.editor.getEditorState().nativeHistoryRevision, 1);
      } finally {
        await f.dispose();
      }
    },
  );

for (const kind of ['picture', 'textbox'])
  test(
    'raw1 ' +
      kind +
      ' form uses the real Core vertical target and preserves signed horizontal witness',
    async () => {
      const f = await fixture(kind, { vertical: true });
      try {
        assert.equal(f.role('object-outer-margins-left').disabled, true);
        assert.equal(f.role('object-outer-margins-right').value, '-0.004');
        assert.equal(f.role('object-outer-margins-top').disabled, false);
        f.role('object-outer-margins-top').value = '2.646';
        f.role('object-outer-margins-top').dispatchEvent(new Event('input'));
        f.role('object-outer-margins-bottom').value = '5.292';
        f.role('object-outer-margins-bottom').dispatchEvent(new Event('input'));
        f.apply();
        await tick();
        const writes = f.calls.filter((x) => x.kind === 'hwp5-vertical-object-margins-set');
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].request.witness.margins, {
          left: -32768,
          right: -1,
          top: 2,
          bottom: 3,
        });
        assert.deepEqual(writes[0].request.witness.selector, { kind, section: 0, node: f.node });
        assert.equal(writes[0].request.witness.owner.component_node, kind === 'picture' ? 10 : 12);
        assert.equal(writes[0].request.top, 750);
        assert.equal(writes[0].request.bottom, 1500);
        assert.equal('left' in writes[0].request, false);
        assert.equal('right' in writes[0].request, false);
        assert.equal(f.writes().length, 0);
        assert.equal(f.editor.getEditorState().nativeHistoryRevision, 1);
        assert.equal(f.done(), 1);
      } finally {
        await f.dispose();
      }
    },
  );
