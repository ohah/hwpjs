import { verifyCellFixtureInputs } from '../../../tools/shape-copy-cell-input-validation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fixture, saved, seedDraft } from './shape-copy-cell-fixture.mjs';
import { createCellShapeCopyPort } from '../src/shape-copy-cell-port.ts';
import { UNDO_COMMAND, REDO_COMMAND, caseDirectory } from './shape-copy-native-fixture.mjs';
const output = await caseDirectory('atomic-followup');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const pins = JSON.parse(await readFile(process.env.HWPJS_CELL_FOLLOWUP_FIXTURES, 'utf8'));
await verifyCellFixtureInputs(pins);
const ids = ['cell.border', 'cell.background', 'cell.diagonal'];
async function newInput(kind) {
  const row = pins.files.find((r) => r.kind === kind),
    bytes = await readFile(row.path);
  assert.equal(sha(bytes), row.sha256);
  return bytes;
}
async function seed(h) {
  await h.select(h.source);
  assert.equal(
    (await h.appearance.apply(h.appearance.capture(), seedDraft)).status,
    'committed-with-snapshot',
  );
  await h.select(h.source);
}
async function remember(h, p, selected = ids) {
  await h.select(h.source);
  p.remember(await p.readSource(() => true), selected, () => true);
}
async function redo(h) {
  await h.select(h.source);
  assert.equal(
    (
      await h.appearance.apply(h.appearance.capture(), {
        border: null,
        background: { kind: 'solid', color: '#778899', dirty: true },
      })
    ).status,
    'committed-with-snapshot',
  );
  const bytes = await saved(h.e);
  assert.equal(
    (await h.e.dispatchCommand(UNDO_COMMAND, { token: h.e.getEditorState().token })).status,
    'committed-with-snapshot',
  );
  return bytes;
}
function wrapper(h, send) {
  return { ...h.e, requestExperimental: send };
}
for (const reversed of [false, true])
  test(
    'actual879 mixed unprotected/protect1 cells: whole border/fill/diagonal batch denied, undo+redo and first target preserved/' +
      reversed,
    async () => {
      const h = await fixture('hwpx', { opaqueTargets: true });
      let requests = 0;
      const p = createCellShapeCopyPort(
        wrapper(h, async (msg, opts) => {
          requests++;
          const message = structuredClone(msg);
          if (reversed) for (const k of ['borders', 'fills', 'diagonals']) message[k]?.reverse();
          return h.e.requestExperimental(message, opts);
        }),
      );
      try {
        await h.e.load(await newInput('mixed-protected'), { format: 'hwpx', editable: true });
        await seed(h);
        await remember(h, p);
        const redoBytes = await redo(h);
        await h.select(h.targets[0]);
        const before = await saved(h.e),
          state = h.e.getEditorState();
        assert.equal(state.nativeHistoryStats.redoCount, 1);
        const result = await p.apply(() => true, h.selection());
        assert.equal(result.status, 'rejected-unapplied');
        assert.equal(result.error, 'ProtectedCell');
        assert.equal(requests, 1);
        assert.deepEqual(await saved(h.e), before);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
        assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
        assert.equal(
          (await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token })).status,
          'committed-with-snapshot',
        );
        assert.deepEqual(await saved(h.e), redoBytes);
        await writeFile(
          new URL('mixed-' + reversed + '.json', output),
          JSON.stringify(
            {
              inputSHA256: sha(await newInput('mixed-protected')),
              requests,
              NativeCommits: 0,
              beforeSHA256: sha(before),
              redoSHA256: sha(redoBytes),
              status: result.status,
              error: result.error,
              classification: reversed
                ? 'controlled valid row-order wrapper -> actual Native protected admission'
                : 'actual normal SDK879 Native mixed protection batch',
            },
            null,
            2,
          ),
        );
      } finally {
        p.dispose();
        await h.close();
      }
    },
  );
for (const format of ['hwp5', 'hwpx'])
  test(
    'controlled foreign owner envelope -> actual879/' +
      format +
      ': rejected entire batch, no history change, redo bytes intact',
    async () => {
      const h = await fixture(format, { opaqueTargets: format === 'hwpx' });
      let requests = 0;
      const p = createCellShapeCopyPort(
        wrapper(h, async (msg, opts) => {
          requests++;
          const message = structuredClone(msg);
          for (const k of ['borders', 'fills', 'diagonals'])
            for (const row of message[k] ?? []) row.tableNode = 4294967295;
          return h.e.requestExperimental(message, opts);
        }),
      );
      try {
        await seed(h);
        await remember(h, p);
        const redoBytes = await redo(h);
        await h.select(h.targets[0]);
        const before = await saved(h.e),
          state = h.e.getEditorState();
        const result = await p.apply(() => true, h.selection());
        assert.equal(result.status, 'rejected-unapplied');
        assert(result.error);
        assert.equal(requests, 1);
        assert.deepEqual(await saved(h.e), before);
        assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
        await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token });
        assert.deepEqual(await saved(h.e), redoBytes);
        await writeFile(
          new URL(format + '-foreign-owner.json', output),
          JSON.stringify(
            {
              result: { status: result.status, error: result.error },
              requests,
              NativeCommits: 0,
              redoSHA256: sha(redoBytes),
              classification:
                'invalid owner injected into host envelope; actual normal SDK/Native refusal, not natural UI or Native fault',
            },
            null,
            2,
          ),
        );
      } finally {
        p.dispose();
        await h.close();
      }
    },
  );
