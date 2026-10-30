import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { isAbsolute, parse, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderEditorRuntime } from '../../packages/core/src/runtime/reader-runtime.ts';
import {
  createWasmModuleLoader,
  readKnownNativeModule,
} from '../../packages/core/src/wasm-module-loader.ts';
import {
  readGeometryProjection,
  readNativeGeometryEvidence,
} from '../../packages/core/src/internal/native-geometry-evidence.ts';
import { createNativeGeometryDeps } from '../../web/preview/native-geometry-deps.mjs';
import {
  cloneData,
  row,
  insertExpected,
  assertFullSnapshot,
} from './helpers/hwp5-native-text-expectation.mjs';
function guard(p) {
  assert(typeof p === 'string' && isAbsolute(p), 'ExplicitAbsoluteInputRequired');
  assert(
    !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/i.test(p) &&
      !p.split('/').includes('..'),
    'ProtectedBeforeAccess',
  );
  return p;
}
function input(name, sha) {
  const p = guard(process.env[name]);
  let part = parse(p).root;
  for (const item of p.slice(part.length).split('/')) {
    part = guard(join(part, item));
    assert(!lstatSync(part).isSymbolicLink(), 'InputSymlinkForbidden');
  }
  assert.equal(guard(realpathSync(p)), p);
  const bytes = readFileSync(p);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, name + ' SHA');
  return bytes;
}
const wasm = input(
  'HWPJS_TEST_WASM',
  'd849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb',
);
const bytes = input(
  'HWPJS_TEST_NOORI',
  'b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f',
);
const module = await createWasmModuleLoader({ fetch: async () => new Response(wasm) })();
assert(readKnownNativeModule(module));
const splice = (paragraph, at, text) => ({
  kind: 'splice',
  section: 0,
  paragraph,
  startUnit: at,
  endUnit: at,
  text,
});
async function session(paragraph = 15, mode = 'registered') {
  const m = mode === 'unregistered' ? await WebAssembly.compile(wasm) : module;
  if (mode === 'unregistered') assert.equal(readKnownNativeModule(m), undefined);
  const e = createEditor({
    runtimeFactory: () => {
      const r = createReaderEditorRuntime({ wasmModule: m });
      return mode === 'custom'
        ? { request: (...a) => r.request(...a), dispose: () => r.dispose() }
        : r;
    },
  });
  let lease;
  const deps = createNativeGeometryDeps({ readEvidence: readNativeGeometryEvidence });
  const host = {
    width: 800,
    scale: 1,
    dpr: 1,
    fontEpoch: 0,
    decodedResourceEpoch: 0,
    fontKey: 'f',
    textBoundaryIdentity: Object.freeze({}),
    measurementPolicy: Object.freeze({}),
  };
  try {
    await e.load(new Uint8Array(bytes), { format: 'hwp5', editable: true });
    lease = e.acquireInputSurface({ commitComposition: () => 'unchanged', cancelComposition() {} });
    let state = e.getEditorState(),
      projection = readGeometryProjection(lease, state);
    const original = cloneData(state.content);
    assert.equal(original.paragraphs.length, 65);
    if (mode === 'registered') assert(projection);
    else assert.equal(projection, undefined);
    return {
      e,
      original,
      get content() {
        return state.content;
      },
      async step(message, expected, kind) {
        const before = state,
          prior = projection;
        const oldScope = prior && deps.prepare(prior.content, prior.evidence, host);
        const oldStamps = oldScope && before.content.paragraphs.map((p) => oldScope.stamp(p));
        const result = await lease.request(message, {
          token: state.token,
          coordinates: 'legacy-native',
        });
        assert.equal(result.status, 'committed-with-snapshot', JSON.stringify(result.error));
        state = e.getEditorState();
        projection = readGeometryProjection(lease, state);
        assertFullSnapshot(state.content, expected, before.content);
        assert.equal(
          result.reply.content,
          state.content,
          'command reply keeps the complete owned view',
        );
        if (mode === 'registered' && message.kind === 'splice' && kind === 'exclusive-text') {
          assert.equal(
            state.content.characterShapes,
            before.content.characterShapes,
            'COW keeps stable header identity',
          );
          assert.equal(
            state.capabilities,
            before.capabilities,
            'COW preserves stable capabilities',
          );
        }
        if (mode !== 'registered') {
          assert.equal(projection, undefined);
          return;
        }
        assert(projection);
        assert.equal(projection.content, state.content);
        assert.equal(
          readNativeGeometryEvidence(prior.evidence, prior.content),
          undefined,
          'old capsule revoked',
        );
        assert.equal(projection.evidence.kind, kind);
        const scope = deps.prepare(projection.content, projection.evidence, host);
        assert(scope);
        if (kind === 'full-baseline') {
          assert.notEqual(projection.evidence.resourceLease, prior.evidence.resourceLease);
          assert.notEqual(scope.key, oldScope.key);
          assert.equal(projection.evidence.ownerTextRunGeneration, 0);
        } else {
          assert.equal(projection.evidence.resourceLease, prior.evidence.resourceLease);
          assert.equal(scope.key, oldScope.key);
          const generation = prior.evidence.ownerTextRunGeneration + 1;
          assert.equal(projection.evidence.ownerTextRunGeneration, generation);
          assert.equal(projection.evidence.beforeEpoch, prior.evidence.nativeEpoch);
          assert.equal(projection.evidence.beforeRevision, before.nativeHistoryRevision);
          for (let i = 0; i < state.content.paragraphs.length; i++)
            assert.equal(
              scope.stamp(state.content.paragraphs[i]),
              i === paragraph ? 'native:' + generation : oldStamps[i],
            );
        }
      },
      async noop(kind) {
        const before = state;
        const result = await lease.request(
          { kind },
          { token: state.token, coordinates: 'legacy-native' },
        );
        assert.equal(result.status, 'known-no-op');
        state = e.getEditorState();
        assert.equal(state.content, before.content);
        assert.equal(state.nativeHistoryRevision, before.nativeHistoryRevision);
        projection = readGeometryProjection(lease, state);
        assert(projection);
      },
      async close() {
        lease.release();
        deps.clear();
        await e.dispose();
      },
    };
  } catch (error) {
    lease?.release();
    deps.clear();
    await e.dispose();
    throw error;
  }
}
for (const p of [4, 15, 18])
  test(`Noori owner ${p}: two splices / undo / redo / complete DTO / lease / stamps`, async () => {
    const s = await session(p);
    try {
      const at = p === 4 ? 2 : 0,
        first = insertExpected(s.original, p, at, '가'),
        second = insertExpected(first, p, at + 1, '나');
      await s.step(splice(p, at, '가'), first, 'exclusive-text');
      await s.step(splice(p, at + 1, '나'), second, 'exclusive-text');
      await s.step({ kind: 'undo' }, first, 'history-text');
      await s.step({ kind: 'undo' }, s.original, 'history-text');
      await s.step({ kind: 'redo' }, first, 'history-text');
      await s.step({ kind: 'redo' }, second, 'history-text');
    } finally {
      await s.close();
    }
  });
