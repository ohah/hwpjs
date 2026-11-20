import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readonlyWasmFixture } from '../helpers/hwp5-readonly-wasm-fixture.mjs';
// Only module qualification is controlled. SDK/Runtime/Core admission, read
// provenance, publication and transport are real source modules. No actual Native.
const adapterURL = new URL('../../packages/core/src/runtime/reader-runtime.ts', import.meta.url)
  .href;
const permitURL = new URL(
  '../../packages/vanilla/src/document-text-read-permit.ts',
  import.meta.url,
).href;
const shim =
  'data:text/javascript,' +
  encodeURIComponent(
    `export function readKnownNativeModule(){return Object.freeze({contract:'hwp5-exclusive-text-delta-v1',sha256:'${'a'.repeat(64)}'});}`,
  );
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === adapterURL && specifier === '../wasm-module-loader.ts')
      return { url: shim, shortCircuit: true };
    if (context.parentURL === permitURL && specifier === '@hwpjs/core/_internal/native-read-source')
      return {
        url: new URL('../../packages/core/src/_internal/native-read-source.ts', import.meta.url)
          .href,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
after(() => hook.deregister());
const { createEditor } = await import('../../packages/core/src/editor/create-editor.ts');
const { createReaderEditorRuntime } =
  await import('../../packages/core/src/runtime/reader-runtime.ts');
const { findDocumentTextMatch } =
  await import('../../packages/core/src/state/document-text-search.ts');
const { createParagraphSelection } =
  await import('../../packages/core/src/state/paragraph-selection.ts');
const { createDocumentTextReadPermit } =
  await import('../../packages/vanilla/src/document-text-read-permit.ts');
const { readNativeReadSourceEvidence } =
  await import('../../packages/core/src/internal/native-read-source-evidence.ts');
const { readNativeGeometryEvidence } =
  await import('../../packages/core/src/internal/native-geometry-evidence.ts');
async function harness(t) {
  const native = readonlyWasmFixture(t),
    editor = createEditor({
      runtimeFactory: () => createReaderEditorRuntime({ wasmModule: native.module }),
    });
  await editor.load(new Uint8Array([1]), { format: 'hwp5', editable: false });
  const lease = editor.acquireInputSurface({
    commitComposition: () => 'unchanged',
    cancelComposition: () => {},
  });
  return {
    editor,
    lease,
    native,
    async close() {
      lease.release();
      await editor.dispose();
    },
  };
}
test('readonly public SDK through real Runtime/Core publishes independent read frame and Native-resolved selection', async (t) => {
  const h = await harness(t);
  try {
    const state = h.editor.getEditorState();
    assert.equal(state.nativeHistoryRevision, undefined);
    assert.equal(state.content.readOnly, true);
    assert.match(readNativeReadSourceEvidence(state).session, /^v-s/);
    assert.equal(readNativeGeometryEvidence(state), undefined);
    const index = await h.editor.getDocumentTextSnapshot(),
      match = findDocumentTextMatch(index, '나');
    assert(match);
    const observation = await h.editor.getDocumentTextSelection(index, match);
    assert.equal(observation.native.binding.revision, null);
    assert.equal(observation.native.target.paragraph, 0);
    const inverse = await h.editor.getDocumentTextAnchor(index, {
      kind: 'paragraph',
      section: 0,
      paragraph: 0,
      unit: 1,
      beforeText: '가나다',
    });
    assert.equal(inverse.ref, match.ref);
    const permit = createDocumentTextReadPermit({
      state: () => h.editor.getEditorState(),
      active: () => h.lease.isActive(),
      ready: () => true,
      row: () => h.editor.getEditorState().content.paragraphs[0],
      geometry: () => true,
    });
    const token = permit.issue(observation, () => true);
    assert(token);
    await h.editor.setSelection(
      createParagraphSelection(state, { section: 0, paragraph: 0, startUnit: 1, endUnit: 2 }),
    );
    assert.equal(
      permit.current(token, {
        section: 0,
        paragraph: 0,
        startUnit: 1,
        endUnit: 2,
        expectedText: '가나다',
      }),
      true,
    );
    assert.equal(h.editor.getEditorState().content.readOnly, true);
    assert.equal(h.native.counts().writeCalls, 0);
    const rejected = await h.lease.request(
      { kind: 'splice', section: 0, paragraph: 0, startUnit: 1, endUnit: 2, text: 'X' },
      { coordinates: 'legacy-native', token: h.editor.getEditorState().token },
    );
    assert(rejected.error);
    assert.equal(h.native.counts().writeCalls, 0);
    permit.dispose();
    assert.equal(permit.current(token), false);
  } finally {
    await h.close();
  }
  assert(h.native.counts().readCloses > 0);
  assert.equal(h.native.counts().writer, 0);
});
test('readonly reveal and refresh reach the actual retained reader and retire the prior Core read selection frame', async (t) => {
  const h = await harness(t);
  try {
    const index = await h.editor.getDocumentTextSnapshot(),
      match = findDocumentTextMatch(index, '나');
    assert(match);
    const old = await h.editor.getDocumentTextSelection(index, match),
      before = h.editor.getEditorState();
    const request = {
      schemaVersion: 1,
      scope: 'native-document-text-selection',
      binding: match.binding,
      readBinding: old.native.readBinding,
      ref: match.ref,
      startUnit: match.startUnit,
      endUnit: match.endUnit,
      expectedOriginal: match.expectedOriginal,
    };
    const result = await h.lease.request(
      { kind: 'reveal-document-text', request },
      { coordinates: 'legacy-native', token: before.token },
    );
    assert.equal(result.error, undefined);
    const after = h.editor.getEditorState();
    assert(after.viewRevision > before.viewRevision);
    assert.equal(after.content.paragraphs[0].selectable, true);
    assert.equal(after.content.paragraphs[0].editable, false);
    assert.match(readNativeReadSourceEvidence(after).session, /^v-s/);
    const permit = createDocumentTextReadPermit({
      state: () => after,
      active: () => true,
      ready: () => true,
      row: () => after.content.paragraphs[0],
      geometry: () => true,
    });
    assert.equal(
      permit.issue(old, () => true),
      null,
    );
    permit.dispose();
    const refreshed = await h.lease.request(
      { kind: 'refresh-document-text-view' },
      { coordinates: 'legacy-native', token: after.token },
    );
    assert.equal(refreshed.error, undefined);
    assert.equal(h.native.counts().writer, 0);
  } finally {
    await h.close();
  }
});
