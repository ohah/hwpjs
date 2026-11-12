import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  createReaderRuntimeFactory,
  wasmModule,
  inputBytes,
  caseDirectory,
  verifyInputs,
} from './shape-copy-native-fixture.mjs';
import { createShapeCopyPort } from '../src/shape-copy-port.ts';
const output = await caseDirectory('followup');
const saved = async (e) => Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
async function fixture(format) {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
  const original = await inputBytes(format);
  await e.load(original, { format, editable: true });
  const rows = e
    .getEditorState()
    .content.paragraphs.filter(
      (r) => !r.tableCell && !r.drawingText && !r.drawingCaption && r.text.length >= 4,
    );
  const select = (i, start = 0, end = 1) =>
    e.setSelection(
      createParagraphSelection(e.getEditorState(), {
        section: rows[i].section,
        paragraph: rows[i].paragraph,
        startUnit: start,
        endUnit: end,
      }),
    );
  const patch = (patch) =>
    e.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target: e.getEditorState().selection,
      selectionVersion: e.getEditorState().stateVersion,
      patch,
    });
  return { e, original, select, patch };
}
function adapter(e, overrides = {}) {
  return Object.assign(
    {
      getEditorState: () => e.getEditorState(),
      getFormattingCapabilities: e.getFormattingCapabilities.bind(e),
      queryFormatting: e.queryFormatting.bind(e),
      dispatchCommand: e.dispatchCommand.bind(e),
    },
    overrides,
  );
}
function gate() {
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    waiting = new Promise((r) => (release = r));
  return {
    entered,
    release,
    hold: async (value) => {
      enter();
      await waiting;
      return value;
    },
  };
}
async function remember(h, port, ids = ['character.bold']) {
  await h.select(0, 1, 1);
  const c = await port.readSource(() => true);
  port.remember(c, ids, () => true);
  return c;
}
async function redoBranch(h) {
  await h.select(1);
  const q = await h.e.queryFormatting(h.e.getEditorState().selection, {
    fields: ['character.italic'],
  });
  const result = await h.patch({
    character: { italic: !q.observations.aggregate['character.italic'].value },
  });
  assert.equal(result.status, 'committed-with-snapshot');
  const redoBytes = await saved(h.e);
  assert.equal(
    (await h.e.dispatchCommand(UNDO_COMMAND, { token: h.e.getEditorState().token })).status,
    'committed-with-snapshot',
  );
  return redoBytes;
}
for (const format of ['hwp5', 'hwpx']) {
  test(
    'real normal SDK879/' +
      format +
      ': identical patch is no-op, zero commits and existing redo retained',
    async () => {
      const h = await fixture(format);
      let dispatches = 0;
      const port = createShapeCopyPort(
        adapter(h.e, {
          dispatchCommand: async (...args) => {
            dispatches++;
            return h.e.dispatchCommand(...args);
          },
        }),
      );
      try {
        const redoBytes = await redoBranch(h);
        await remember(h, port);
        await h.select(0, 0, 1);
        const before = await saved(h.e),
          state = h.e.getEditorState();
        assert.equal(state.nativeHistoryStats.redoCount, 1);
        assert.equal(state.nativeHistoryStats.undoCount, 0);
        const result = await port.apply(() => true);
        await writeFile(
          new URL(format + '-no-op.json', output),
          JSON.stringify(
            {
              status: result.status,
              dispatches,
              beforeHistory: state.nativeHistoryStats,
              afterHistory: h.e.getEditorState().nativeHistoryStats,
              beforeRevision: state.nativeHistoryRevision,
              afterRevision: h.e.getEditorState().nativeHistoryRevision,
            },
            null,
            2,
          ),
        );
        assert.equal(result.status, 'known-no-op');
        assert.equal(dispatches, 1);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
        assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
        assert.deepEqual(await saved(h.e), before);
        assert.equal(
          (await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token })).status,
          'committed-with-snapshot',
        );
        assert.deepEqual(await saved(h.e), redoBytes);
      } finally {
        port.dispose();
        await h.e.dispose();
      }
    },
  );
  test(
    'controlled stale envelope -> actual SDK refusal/' +
      format +
      ': no commit, redo bytes retained, buffer reusable',
    async () => {
      const h = await fixture(format);
      let refuse = true,
        dispatches = 0;
      const port = createShapeCopyPort(
        adapter(h.e, {
          dispatchCommand: async (cmd, payload) => {
            dispatches++;
            return h.e.dispatchCommand(
              cmd,
              refuse ? { ...payload, selectionVersion: payload.selectionVersion - 1 } : payload,
            );
          },
        }),
      );
      try {
        const redoBytes = await redoBranch(h);
        await remember(h, port);
        await h.select(1);
        const before = await saved(h.e),
          state = h.e.getEditorState();
        const reply = await port.apply(() => true);
        await writeFile(
          new URL(format + '-sdk-refusal.json', output),
          JSON.stringify(reply, null, 2),
        );
        assert.equal(reply.status, 'rejected-unapplied');
        assert.equal(dispatches, 1);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
        assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
        assert.deepEqual(await saved(h.e), before);
        assert.equal(
          (await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token })).status,
          'committed-with-snapshot',
        );
        assert.deepEqual(await saved(h.e), redoBytes);
        refuse = false;
        const reused = await port.apply(() => true);
        assert(['known-no-op', 'committed-with-snapshot'].includes(reused.status));
      } finally {
        port.dispose();
        await h.e.dispose();
      }
    },
  );
}
for (const phase of ['source-query', 'target-query'])
  for (const change of [
    'selection-A-B-A',
    'document-A-B-A',
    'dispose',
    'editor-dispose',
    'inactive',
  ]) {
    test(
      'controlled delayed actual SDK response/' + phase + '/' + change + ': no stale dispatch',
      async () => {
        const h = await fixture('hwp5'),
          g = gate();
        let hold = false,
          active = true,
          dispatches = 0;
        const port = createShapeCopyPort(
          adapter(h.e, {
            queryFormatting: async (...a) => {
              const q = await h.e.queryFormatting(...a);
              return hold ? g.hold(q) : q;
            },
            dispatchCommand: async (...a) => {
              dispatches++;
              return h.e.dispatchCommand(...a);
            },
          }),
        );
        try {
          if (phase === 'target-query') {
            await remember(h, port);
            await h.select(1);
          } else await h.select(0, 1, 1);
          const before = await saved(h.e),
            revision = h.e.getEditorState().nativeHistoryRevision;
          hold = true;
          const pending =
            phase === 'source-query' ? port.readSource(() => active) : port.apply(() => active);
          const checked = assert.rejects(pending, /Stale|Inactive/);
          await g.entered;
          if (change === 'selection-A-B-A') {
            await h.select(1, 1, 2);
            await h.select(phase === 'source-query' ? 0 : 1, phase === 'source-query' ? 1 : 0, 1);
          }
          if (change === 'document-A-B-A') {
            await h.e.load(await inputBytes('hwpx'), { format: 'hwpx', editable: true });
            await h.e.load(before, { format: 'hwp5', editable: true });
          }
          if (change === 'dispose') port.dispose();
          if (change === 'editor-dispose') await h.e.dispose();
          if (change === 'inactive') active = false;
          g.release();
          await checked;
          assert.equal(dispatches, 0);
          if (change === 'editor-dispose') {
            assert.equal(h.e.getEditorState().status, 'disposed');
            return;
          }
          assert.deepEqual(await saved(h.e), before);
          if (change !== 'document-A-B-A')
            assert.equal(h.e.getEditorState().nativeHistoryRevision, revision);
        } finally {
          g.release();
          port.dispose();
          await h.e.dispose();
        }
      },
    );
  }