for (const overflow of [false, true])
  test(`Noori15: 40 type / 40 undo / ${overflow ? 'overflow' : 'branch'} no-op / rs recovery`, async () => {
    const s = await session();
    try {
      const expected = [s.original];
      for (let i = 0; i < 40; i++) {
        expected.push(insertExpected(expected.at(-1), 15, i, 'x'));
        await s.step(splice(15, i, 'x'), expected.at(-1), 'exclusive-text');
      }
      for (let i = 39; i >= 0; i--) await s.step({ kind: 'undo' }, expected[i], 'history-text');
      assert.equal(row(s.content, 15).text, row(s.original, 15).text);
      let before = s.original,
        at = 0;
      if (!overflow) {
        before = insertExpected(before, 15, 0, 'r');
        await s.step(splice(15, 0, 'r'), before, 'exclusive-text');
        at = 1;
      }
      await s.noop(overflow ? 'undo' : 'redo');
      const r = insertExpected(before, 15, at, 'r'),
        rs = insertExpected(r, 15, at + 1, 's');
      await s.step(splice(15, at, 'r'), r, 'full-baseline');
      await s.step(splice(15, at + 1, 's'), rs, 'exclusive-text');
    } finally {
      await s.close();
    }
  });
for (const mode of ['custom', 'unregistered'])
  test(`${mode}: real edits and history without registered capsule`, async () => {
    const s = await session(15, mode);
    try {
      const next = insertExpected(s.original, 15, 0, '가');
      await s.step(splice(15, 0, '가'), next);
      await s.step({ kind: 'undo' }, s.original);
      await s.step({ kind: 'redo' }, next);
    } finally {
      await s.close();
    }
  });
test('save / new Reader reopen: before-derived expected text and core fields', async () => {
  const s = await session(15);
  let reopened;
  try {
    let expected = s.original;
    expected = insertExpected(expected, 15, 0, '가');
    await s.step(splice(15, 0, '가'), expected, 'exclusive-text');
    const saved = await s.e.save({ allowStaleLayout: true });
    assert(saved.bytes instanceof Uint8Array);
    reopened = createEditor({
      runtimeFactory: () => createReaderEditorRuntime({ wasmModule: module }),
    });
    await reopened.load(saved.bytes, { format: 'hwp5', editable: true });
    const reopenedContent = reopened.getEditorState().content;
    const actual = cloneData(reopenedContent);
    assert.equal(actual.paragraphs.length, 65);
    assert.deepEqual(
      actual.paragraphs.map((p) => ({
        section: p.section,
        paragraph: p.paragraph,
        text: p.text,
        characterRanges: p.characterRanges,
      })),
      expected.paragraphs.map((p) => ({
        section: p.section,
        paragraph: p.paragraph,
        text: p.text,
        characterRanges: p.characterRanges,
      })),
    );
    assert.deepEqual(actual.characterShapes, expected.characterShapes);
    // Serialized record-node offsets are not stable across save; compare semantic topology.
    const topology = (tables) =>
      tables.map((t) => ({
        rows: t.rows,
        columns: t.columns,
        section: t.section,
        paragraph: t.paragraph,
        cells: t.cells.map((c) => ({
          row: c.row,
          column: c.column,
          rowSpan: c.rowSpan,
          columnSpan: c.columnSpan,
          paragraphs: c.paragraphs,
        })),
      }));
    assert.deepEqual(topology(actual.tables), topology(expected.tables));
    assert.notEqual(
      row(actual, 15).currentReference.scope,
      row(s.content, 15).currentReference.scope,
    );
  } finally {
    await reopened?.dispose();
    await s.close();
  }
});