for (const format of ['hwp5', 'hwpx'])
  test(
    'actual879 single-cell exact no-op/' +
      format +
      ': zero new commit and full native redo branch retained',
    async () => {
      const h = await fixture(format, { opaqueTargets: format === 'hwpx' });
      let requests = 0;
      const p = createCellShapeCopyPort(
        wrapper(h, async (...a) => {
          requests++;
          return h.e.requestExperimental(...a);
        }),
      );
      try {
        await seed(h);
        await remember(h, p);
        await h.select(h.targets[0]);
        assert.equal((await p.apply(() => true)).status, 'committed-with-snapshot');
        const redoBytes = await redo(h);
        await h.select(h.targets[0]);
        const before = await saved(h.e),
          state = h.e.getEditorState();
        assert.equal(state.nativeHistoryStats.redoCount, 1);
        assert.equal((await p.apply(() => true)).status, 'known-no-op');
        assert.equal(requests, 2);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
        assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
        assert.deepEqual(await saved(h.e), before);
        await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token });
        assert.deepEqual(await saved(h.e), redoBytes);
      } finally {
        p.dispose();
        await h.close();
      }
    },
  );
for (const [kind, disabled] of [
  ['unknown-border', 'cell.border'],
  ['unknown-fill-alpha', 'cell.background'],
  ['unknown-diagonal', 'cell.diagonal'],
])
  test(
    'actual879 parses authored unknown source/' +
      kind +
      ': unavailable field has no default, independent known fields remain usable',
    async () => {
      const h = await fixture('hwpx', { opaqueTargets: true });
      let requests = 0;
      const p = createCellShapeCopyPort(
        wrapper(h, async (...a) => {
          requests++;
          return h.e.requestExperimental(...a);
        }),
      );
      try {
        await h.e.load(await newInput(kind), { format: 'hwpx', editable: true });
        await h.select(h.source);
        const before = await saved(h.e);
        const c = await p.readSource(() => true);
        assert.equal(c.options.find((o) => o.id === disabled).enabled, false);
        assert.throws(() => p.remember(c, [disabled], () => true), /FieldUnavailable/);
        const supported = c.options.filter((o) => o.enabled).map((o) => o.id);
        assert.equal(supported.length, 2);
        p.remember(c, supported, () => true);
        assert.equal(requests, 0);
        assert.deepEqual(await saved(h.e), before);
        await h.select(h.targets[0]);
        const revision = h.e.getEditorState().nativeHistoryRevision;
        const result = await p.apply(() => true, h.selection());
        assert.equal(result.status, 'committed-with-snapshot');
        assert.equal(requests, 1);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, revision + 1);
        await writeFile(
          new URL(kind + '.json', output),
          JSON.stringify(
            {
              inputSHA256: sha(await newInput(kind)),
              disabled,
              supported,
              NativeCommits: 1,
              classification:
                'real879 parsed NEW authored XML field variant; no capability/DTO injection',
            },
            null,
            2,
          ),
        );
      } finally {
        p.dispose();
        await h.close();
      }
    },
  );
for (const change of [
  'document-A-B-A',
  'owner-witness',
  'paragraph-alias',
  'lease-A-B-A',
  'clear-buffer',
  'dispose',
])
  test(
    'controlled admission barrier/' +
      change +
      ': current owner/lease must still hold, zero writer requests and redo retained',
    async () => {
      const h = await fixture();
      let enter,
        release,
        hold = false,
        requests = 0;
      const started = new Promise((r) => (enter = r)),
        gate = new Promise((r) => (release = r));
      const p = createCellShapeCopyPort({
        ...h.e,
        update: async (...a) => {
          const result = await h.e.update(...a);
          if (hold) {
            enter();
            await gate;
          }
          return result;
        },
        requestExperimental: async (...a) => {
          requests++;
          return h.e.requestExperimental(...a);
        },
      });
      try {
        await seed(h);
        await remember(h, p);
        const redoBytes = await redo(h);
        await h.select(h.targets[0]);
        const before = await saved(h.e),
          state = h.e.getEditorState(),
          selection = h.selection();
        const capturedLease = { kind: 'A' };
        let currentLease = capturedLease;
        selection.current = () => currentLease === capturedLease;
        hold = true;
        const pending = p.apply(() => true, selection);
        await started;
        if (change === 'document-A-B-A') {
          await h.e.load(h.original, { format: 'hwp5', editable: true });
          await h.e.load(before, { format: 'hwp5', editable: true });
        }
        if (change === 'owner-witness') selection.witness.cells[0].listNode = 4294967295;
        if (change === 'paragraph-alias') selection.witness.cells[0].paragraphs[0]++;
        if (change === 'lease-A-B-A') {
          currentLease = { kind: 'B' };
          currentLease = { kind: 'A' };
        }
        if (change === 'clear-buffer') p.clear();
        if (change === 'dispose') p.dispose();
        release();
        assert.equal((await pending).status, 'rejected-unapplied');
        assert.equal(requests, 0);
        assert.deepEqual(await saved(h.e), before);
        if (change !== 'document-A-B-A') {
          assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
          await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token });
          assert.deepEqual(await saved(h.e), redoBytes);
        } else
          assert.notEqual(
            h.e.getEditorState().generation,
            state.generation,
            'newly loaded document intentionally has separate history',
          );
      } finally {
        release();
        p.dispose();
        await h.close();
      }
    },
  );
