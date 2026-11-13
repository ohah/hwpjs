import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fixture, saved, seedDraft } from './shape-copy-cell-fixture.mjs';
import {
  UNDO_COMMAND,
  REDO_COMMAND,
  caseDirectory,
  verifyInputs,
} from './shape-copy-native-fixture.mjs';
import { planCellAppearanceSelection } from '@hwpjs/core';
import { observeTableCellAppearance as rawObserve } from '../../../js/table-cell-appearance-observation.mjs';
const module = await import(
  process.env.HWPJS_CELL_PORT_PREIMAGE ?? '../src/shape-copy-cell-port.ts'
);
const createPort = module.createCellShapeCopyPort ?? module.createShapeCopyPort;
const output = await caseDirectory('cell');
const observeTableCellAppearance = (content, c) =>
  rawObserve(content, { section: c.section, tableNode: c.tableNode, listNode: c.listNode });
const ids = ['cell.border', 'cell.background', 'cell.diagonal'];
const clean = (obs) => ({
  edges: Object.fromEntries(
    Object.entries(obs.edges).map(([k, v]) => [
      k,
      { state: v.state, style: v.style, width: v.width, color: v.color },
    ]),
  ),
  fill: {
    state: obs.fill.state,
    kind: obs.fill.kind,
    color: obs.fill.color,
    background: obs.fill.background,
    pattern: obs.fill.pattern,
  },
  diagonal: {
    state: obs.diagonal.state,
    directions: obs.diagonal.directions,
    stroke: {
      state: obs.diagonal.stroke.state,
      style: obs.diagonal.stroke.style,
      width: obs.diagonal.stroke.width,
      color: obs.diagonal.stroke.color,
    },
  },
});
for (const format of ['hwp5', 'hwpx'])
  for (const fields of [['cell.border'], ['cell.background'], ['cell.diagonal'], ids])
    test(
      'actual normal SDK879 cell copy/' +
        format +
        (format === 'hwpx' ? '/NEW-authored-opaque' : '/original-Noori') +
        '/' +
        fields.join('+') +
        ': single batch, selected fields, source/undo/redo/save/reopen',
      async () => {
        const h = await fixture(format, { opaqueTargets: format === 'hwpx' });
        let writes = 0,
          messages = [];
        const wrapped = {
          getEditorState: h.e.getEditorState,
          registerStateListener: h.e.registerStateListener,
          update: h.e.update,
          setSelection: h.e.setSelection,
          requestExperimental: async (...a) => {
            writes++;
            messages.push(a[0]);
            return h.e.requestExperimental(...a);
          },
        };
        const port = createPort(wrapped);
        try {
          await h.select(h.source);
          assert.equal(
            (await h.appearance.apply(h.appearance.capture(), seedDraft)).status,
            'committed-with-snapshot',
          );
          await h.select(h.source);
          const source = clean(observeTableCellAppearance(h.e.getEditorState().content, h.source));
          const before = await saved(h.e),
            rev = h.e.getEditorState().nativeHistoryRevision;
          const capture = await port.readSource(() => true);
          for (const id of ids)
            assert.equal(capture.options.find((d) => d.id === id)?.enabled, true, id);
          port.remember(capture, fields, () => true);
          assert.deepEqual(await saved(h.e), before);
          await h.select(h.targets[0]);
          const unselected = new Map(
            h.targets.map((c) => [
              c.listNode,
              clean(observeTableCellAppearance(h.e.getEditorState().content, c)),
            ]),
          );
          const reply = await port.apply(() => true, h.selection());
          assert.equal(reply.status, 'committed-with-snapshot', JSON.stringify(reply));
          assert.equal(writes, 1);
          assert.equal(messages[0].kind, 'cell-styles');
          assert.equal(h.e.getEditorState().nativeHistoryRevision, rev + 1);
          assert.deepEqual(
            clean(observeTableCellAppearance(h.e.getEditorState().content, h.source)),
            source,
            'source unchanged',
          );
          for (const c of h.targets) {
            const after = clean(observeTableCellAppearance(h.e.getEditorState().content, c));
            for (const [id, key] of [
              ['cell.border', 'edges'],
              ['cell.background', 'fill'],
              ['cell.diagonal', 'diagonal'],
            ])
              assert.deepEqual(
                after[key],
                fields.includes(id) ? source[key] : unselected.get(c.listNode)[key],
                id,
              );
          }
          const after = await saved(h.e);
          assert.equal(
            (await h.e.dispatchCommand(UNDO_COMMAND, { token: h.e.getEditorState().token })).status,
            'committed-with-snapshot',
          );
          assert.deepEqual(await saved(h.e), before);
          assert.equal(
            (await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token })).status,
            'committed-with-snapshot',
          );
          assert.deepEqual(await saved(h.e), after);
          await h.e.load(after, { format, editable: true });
          assert.deepEqual(await saved(h.e), after);
          await writeFile(
            new URL(format + '-' + fields.join('-').replaceAll('.', '_') + '.json', output),
            JSON.stringify(
              {
                format,
                fields,
                fixtureCohort: h.cohort,
                inputSHA256: createHash('sha256').update(h.original).digest('hex'),
                beforeSHA256: createHash('sha256').update(before).digest('hex'),
                afterSHA256: createHash('sha256').update(after).digest('hex'),
                source: h.source,
                targets: h.targets,
                NativeHistoryDelta: 1,
                mutationRequests: writes,
                undoRedoBytesExact: true,
                saveReopenExact: true,
              },
              null,
              2,
            ),
          );
          const stem = format + '-' + fields.join('-').replaceAll('.', '_');
          const extension = format === 'hwp5' ? '.hwp' : '.hwpx';
          await writeFile(new URL(stem + '-before' + extension, output), before);
          await writeFile(new URL(stem + '-after' + extension, output), after);
        } finally {
          port.dispose();
          await h.close();
        }
      },
    );
