//! Actual Native Core gate. Requires an explicitly granted, registered normal WASM; no fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createEditor,
  SET_OBJECT_GEOMETRY_COMMAND,
  type HeadlessEditor,
  type ObjectGeometrySelector,
} from '../../src/index.ts';
import { createReaderRuntimeFactory, createWasmModuleLoader } from '../../src/runtime.ts';
assert(process.env.HWPJS_TEST_WASM, 'ExplicitNativeInputRequired');
const wasmBytes = new Uint8Array(await readFile(process.env.HWPJS_TEST_WASM));
assert(process.env.HWPJS_TEST_WASM_SHA256, 'ExplicitNormalNativeHashRequired');
assert.equal(
  createHash('sha256').update(wasmBytes).digest('hex'),
  process.env.HWPJS_TEST_WASM_SHA256,
);
// Transport the actual artifact bytes through the public loader. A filename or
// environment value never registers a profile; only the measured registry does.
const loadWasmModule = createWasmModuleLoader({
  url: `data:application/wasm;base64,${Buffer.from(wasmBytes).toString('base64')}`,
});
const make = () => createEditor({ runtimeFactory: createReaderRuntimeFactory({ loadWasmModule }) });
function selector(editor: HeadlessEditor, kind: 'chart' | 'drawing'): ObjectGeometrySelector {
  const content = editor.getEditorState().content as any;
  const rows = kind === 'chart' ? content.chartTargets : content.drawings;
  assert(Array.isArray(rows) && rows.length === 1, 'ExactSingleFixtureOwnerRequired');
  return {
    kind,
    section: rows[0].section,
    node: kind === 'chart' ? rows[0].wrapper : rows[0].drawingNode,
  };
}
for (const [format, kind, fixture] of [
  ['hwpx', 'chart', 'chart-data-edit.hwpx'],
  ['hwpx', 'drawing', 'textbox.hwpx'],
  ['hwp5', 'drawing', 'textbox.hwp'],
] as const) {
  test(`actual Native ${format} ${kind} typed geometry one transaction save undo redo reopen`, async () => {
    const input = new Uint8Array(
      await readFile(
        new URL('../../../../apps/docs/docs/public/editor/fixtures/' + fixture, import.meta.url),
      ),
    );
    const e = make();
    let reopened: HeadlessEditor | undefined;
    try {
      await e.load(input, { format, editable: true });
      // Saving publishes a new Core state; issue the current owner target afterwards.
      const before = (await e.save()).bytes;
      const read = await e.getObjectGeometry(selector(e, kind));
      assert.equal(read.state, 'available');
      if (read.state !== 'available') throw Error('ExpectedNativeGeometry');
      assert(read.observation.editable.size && read.observation.editable.position);
      const revision = e.getEditorState().nativeHistoryRevision!;
      const saveOptions = format === 'hwp5' ? { allowStaleLayout: true } : {};
      const patch = {
        width: 20000,
        height: 12000,
        horizontalOffset: -500,
        verticalOffset: 300,
        treatAsCharacter: false,
      };
      const result = await e.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, {
        target: read.target,
        patch,
      });
      assert.equal(result.status, 'committed-with-snapshot');
      assert.equal(e.getEditorState().nativeHistoryRevision, revision + 1);
      const current = await e.getObjectGeometry(selector(e, kind));
      assert.equal(current.state, 'available');
      if (current.state !== 'available') throw Error('MissingCurrentGeometry');
      assert.deepEqual(current.observation.frame, { ...read.observation.frame, ...patch });
      if (format === 'hwp5') {
        const beforeRefusal = e.getEditorState().nativeHistoryRevision;
        await assert.rejects(e.save(), /LayoutReflowRequired/);
        assert.equal(e.getEditorState().nativeHistoryRevision, beforeRefusal);
      }
      // Explicitly exercise the existing per-document H5 layout-consent contract.
      const savedResult = await e.save(saveOptions);
      if (format === 'hwp5') assert.equal(savedResult.layoutRequiresReflow, true);
      const saved = savedResult.bytes;
      assert.equal(
        (await e.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, { target: read.target, patch }))
          .status,
        'rejected-unapplied',
      );
      await e.undo(e.getEditorState().token);
      assert.deepEqual((await e.save(saveOptions)).bytes, before);
      await e.redo(e.getEditorState().token);
      assert.deepEqual((await e.save(saveOptions)).bytes, saved);
      reopened = make();
      await reopened.load(saved, { format, editable: true });
      const restored = await reopened.getObjectGeometry(selector(reopened, kind));
      assert.equal(restored.state, 'available');
      if (restored.state !== 'available') throw Error('MissingReopenedGeometry');
      assert.deepEqual(restored.observation.frame, current.observation.frame);
    } finally {
      await e.dispose();
      await reopened?.dispose();
    }
  });
}
