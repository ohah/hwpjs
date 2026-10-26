import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createEditor, SPLICE_TEXT_COMMAND, getHistoryAvailability } from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime.ts';
const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
for (const format of ['hwp5', 'hwpx'] as const)
  test(`real ${format} explicit V1 history availability follows branch, 16-step eviction, no-op, and reload`, async () => {
    const factory = createReaderRuntimeFactory({ wasmModule: await WebAssembly.compile(wasm) });
    const editor = createEditor({ runtimeFactory: factory });
    const bytes = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
    );
    const availability = (undo: boolean, redo: boolean) =>
      expect(getHistoryAvailability(editor.getEditorState())).toEqual({
        available: true,
        canUndo: undo,
        canRedo: redo,
      });
    const splice = async () => {
      const row = (editor.getEditorState().content as any).paragraphs.find(
        (r: any) => r.editable !== false && r.text?.length && r.selectionOwner,
      );
      expect(row).toBeTruthy();
      const target = {
        ...editor.getEditorState().token,
        coordinateSpace: 'display' as const,
        format,
        owner: row.selectionOwner,
        section: row.section,
        paragraph: row.paragraph,
        startUnit: 0,
        endUnit: 0,
        affinity: 'forward' as const,
      };
      expect(
        (
          await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
            target: { ...target, endUnit: target.startUnit },
            text: '검증',
          })
        ).status,
      ).toBe('committed-with-snapshot');
    };
    try {
      await editor.load(bytes, { format, history: { mode: 'legacy-v1', maxEntries: 16 } });
      availability(false, false);
      await splice();
      availability(true, false);
      await editor.undo();
      availability(false, true);
      await editor.redo();
      availability(true, false);
      await editor.undo();
      await splice();
      availability(true, false);
      for (let i = 0; i < 20; i++) await splice();
      for (let i = 0; i < 16; i++) expect((await editor.undo()).error).toBeUndefined();
      availability(false, true);
      expect(editor.getEditorState().nativeHistoryRevision).toBeGreaterThan(0);
      expect((await editor.undo()).status).toBe('known-no-op');
      availability(false, true);
      await editor.redo();
      availability(true, true);
      await splice();
      availability(true, false);
      await editor.load(bytes, { format, history: { mode: 'legacy-v1', maxEntries: 16 } });
      availability(false, false);
    } finally {
      await editor.dispose();
    }
  }, 30000);