test('controlled dispatch pending: accepted real SDK commit survives port disposal; duplicate invoke refused', async () => {
  const h = await fixture('hwp5'),
    g = gate();
  let dispatches = 0;
  const port = createShapeCopyPort(
    adapter(h.e, {
      dispatchCommand: async (...a) => {
        dispatches++;
        const result = await h.e.dispatchCommand(...a);
        return g.hold(result);
      },
    }),
  );
  try {
    await h.select(0);
    assert.equal((await h.patch({ character: { size: 1800 } })).status, 'committed-with-snapshot');
    await remember(h, port, ['character.size']);
    await h.select(1);
    const before = h.e.getEditorState().nativeHistoryRevision;
    const pending = port.apply(() => true);
    await g.entered;
    await assert.rejects(
      port.apply(() => true),
      /Pending/,
    );
    port.dispose();
    g.release();
    assert.equal((await pending).status, 'committed-with-snapshot');
    assert.equal(dispatches, 1);
    assert.equal(h.e.getEditorState().nativeHistoryRevision, before + 1);
    await assert.rejects(
      port.apply(() => true),
      /SourceUnavailable/,
    );
  } finally {
    g.release();
    port.dispose();
    await h.e.dispose();
  }
});
test('actual source DTO nested values, selected IDs and forged capture cannot alias remembered patch', async () => {
  const h = await fixture('hwp5');
  let sourceDTO, seen;
  const port = createShapeCopyPort(
    adapter(h.e, {
      queryFormatting: async (...a) => {
        const q = await h.e.queryFormatting(...a);
        sourceDTO = structuredClone(q);
        return sourceDTO;
      },
      dispatchCommand: async (cmd, payload) => {
        seen = structuredClone(payload);
        return h.e.dispatchCommand(cmd, payload);
      },
    }),
  );
  try {
    const c = await remember(h, port, ['paragraph.spacing']);
    assert.throws(() => port.remember({ ...c }, ['paragraph.spacing'], () => true), /Invalid/);
    const d = c.options.find((d) => d.id === 'paragraph.spacing');
    assert(Object.isFrozen(d.values));
    assert(Object.isFrozen(d.fields));
    assert.throws(() => {
      d.values[0] = 'invalid';
    }, TypeError);
    const ids = ['paragraph.spacing'];
    port.remember(c, ids, () => true);
    ids[0] = 'character.size';
    ids.push('character.bold');
    sourceDTO.observations.aggregate['paragraph.spacing.value'].value = 987654;
    await h.select(1);
    await port.apply(() => true);
    assert.deepEqual(Object.keys(seen.patch), ['paragraph']);
    assert.deepEqual(seen.patch.paragraph.spacing, { kind: d.values[0], value: d.values[1] });
  } finally {
    port.dispose();
    await h.e.dispose();
  }
});
for (const fault of [
  'unknown-source-enum',
  'stale-source-binding',
  'target-enum-changed',
  'target-not-writable',
  'stale-target-binding',
]) {
  test(
    'controlled capability/binding mutation/' + fault + ': typed guard refuses before writer',
    async () => {
      const h = await fixture('hwp5');
      let stage = 'source',
        dispatches = 0;
      const port = createShapeCopyPort(
        adapter(h.e, {
          getFormattingCapabilities: async (...a) => {
            const c = structuredClone(await h.e.getFormattingCapabilities(...a));
            if (fault === 'target-enum-changed' && stage === 'target')
              c.fields['paragraph.alignment'].enumValues = ['__unrepresentable__'];
            if (fault === 'target-not-writable' && stage === 'target')
              c.fields['paragraph.alignment'].writable = false;
            return c;
          },
          queryFormatting: async (...a) => {
            const q = structuredClone(await h.e.queryFormatting(...a));
            if (
              fault === 'unknown-source-enum' &&
              stage === 'source' &&
              q.observations.aggregate['paragraph.alignment']
            )
              q.observations.aggregate['paragraph.alignment'].value = '__unknown__';
            if (fault === 'stale-' + stage + '-binding') q.binding.revision++;
            return q;
          },
          dispatchCommand: async (...a) => {
            dispatches++;
            return h.e.dispatchCommand(...a);
          },
        }),
      );
      try {
        await h.select(0, 1, 1);
        if (fault === 'stale-source-binding') {
          await assert.rejects(
            port.readSource(() => true),
            /StaleFormattingBinding/,
          );
          return;
        }
        const c = await port.readSource(() => true);
        if (fault === 'unknown-source-enum') {
          assert.equal(c.options.find((d) => d.id === 'paragraph.alignment').enabled, false);
          assert.throws(
            () => port.remember(c, ['paragraph.alignment'], () => true),
            /FieldUnavailable/,
          );
          return;
        }
        port.remember(c, ['paragraph.alignment'], () => true);
        await h.select(1);
        stage = 'target';
        const before = await saved(h.e),
          rev = h.e.getEditorState().nativeHistoryRevision;
        await assert.rejects(
          port.apply(() => true),
          /NotRepresentable|NotWritable|StaleFormattingBinding/,
        );
        assert.equal(dispatches, 0);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, rev);
        assert.deepEqual(await saved(h.e), before);
      } finally {
        assert.equal(dispatches, 0);
        port.dispose();
        await h.e.dispose();
      }
    },
  );
}
await verifyInputs();

