import { test, expect } from 'bun:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  createEditor,
  SPLICE_TEXT_COMMAND,
  getHistoryAvailability,
  type SelectionTarget,
} from '../../src/index.ts';
import { createReaderRuntimeFactory, createWorkerRuntimeFactory } from '../../src/runtime.ts';
const wasm = readFileSync(process.env.HWPJS_TEST_WASM!);
// Output path is supplied by the artifact runner, never a product filesystem dependency.
const out = process.env.HISTORY_V2_EVIDENCE_DIR!;
mkdirSync(out, { recursive: true });
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
for (const file of ['charshape.hwp', 'parashape.hwp', 'charshape.hwpx', 'parashape.hwpx'])
  test(`Native V2 default ${file}: 100 individual inputs and undo restore source bytes and caret`, async () => {
    const format = file.endsWith('.hwpx') ? 'hwpx' : 'hwp5';
    const module = await WebAssembly.compile(wasm);
    const factory =
      process.env.HISTORY_V2_TRANSPORT === 'worker'
        ? createWorkerRuntimeFactory({
            wasmModule: module,
            workerURL: new URL('../../src/worker.ts', import.meta.url),
          })
        : createReaderRuntimeFactory({ wasmModule: module });
    const e = createEditor({ runtimeFactory: factory });
    const source = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${file}`);
    try {
      await e.load(source, { format });
      expect(e.getEditorState().nativeHistoryStats?.protocolVersion).toBe(2);
      expect(e.getEditorState().nativeHistoryStats?.negotiation).toBe('native-default-v2');
      expect(e.getEditorState().nativeHistoryStats?.resolved.maxEntries).toBe(256);
      const row = (e.getEditorState().content as any).paragraphs.find(
        (r: any) => r.editable !== false && r.text?.length && r.selectionOwner && !r.clipped,
      );
      expect(row).toBeDefined();
      const target = (at: number): SelectionTarget => ({
        ...e.getEditorState().token,
        coordinateSpace: 'display',
        format,
        owner: row.selectionOwner,
        section: row.section,
        paragraph: row.paragraph,
        startUnit: at,
        endUnit: at,
        affinity: 'forward',
      });
      await e.setSelection(target(0));
      const before = Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
      expect(before).toEqual(source);
      for (let i = 0; i < 100; i++) {
        expect((e.getEditorState().selection as SelectionTarget).startUnit).toBe(i);
        const result = await e.dispatchCommand(SPLICE_TEXT_COMMAND, {
          target: e.getEditorState().selection as SelectionTarget,
          text: 'x',
        });
        expect(result.status).toBe('committed-with-snapshot');
        expect(e.getEditorState().nativeHistoryRevision).toBe(i + 1);
        await e.setSelection(target(i + 1));
      }
      const edited = Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
      const stats = e.getEditorState().nativeHistoryStats!;
      expect(stats.undoCount).toBe(100);
      expect(stats.oldestAvailableRevision).toBe(0);
      expect(stats.retainedBytes).toBe(
        stats.metadataOwnedBytes! +
          stats.currentOwnedBytes! +
          stats.undoOwnedBytes! +
          stats.redoOwnedBytes!,
      );
      for (let i = 0; i < 100; i++) {
        expect((await e.undo()).status).toBe('committed-with-snapshot');
        expect(e.getEditorState().nativeHistoryRevision).toBe(99 - i);
        expect((e.getEditorState().selection as SelectionTarget).startUnit).toBe(99 - i);
      }
      expect(getHistoryAvailability(e.getEditorState())).toEqual({
        available: true,
        canUndo: false,
        canRedo: true,
      });
      const restored = Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
      expect(restored).toEqual(source);
      const currentStats = e.getEditorState().nativeHistoryStats!;
      expect(currentStats.redoCount).toBe(100);
      expect(currentStats.undoCount).toBe(0);
      writeFileSync(`${out}/${file}-edited`, edited);
      writeFileSync(`${out}/${file}-restored`, restored);
      writeFileSync(
        `${out}/${file}.json`,
        JSON.stringify(
          {
            file,
            format,
            section: row.section,
            paragraph: row.paragraph,
            sourceOffsets: row.sourceOffsets,
            owner: row.selectionOwner,
            inputSteps: 100,
            undoSteps: 100,
            caretStart: 0,
            caretRestored: (e.getEditorState().selection as SelectionTarget).startUnit,
            sourceSHA: hash(source),
            editedSHA: hash(edited),
            restoredSHA: hash(restored),
            stats,
            restoredStats: currentStats,
            scope:
              process.env.HISTORY_V2_TRANSPORT === 'worker'
                ? 'public createEditor plus actual Bun Worker; not browser'
                : 'public createEditor plus direct reader runtime; not Worker or browser',
          },
          null,
          2,
        ) + '\n',
      );
    } finally {
      await e.dispose();
    }
  }, 120000);
