// Actual ReaderRuntime + explicit WASM/Noori pins. No browser or UI E2E claim.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  module,
  fixture,
  targets,
  owner,
  hash,
  wasmSha256,
} from './table-appearance-native-context.mjs';
import { verifyCellDiagonalSaved } from './cell-diagonal-save-oracle.mjs';
import { createReaderRuntime } from '../../web/preview/reader-runtime.mjs';
import { observeTableCellAppearance } from '../../js/table-cell-appearance-observation.mjs';

const evidence = resolve(
  'zig-out/verification/table-diagonal-r1/render/runtime-integration',
  `run-${process.pid}-${Date.now()}`,
);
mkdirSync(evidence, { recursive: true });
const runtimeSourceSHA256 = hash(
  readFileSync(new URL('../../web/preview/reader-runtime.mjs', import.meta.url)),
);
const history = { maxEntries: 12, maxCheckpointBytes: 8 * 1024 * 1024 };

for (const format of ['hwp5', 'hwpx']) {
  test(
    `${format} actual ReaderRuntime forwards diagonal v2, saves independently verified bytes and preserves undo/redo through optional-array noops`,
    { timeout: 115000 },
    async () => {
      const receipt = {
        format,
        wasmSha256,
        runtimeSourceSHA256,
        evidenceClass:
          'actual DOM-free ReaderRuntime/Native WASM; not Worker transport, browser or UI E2E',
        status: 'running',
        phases: [],
      };
      const input = fixture(format);
      let runtime;
      const request = async (message) => {
        const result = await runtime.request(message);
        assert.equal(result.error, undefined, `${format} ${message.kind}: ${result.error}`);
        assert.equal(result.kind, message.kind);
        return result;
      };
      const save = async () => {
        const result = await request({ kind: 'save', allowStaleLayout: true });
        assert.ok(result.bytes instanceof Uint8Array && result.bytes.length > 512);
        return Buffer.from(result.bytes);
      };
      const open = async (bytes) => {
        runtime = createReaderRuntime({ wasmModule: module });
        await request({ kind: 'load', format, bytes: Uint8Array.from(bytes) });
        const enabled = await request({ kind: 'enable', history });
        assert.equal(enabled.cellDiagonalAvailable, true);
        assert.equal(enabled.cellStyleBatchAvailable, true);
        assert.equal(typeof enabled.historyRevision, 'number');
        return enabled;
      };
      const verifyReadback = (content, diagonals) => {
        for (const row of diagonals) {
          const observed = observeTableCellAppearance(content, owner(row));
          assert.equal(
            observed.diagonal.directions,
            row.directions,
            JSON.stringify(observed.diagonal),
          );
          assert.equal(observed.diagonal.stroke.style, row.style);
          assert.equal(observed.diagonal.stroke.width, row.width);
          assert.equal(
            observed.diagonal.stroke.color,
            '#' + row.color.toString(16).padStart(6, '0'),
          );
        }
      };
      const baselineEdits = targets[format].slice(0, 1).map((target, i) => ({
        ...owner(target),
        directions: i === 0 ? 'rising' : 'falling',
        style: 'SOLID',
        width: i === 0 ? 50 : 70,
        color: i === 0 ? 0x123456 : 0x2973a1,
      }));
      let expected = structuredClone(baselineEdits);
      const verifySaved = (bytes, phase) => {
        writeFileSync(
          join(evidence, `${format}-${phase}.${format === 'hwp5' ? 'hwp' : 'hwpx'}`),
          bytes,
        );
        const edits = expected.map((diagonal, i) => ({ target: targets[format][i], diagonal }));
        const independent = verifyCellDiagonalSaved({ format, before: input, after: bytes, edits });
        const wrong = structuredClone(edits);
        wrong[0].diagonal.color ^= 1;
        assert.throws(
          () => verifyCellDiagonalSaved({ format, before: input, after: bytes, edits: wrong }),
          'independent oracle rejects wrong diagonal color',
        );
        receipt.phases.push({ phase, independent, savedSHA256: hash(bytes) });
      };
      try {
        const enabled = await open(input),
          original = await save();
        const initialRevision = enabled.historyRevision;
        const message = { kind: 'cell-styles', borders: [], fills: [], diagonals: baselineEdits };
        const changed = await request(message);
        assert.notEqual(
          changed.historyRevision,
          initialRevision,
          'diagonals must reach Native rather than an empty legacy batch',
        );
        assert.equal(changed.historyRevisions.length, 2, 'the diagonal batch is one history event');
        verifyReadback(changed.content, expected);
        const first = await save();
        verifySaved(first, 'diagonal-batch');
        const noop = await request(message);
        assert.equal(noop.historyRevision, changed.historyRevision);
        assert.deepEqual(noop.historyRevisions, changed.historyRevisions);
        assert.deepEqual(await save(), first);

        // Sparse color never adds a direction edit, and all other source scalars survive.
        const sparse = await request({
          kind: 'cell-styles',
          borders: [],
          fills: [],
          diagonals: [{ ...owner(expected[0]), color: 0 }],
        });
        expected[0].color = 0;
        assert.equal(sparse.historyRevisions.length, 3);
        verifyReadback(sparse.content, expected);
        const second = await save();
        verifySaved(second, 'sparse-color-preserves-geometry');
        const undone = await request({ kind: 'undo' });
        assert.equal(undone.changed, true);
        assert.deepEqual(await save(), first);
        const redone = await request({ kind: 'redo' });
        assert.equal(redone.changed, true);
        assert.deepEqual(await save(), second);

        // Optional absence and present [] are both real protocol noops and must retain redo.
        for (const empty of [
          { kind: 'cell-styles', borders: [], fills: [] },
          { kind: 'cell-styles', borders: [], fills: [], diagonals: [] },
        ]) {
          const beforeEmpty = await request({ kind: 'undo' });
          assert.equal(beforeEmpty.changed, true);
          assert.deepEqual(
            beforeEmpty.historyRevisions,
            [changed.historyRevision, initialRevision, sparse.historyRevision],
            'Native enumeration is current, undo checkpoints, then redo checkpoints',
          );
          assert.deepEqual(await save(), first);
          const result = await request(empty);
          assert.equal(result.historyRevision, changed.historyRevision);
          assert.deepEqual(
            result.historyRevisions,
            beforeEmpty.historyRevisions,
            'no-op retains the exact current/undo/redo order observed immediately before it',
          );
          assert.deepEqual(await save(), first);
          assert.equal(
            (await request({ kind: 'redo' })).changed,
            true,
            'empty optional shape must preserve redo',
          );
          assert.deepEqual(await save(), second);
        }
        expected[0].directions = 'none';
        const cleared = await request({
          kind: 'cell-styles',
          borders: [],
          fills: [],
          diagonals: [{ ...owner(expected[0]), directions: 'none' }],
        });
        verifyReadback(cleared.content, expected);
        const third = await save();
        verifySaved(third, 'direction-none-preserves-solid-stroke');
        expected[0].style = 'NONE';
        const hidden = await request({
          kind: 'cell-styles',
          borders: [],
          fills: [],
          diagonals: [{ ...owner(expected[0]), style: 'NONE' }],
        });
        verifyReadback(hidden.content, expected);
        const final = await save();
        verifySaved(final, 'stroke-NONE-preserves-direction-none');
        assert.equal((await request({ kind: 'undo' })).changed, true);
        assert.deepEqual(await save(), third);
        assert.equal((await request({ kind: 'redo' })).changed, true);
        assert.deepEqual(await save(), final);
        // Return all the way to the unchanged source and redo every native event.
        for (let i = 0; i < 4; i++) assert.equal((await request({ kind: 'undo' })).changed, true);
        assert.deepEqual(await save(), original);
        assert.equal((await request({ kind: 'undo' })).changed, false);
        for (let i = 0; i < 4; i++) assert.equal((await request({ kind: 'redo' })).changed, true);
        assert.deepEqual(await save(), final);
        await runtime.dispose();
        runtime = null;
        const reopened = await open(final);
        verifyReadback(reopened.content, expected);
        assert.deepEqual(await save(), final);
        writeFileSync(
          join(evidence, format === 'hwp5' ? 'runtime-saved.hwp' : 'runtime-saved.hwpx'),
          final,
        );
        receipt.status = 'pass';
      } catch (error) {
        receipt.status = 'fail';
        receipt.error = String(error?.stack ?? error);
        throw error;
      } finally {
        await runtime?.dispose();
        writeFileSync(
          join(evidence, `${format}-runtime.json`),
          JSON.stringify(receipt, null, 2) + '\n',
        );
        console.log(`diagonal runtime ${format}: ${receipt.status}; evidence=${evidence}`);
      }
    },
  );
}
