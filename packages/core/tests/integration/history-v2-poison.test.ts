import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  createEditor,
  SPLICE_TEXT_COMMAND,
  getHistoryAvailability,
  type SelectionTarget,
} from '../../src/index.ts';
import { createReaderEditorRuntime } from '../../src/runtime.ts';
const wasm = readFileSync(process.env.HWPJS_TEST_WASM!);
for (const format of ['hwp5', 'hwpx'] as const)
  test(`V2 ${format} injected poison protocol stays read-only through refresh and permits explicit recovery only`, async () => {
    const module = await WebAssembly.compile(wasm);
    let activePoison = false,
      splices = 0,
      saves = 0;
    const e = createEditor({
      runtimeFactory: () => {
        const actual = createReaderEditorRuntime({ wasmModule: module });
        let poisoned = false;
        return {
          async request(message: any, context: any) {
            const reply = await actual.request(message, context);
            if (message.kind === 'save') saves++;
            if (message.kind === 'splice') {
              splices++;
              poisoned = true;
              activePoison = true;
              // Protocol fault injection around a real Native edit, not a fake editing engine.
              return {
                ...reply,
                historyPoisoned: true,
                historyStats: undefined,
                error: 'OutOfMemory',
                applied: false,
                meta: { ...reply.meta, application: 'unknown' as const, changed: null },
              };
            }
            // Deliberately report a subsequent healthy-looking stats reply: it must not clear the same generation latch.
            if (poisoned)
              return {
                ...reply,
                historyPoisoned: false,
                historyStats: reply.historyStats
                  ? { ...reply.historyStats, poisoned: false }
                  : undefined,
              };
            return reply;
          },
          dispose: () => actual.dispose(),
        };
      },
    });
    const source = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
    );
    const target = (): SelectionTarget => {
      const row = (e.getEditorState().content as any).paragraphs.find(
        (r: any) => r.selectionOwner && r.text?.length,
      );
      return {
        ...e.getEditorState().token,
        coordinateSpace: 'display',
        format,
        owner: row.selectionOwner,
        section: row.section,
        paragraph: row.paragraph,
        startUnit: 0,
        endUnit: 0,
        affinity: 'forward',
      };
    };
    try {
      await e.load(source, { format });
      const initialGeneration = e.getEditorState().generation;
      const result = await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: target(), text: 'x' });
      expect(activePoison).toBe(true);
      expect(result.status).toBe('committed-refresh-required');
      expect(e.getEditorState().status).toBe('refresh-required');
      expect(e.getEditorState().historyRecoveryRequired).toBe(true);
      expect((e.getEditorState().capabilities as any).readOnly).toBe(true);
      expect(getHistoryAvailability(e.getEditorState()).available).toBe(false);
      const rejected = await e.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: target(),
        text: 'bad',
      });
      expect(rejected.status).toBe('rejected-unapplied');
      expect(splices).toBe(1);
      await expect(e.refresh()).rejects.toThrow('HistoryReloadRequired');
      expect(e.getEditorState().status).toBe('refresh-required');
      expect(e.getEditorState().historyRecoveryRequired).toBe(true);
      expect(e.getEditorState().nativeHistoryStats?.poisoned).toBe(false); // observed stats are not fabricated to implement the controller latch
      expect((e.getEditorState().content as any).readOnly).toBe(true);
      await expect(e.save({ allowStaleLayout: true })).rejects.toThrow('RecoverySaveRequired');
      expect(saves).toBe(0);
      const recovery = await e.save({ recovery: true, allowStaleLayout: true });
      expect(recovery.staleSnapshot).toBe(true);
      expect(recovery.bytes.length).toBeGreaterThan(0);
      expect(e.getEditorState().status).toBe('refresh-required');
      expect(saves).toBe(1);
      await e.load(source, { format });
      expect(e.getEditorState().generation).toBeGreaterThan(initialGeneration);
      expect(e.getEditorState().status).toBe('ready');
      expect(e.getEditorState().historyRecoveryRequired).toBe(false);
      expect((e.getEditorState().capabilities as any).readOnly).not.toBe(true);
    } finally {
      await e.dispose();
    }
  }, 30000);

test('V2 reader uncertainty survives stats getter OOM without fabricating Native stats', async () => {
  const module = await WebAssembly.compile(wasm);
  const original = WebAssembly.instantiate;
  const allocations: { w: any; ptr: number }[] = [];
  let injected = 0;
  (WebAssembly as any).instantiate = async (...args: any[]) => {
    const instance: any = await (original as any)(...args);
    const w = instance.exports;
    if (!w) return instance;
    const exports: any = { ...w };
    let fault = false,
      failedStats = false,
      message = '';
    const ptr = w.cfb_alloc(256);
    allocations.push({ w, ptr });
    const fail = (text: string) => {
      message = text;
      return 0;
    };
    for (const key of Object.keys(w))
      if (key.startsWith('hwpx_edit_splice'))
        exports[key] = (...values: any[]) => {
          const result = w[key](...values);
          if (result === 1 && !fault) {
            fault = true;
            injected++;
            return fail('MutationUncertain');
          }
          return result;
        };
    exports.hwpx_edit_history_stats = () => {
      if (fault && !failedStats) {
        failedStats = true;
        return fail('OutOfMemory');
      }
      return w.hwpx_edit_history_stats();
    };
    exports.cfb_error_ptr = () => {
      if (!message) return w.cfb_error_ptr();
      new Uint8Array(w.memory.buffer, ptr, 256).set(new TextEncoder().encode(message));
      return ptr;
    };
    exports.cfb_error_len = () =>
      message ? new TextEncoder().encode(message).length : w.cfb_error_len();
    return { exports };
  };
  const e = createEditor({
    runtimeFactory: () => createReaderEditorRuntime({ wasmModule: module }),
  });
  try {
    const bytes = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx');
    await e.load(bytes, { format: 'hwpx' });
    const row = (e.getEditorState().content as any).paragraphs.find(
      (r: any) => r.editable !== false && r.selectionOwner && r.text?.length,
    );
    const target: SelectionTarget = {
      ...e.getEditorState().token,
      coordinateSpace: 'display',
      format: 'hwpx',
      owner: row.selectionOwner,
      section: row.section,
      paragraph: row.paragraph,
      startUnit: 0,
      endUnit: 0,
      affinity: 'forward',
    };
    const result = await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: 'x' });
    expect(injected).toBe(1);
    expect(result.error).toBe('OutOfMemory');
    expect(result.reply?.meta?.application).toBe('unknown');
    expect(result.reply?.historyPoisoned).toBe(true);
    expect(result.status).toBe('committed-refresh-required');
    expect(e.getEditorState().historyRecoveryRequired).toBe(true);
    await expect(e.refresh()).rejects.toThrow('HistoryReloadRequired');
    expect(e.getEditorState().nativeHistoryStats?.poisoned).toBe(false);
    expect(e.getEditorState().historyRecoveryRequired).toBe(true);
    const generation = e.getEditorState().generation;
    await e.load(bytes, { format: 'hwpx' });
    expect(e.getEditorState().generation).toBeGreaterThan(generation);
    expect(e.getEditorState().historyRecoveryRequired).toBe(false);
  } finally {
    try {
      await e.dispose();
    } finally {
      (WebAssembly as any).instantiate = original;
      for (const { w, ptr } of allocations) w.cfb_free(ptr, 256);
    }
  }
}, 30000);