for (const format of ['hwp5', 'hwpx'])
  test(
    'actual normal SDK879 cell/' +
      format +
      (format === 'hwpx' ? '/NEW-authored-opaque' : '/original-Noori') +
      ': repeated same values no-op retains prior redo and buffer',
    async () => {
      const h = await fixture(format, { opaqueTargets: format === 'hwpx' });
      const port = createPort(h.e);
      try {
        await h.select(h.source);
        assert.equal(
          (await h.appearance.apply(h.appearance.capture(), seedDraft)).status,
          'committed-with-snapshot',
        );
        await h.select(h.source);
        const c = await port.readSource(() => true);
        port.remember(c, ids, () => true);
        await h.select(h.targets[0]);
        assert.equal(
          (await port.apply(() => true, h.selection())).status,
          'committed-with-snapshot',
        );
        const applied = await saved(h.e);
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
        const redo = await saved(h.e);
        await h.e.dispatchCommand(UNDO_COMMAND, { token: h.e.getEditorState().token });
        assert.deepEqual(await saved(h.e), applied);
        await h.select(h.targets[0]);
        const before = h.e.getEditorState();
        const reply = await port.apply(() => true, h.selection());
        assert.equal(reply.status, 'known-no-op', JSON.stringify(reply));
        assert.equal(h.e.getEditorState().nativeHistoryRevision, before.nativeHistoryRevision);
        assert.deepEqual(h.e.getEditorState().nativeHistoryStats, before.nativeHistoryStats);
        assert.deepEqual(await saved(h.e), applied);
        await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token });
        assert.deepEqual(await saved(h.e), redo);
      } finally {
        port.dispose();
        await h.close();
      }
    },
  );
test('actual Native879 guards: foreign/stale capture, readonly, inactive, invalid owner and document replacement never write', async () => {
  const h = await fixture();
  let writes = 0;
  const port = createPort({
    ...h.e,
    requestExperimental: async (...a) => {
      writes++;
      return h.e.requestExperimental(...a);
    },
  });
  try {
    await h.select(h.source);
    const c = await port.readSource(() => true);
    assert.throws(() => port.remember({ ...c }, ids, () => true));
    await h.select(h.targets[0]);
    assert.throws(() => port.remember(c, ids, () => true));
    await h.select(h.source);
    const supported = await port.readSource(() => true);
    port.remember(
      supported,
      supported.options.filter((o) => o.enabled).map((o) => o.id),
      () => true,
    );
    await h.select(h.targets[0]);
    const before = await saved(h.e);
    await assert.rejects(port.apply(() => false, h.selection()));
    const fake = h.selection();
    fake.witness.cells[0].listNode = 4294967295;
    await assert.rejects(port.apply(() => true, fake));
    await h.e.load(h.original, { format: 'hwp5', editable: true });
    await h.select(h.targets[0]);
    await assert.rejects(
      port.apply(() => true, h.selection()),
      /SourceUnavailable/,
    );
    await h.e.load(before, { format: 'hwp5', editable: false });
    await h.select(h.source);
    assert.equal(port.presentation().enabled, false);
    await assert.rejects(port.readSource(() => true));
    assert.equal(writes, 0);
  } finally {
    port.dispose();
    await h.close();
  }
});
test('canonical Core cell block uses Native owner sets: duplicate, foreign, partial/protected and missing capability refused', async () => {
  const h = await fixture();
  try {
    await h.select(h.targets[0]);
    const state = h.e.getEditorState(),
      w = h.witness(h.targets);
    assert.equal(planCellAppearanceSelection(state, w).cells.length, 2);
    const duplicate = structuredClone(w);
    duplicate.cells[1] = duplicate.cells[0];
    assert.throws(() => planCellAppearanceSelection(state, duplicate));
    const forged = structuredClone(w);
    forged.tableNode++;
    assert.throws(() => planCellAppearanceSelection(state, forged));
    // Controlled DTO negatives only; they are not Native-authored capability/owner observations.
    for (const alter of [
      (s) => (s.capabilities.cellStyleBatchAvailable = false),
      (s) => (s.content.readOnly = true),
      (s) => (s.content.tables.find((t) => t.tableNode === w.tableNode).partial = true),
      (s) =>
        (s.content.tables
          .find((t) => t.tableNode === w.tableNode)
          .cells.find((c) => c.listNode === w.cells[0].listNode).protected = true),
    ]) {
      const dto = {
        ...state,
        capabilities: structuredClone(state.capabilities),
        content: structuredClone(state.content),
        selection: state.selection,
        nativeHistoryStats: state.nativeHistoryStats,
        token: state.token,
      };
      alter(dto);
      assert.throws(() => planCellAppearanceSelection(dto, w));
    }
  } finally {
    await h.close();
  }
});
await verifyInputs();