test('real normal SDK879: returned nested resource observation cannot mutate Native source', async () => {
  const h = await fixture('hwp5');
  try {
    await h.select(0);
    const fields = ['paragraph.border'];
    const before = await saved(h.e);
    const q = await h.e.queryFormatting(h.e.getEditorState().selection, { fields });
    const value = q.observations.aggregate['paragraph.border'].value;
    const expected = structuredClone(value);
    try {
      value.left.color = 0x123456;
    } catch (error) {
      assert(error instanceof TypeError);
    }
    const next = await h.e.queryFormatting(h.e.getEditorState().selection, { fields });
    assert.deepEqual(
      structuredClone(next.observations.aggregate['paragraph.border'].value),
      expected,
    );
    assert.deepEqual(await saved(h.e), before);
  } finally {
    await h.e.dispose();
  }
});

for (const change of ['state-A-B-A', 'document-A-B-A', 'editor-dispose'])
  test(
    'controlled host delay before SDK admission/' +
      change +
      ': existing SDK fence refuses queued stale writer',
    async () => {
      const h = await fixture('hwp5'),
        g = gate();
      let calls = 0;
      const port = createShapeCopyPort(
        adapter(h.e, {
          dispatchCommand: async (...args) => {
            calls++;
            await g.hold(null);
            return h.e.dispatchCommand(...args);
          },
        }),
      );
      try {
        await remember(h, port);
        await h.select(1);
        const before = await saved(h.e),
          revision = h.e.getEditorState().nativeHistoryRevision;
        const pending = port.apply(() => true);
        // Normalize exceptions and rejected-unapplied responses; both deny admission.
        const settled = pending.then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await g.entered;
        if (change === 'state-A-B-A') {
          await h.select(1, 1, 3);
          await h.select(1);
        }
        if (change === 'document-A-B-A') {
          await h.e.load(await inputBytes('hwpx'), { format: 'hwpx', editable: true });
          await h.e.load(before, { format: 'hwp5', editable: true });
          await h.select(1);
        }
        if (change === 'editor-dispose') await h.e.dispose();
        g.release();
        const result = await settled;
        assert.equal(calls, 1);
        if (result.error) assert.match(String(result.error), /Disposed|Stale|Document|Selection/);
        else assert.equal(result.value.status, 'rejected-unapplied');
        if (change !== 'editor-dispose') {
          assert.deepEqual(await saved(h.e), before);
          if (change === 'state-A-B-A')
            assert.equal(h.e.getEditorState().nativeHistoryRevision, revision);
        }
      } finally {
        g.release();
        port.dispose();
        await h.e.dispose();
      }
    },
  );