test('actual879 pending cell batch response: duplicate apply denied and dispose cannot duplicate/roll back accepted Native commit', async () => {
  const h = await fixture();
  let enter,
    release,
    writes = 0;
  const started = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  const port = createPort({
    ...h.e,
    requestExperimental: async (...args) => {
      writes++;
      const result = await h.e.requestExperimental(...args);
      enter();
      await gate;
      return result;
    },
  });
  try {
    await h.select(h.source);
    await h.appearance.apply(h.appearance.capture(), seedDraft);
    await h.select(h.source);
    const capture = await port.readSource(() => true);
    const selected = ['cell.border'];
    port.remember(capture, selected, () => true);
    selected[0] = 'cell.background';
    assert.throws(() => {
      capture.options.find((o) => o.id === 'cell.border').part.color = '#ffffff';
    }, TypeError);
    await h.select(h.targets[0]);
    const revision = h.e.getEditorState().nativeHistoryRevision;
    const applying = port.apply(() => true, h.selection());
    await started;
    await assert.rejects(
      port.apply(() => true),
      /Pending/,
    );
    port.dispose();
    release();
    assert.equal((await applying).status, 'committed-with-snapshot');
    assert.equal(writes, 1);
    assert.equal(h.e.getEditorState().nativeHistoryRevision, revision + 1);
  } finally {
    release();
    port.dispose();
    await h.close();
  }
});

test('actual879 HWPX absent-alpha background-copy refusal preserves bytes/history/redo (retained failed writer evidence separate)', async () => {
  const h = await fixture('hwpx');
  let writes = 0;
  const port = createPort({
    ...h.e,
    requestExperimental: async (...a) => {
      writes++;
      return h.e.requestExperimental(...a);
    },
  });
  try {
    await h.select(h.source);
    await h.appearance.apply(h.appearance.capture(), seedDraft);
    await h.select(h.source);
    const capture = await port.readSource(() => true);
    port.remember(capture, ['cell.background'], () => true);
    await h.appearance.apply(h.appearance.capture(), {
      border: null,
      background: { kind: 'solid', color: '#778899', dirty: true },
    });
    const redo = await saved(h.e);
    await h.e.dispatchCommand(UNDO_COMMAND, { token: h.e.getEditorState().token });
    await h.select(h.targets[0]);
    const before = await saved(h.e),
      state = h.e.getEditorState();
    assert.equal(state.nativeHistoryStats.redoCount, 1);
    const result = await port.apply(() => true, h.selection());
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(result.error, 'CellFillTargetAlphaUnavailable');
    assert.deepEqual(await saved(h.e), before);
    assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
    assert.equal(writes, 0);
    await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token });
    assert.deepEqual(await saved(h.e), redo);
  } finally {
    port.dispose();
    await h.close();
  }
});

for (const change of ['A-B-A', 'selection-lease', 'dispose', 'composition'])
  test(
    'controlled shared barrier with actual879/' + change + ': no queued stale cell request',
    async () => {
      const h = await fixture();
      let release,
        entered,
        hold = false,
        live = true,
        writes = 0;
      const gate = new Promise((r) => (release = r)),
        started = new Promise((r) => (entered = r));
      const port = createPort({
        ...h.e,
        update: async (...a) => {
          const result = await h.e.update(...a);
          if (hold) {
            entered();
            await gate;
          }
          return result;
        },
        requestExperimental: async (...a) => {
          writes++;
          return h.e.requestExperimental(...a);
        },
      });
      try {
        await h.select(h.source);
        const c = await port.readSource(() => true);
        port.remember(
          c,
          c.options.filter((d) => d.enabled).map((d) => d.id),
          () => true,
        );
        await h.select(h.targets[0]);
        const before = await saved(h.e),
          rev = h.e.getEditorState().nativeHistoryRevision,
          selection = h.selection();
        selection.current = () => live;
        hold = true;
        const pending = port.apply(() => live, selection);
        await started;
        if (change === 'A-B-A') {
          await h.select(h.source);
          await h.select(h.targets[0]);
        }
        if (change === 'selection-lease' || change === 'composition') live = false;
        if (change === 'dispose') port.dispose();
        release();
        assert.equal((await pending).status, 'rejected-unapplied');
        assert.equal(writes, 0);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, rev);
        assert.deepEqual(await saved(h.e), before);
      } finally {
        release();
        port.dispose();
        await h.close();
      }
    },
  );
for (const format of ['hwp5', 'hwpx'])
  for (const background of [
    { kind: 'none', color: '', dirty: true },
    { kind: 'solid', color: '#776655', dirty: true },
    {
      kind: 'linear',
      color: '#112233',
      endColor: '#aabbcc',
      angle: '90',
      centerX: '50',
      centerY: '50',
      step: '50',
      stepCenter: '50',
      dirty: true,
    },
  ])
    test(
      'actual879 supported cell fill/' +
        format +
        '/' +
        background.kind +
        ': copy selected fill atomically',
      async () => {
        const h = await fixture(format, { opaqueTargets: format === 'hwpx' });
        const port = createPort(h.e);
        try {
          await h.select(h.source);
          await h.appearance.apply(h.appearance.capture(), { border: null, background });
          await h.select(h.source);
          const c = await port.readSource(() => true);
          assert.equal(c.options.find((d) => d.id === 'cell.background').enabled, true);
          port.remember(c, ['cell.background'], () => true);
          const source = observeTableCellAppearance(h.e.getEditorState().content, h.source).fill;
          await h.select(h.targets[0]);
          const rev = h.e.getEditorState().nativeHistoryRevision;
          const result = await port.apply(() => true, h.selection());
          assert(
            ['committed-with-snapshot', 'known-no-op'].includes(result.status),
            JSON.stringify(result),
          );
          assert.equal(
            h.e.getEditorState().nativeHistoryRevision,
            rev + Number(result.status === 'committed-with-snapshot'),
          );
          for (const cell of h.targets) {
            const fill = observeTableCellAppearance(h.e.getEditorState().content, cell).fill;
            const { raw: _raw, ...expected } = source;
            const { raw: _ignored, ...actual } = fill;
            assert.deepEqual(actual, expected);
          }
        } finally {
          port.dispose();
          await h.close();
        }
      },
    );

for (const format of ['hwp5', 'hwpx'])
  test(
    'actual879 single target cell/' + format + ': one history and no neighboring field changes',
    async () => {
      const h = await fixture(format, { opaqueTargets: format === 'hwpx' });
      const port = createPort(h.e);
      try {
        await h.select(h.source);
        await h.appearance.apply(h.appearance.capture(), seedDraft);
        await h.select(h.source);
        port.remember(await port.readSource(() => true), ids, () => true);
        await h.select(h.targets[0]);
        const neighbor = clean(
            observeTableCellAppearance(h.e.getEditorState().content, h.targets[1]),
          ),
          rev = h.e.getEditorState().nativeHistoryRevision;
        const result = await port.apply(() => true);
        assert.equal(result.status, 'committed-with-snapshot');
        assert.equal(h.e.getEditorState().nativeHistoryRevision, rev + 1);
        assert.deepEqual(
          clean(observeTableCellAppearance(h.e.getEditorState().content, h.targets[1])),
          neighbor,
        );
      } finally {
        port.dispose();
        await h.close();
      }
    },
  );
test('actual879 Native admission: explicitly protected authored HWPX target rejects atomic batch without commit', async () => {
  const h = await fixture('hwpx');
  let writes = 0;
  const port = createPort({
    ...h.e,
    requestExperimental: async (...a) => {
      writes++;
      return h.e.requestExperimental(...a);
    },
  });
  try {
    const record = JSON.parse(
        await readFile(process.env.HWPJS_CELL_FIXTURE_INPUTS, 'utf8'),
      ).hwpxProtected,
      bytes = await readFile(record.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    await h.e.load(bytes, { format: 'hwpx', editable: true });
    const before = await saved(h.e);
    // Existing879 does not project tc.protect as a cell.protected observation. Native owns final rejection.
    await h.select(h.source);
    const c = await port.readSource(() => true);
    port.remember(c, ['cell.diagonal'], () => true);
    await h.select(h.targets[0]);
    const state = h.e.getEditorState();
    const result = await port.apply(() => true, h.selection());
    assert.equal(result.status, 'rejected-unapplied');
    assert.match(result.error, /Protected/);
    assert.equal(writes, 1);
    assert.equal(h.e.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
    assert.deepEqual(await saved(h.e), before);
  } finally {
    port.dispose();
    await h.close();
  }
});