for (const format of ['hwp5', 'hwpx'])
  test(
    'real SDK resource writer/' +
      format +
      ': nested source DTO and outgoing patch cannot alias copied border/font',
    async () => {
      const h = await fixture(format);
      let sourceDTO,
        seen = [];
      const port = createShapeCopyPort(
        adapter(h.e, {
          queryFormatting: async (...a) => {
            const q = structuredClone(await h.e.queryFormatting(...a));
            if (q.observations.aggregate['paragraph.border']) sourceDTO = q;
            return q;
          },
          dispatchCommand: async (cmd, payload) => {
            seen.push(structuredClone(payload.patch));
            const r = await h.e.dispatchCommand(cmd, payload);
            payload.patch.paragraph.border.left.color = 0xabcdef;
            return r;
          },
        }),
      );
      try {
        await h.select(0);
        assert.equal(
          (
            await h.patch({
              paragraph: {
                border: { left: { style: 'SOLID', widthHundredthMm: 20, color: 0x224466 } },
              },
            })
          ).status,
          'committed-with-snapshot',
        );
        const c = await remember(h, port, ['paragraph.border', 'character.fonts.hangul.name']);
        const border = c.options.find((d) => d.id === 'paragraph.border').values[0];
        assert.equal(border.left.color, 0x224466);
        assert(Object.isFrozen(border.left));
        assert.throws(() => {
          border.left.color = 123;
        }, TypeError);
        sourceDTO.observations.aggregate['paragraph.border'].value.left.color = 0x987654;
        for (const target of [1, 2]) {
          await h.select(target);
          const rev = h.e.getEditorState().nativeHistoryRevision;
          assert.equal((await port.apply(() => true)).status, 'committed-with-snapshot');
          assert.equal(h.e.getEditorState().nativeHistoryRevision, rev + 1);
          const q = await h.e.queryFormatting(h.e.getEditorState().selection, {
            fields: ['paragraph.border', 'character.fonts.hangul.name'],
          });
          assert.equal(q.observations.aggregate['paragraph.border'].value.left.color, 0x224466);
          assert.deepEqual(
            q.observations.aggregate['character.fonts.hangul.name'].value,
            c.options.find((d) => d.id === 'character.fonts.hangul.name').values[0],
          );
        }
        assert.equal(seen.length, 2);
        assert.deepEqual(seen[0], seen[1]);
        const after = await saved(h.e);
        await h.e.load(after, { format, editable: true });
        assert.deepEqual(await saved(h.e), after);
      } finally {
        port.dispose();
        await h.e.dispose();
      }
    },
  );
for (const format of ['hwp5', 'hwpx'])
  test(
    'controlled invalid resource envelope -> real SDK879 dispatch/' +
      format +
      ': rejection preserves Native redo',
    async () => {
      const h = await fixture(format);
      let calls = 0;
      const port = createShapeCopyPort(
        adapter(h.e, {
          dispatchCommand: async (cmd, payload) => {
            calls++;
            return h.e.dispatchCommand(cmd, {
              ...payload,
              patch: { paragraph: { bullet: { kind: 'existing', id: 4294967295 } } },
            });
          },
        }),
      );
      try {
        const redo = await redoBranch(h);
        await remember(h, port);
        await h.select(1);
        const before = await saved(h.e),
          state = h.e.getEditorState();
        const reply = await port.apply(() => true);
        await writeFile(
          new URL(format + '-invalid-resource-refusal.json', output),
          JSON.stringify(reply, null, 2),
        );
        assert.equal(reply.status, 'rejected-unapplied');
        assert.equal(calls, 1);
        assert.deepEqual(h.e.getEditorState().nativeHistoryStats, state.nativeHistoryStats);
        assert.equal(h.e.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
        assert.deepEqual(await saved(h.e), before);
        assert.equal(
          (await h.e.dispatchCommand(REDO_COMMAND, { token: h.e.getEditorState().token })).status,
          'committed-with-snapshot',
        );
        assert.deepEqual(await saved(h.e), redo);
      } finally {
        port.dispose();
        await h.e.dispose();
      }
    },
  );
