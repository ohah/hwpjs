import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createReaderRuntime } from '../../../../web/preview/reader-runtime.mjs';
import '../../src/runtime/reader-runtime.ts';

const baseline = JSON.parse(
  readFileSync(new URL('./legacy-parity-baseline.json', import.meta.url), 'utf8'),
);
import { artifact, modulePromise, fixture, ok, hash } from './runtime-test-fixtures.ts';

// This is a process/session identity delta, not an approved document support expansion.
// Keep the recorded full-reply digests untouched and compare every other byte/field.
const fullScopeParagraphs = [0, 1, 2, 3, 4, 5, 6];
const hwp5ScopeParagraphs = [
  [],
  fullScopeParagraphs,
  [0],
  [0],
  fullScopeParagraphs,
  fullScopeParagraphs,
  [],
  fullScopeParagraphs,
  [],
  fullScopeParagraphs,
];
function scopeAdjustedReply(reply: any, index: number, session: { scope?: string }) {
  const expected = hwp5ScopeParagraphs[index];
  assert(expected, 'the frozen sequence must have an explicit scope path inventory');
  const rows = reply.content?.paragraphs ?? [];
  const actual = rows.filter((row: any) => Object.hasOwn(row, 'currentReference'));
  assert.deepEqual(
    actual.map((row: any) => [row.section, row.paragraph]),
    expected.map((p) => [0, p]),
    'scope may differ only at the inventoried charshape paragraph reference paths',
  );
  const copy = structuredClone(reply);
  for (const paragraph of expected) {
    const original = rows.find(
      (row: any) => row.section === 0 && row.paragraph === paragraph,
    ).currentReference;
    assert.equal(typeof original.scope, 'string');
    assert.match(original.scope, /^[1-9][0-9]*$/);
    session.scope ??= original.scope;
    assert.equal(
      original.scope,
      session.scope,
      'reference scope is stable through window/edit/undo/redo',
    );
    copy.content.paragraphs.find(
      (row: any) => row.section === 0 && row.paragraph === paragraph,
    ).currentReference.scope = '1';
  }
  return copy;
}

for (const c of baseline.cases)
  test(
    c.format === 'hwp5'
      ? 'hwp5: pre-extraction wire exact session-scope delta and frozen remainder'
      : 'hwpx: pre-extraction full/window/edit/save/history wire baseline',
    async (t) => {
      // Recorded from the dirty source before extraction using the explicit fdbb artifact.
      // HWP5 JS API scopeSequence is process-global (js/hwp5-current-references.mjs:5,31).
      // Bun shares its module instance across files; prior integration editors consume scopes.
      // Only the seven inventoried currentReference.scope values are compared modulo identity.
      if (artifact !== baseline.artifact)
        return t.skip(
          'Frozen parity requires the recorded artifact; other fixtures run with the explicit candidate',
        );
      assert.equal(
        createHash('sha256').update(readFileSync(artifact)).digest('hex'),
        baseline.artifactHash,
      );
      const runtime = createReaderRuntime({ wasmModule: await modulePromise });
      const session: { scope?: string } = {};
      t.after(() => runtime.dispose());
      for (const [index, step] of c.steps.entries()) {
        const message =
          step.message.kind === 'load'
            ? { kind: 'load', format: c.format, bytes: readFileSync(c.fixture) }
            : step.message;
        const reply = await ok(runtime, message);
        const comparable = c.format === 'hwp5' ? scopeAdjustedReply(reply, index, session) : reply;
        assert.equal(
          hash(comparable),
          step.digest,
          `${step.message.kind}: frozen fields outside exact session-scope paths`,
        );
        assert.equal(reply.meta, undefined);
        if (c.format === 'hwp5' && index === 1) {
          // Reproduce the reported failure exactly: two prior HWP5 editor instances yield scope 3.
          const reported = structuredClone(comparable);
          for (const row of reported.content.paragraphs) row.currentReference.scope = '3';
          assert.equal(
            hash(reported),
            '7ef7b3f06855dc03158ff261dd0c4096d60d87e79131ef562a262fb442244204',
          );
          // Scope adjustment must not hide any source/epoch/owner delta or mixed session tokens.
          for (const field of ['id', 'epoch', 'selectionOwner']) {
            const corrupt = structuredClone(comparable);
            if (field === 'selectionOwner') corrupt.content.paragraphs[0].selectionOwner = 'WRONG';
            else corrupt.content.paragraphs[0].currentReference[field] = '999999';
            assert.notEqual(
              hash(scopeAdjustedReply(corrupt, index, {})),
              step.digest,
              `${field} remains fully checked`,
            );
          }
          const mixed = structuredClone(reply);
          mixed.content.paragraphs[1].currentReference.scope = String(BigInt(session.scope!) + 1n);
          assert.throws(() => scopeAdjustedReply(mixed, index, {}), /reference scope is stable/);
          t.diagnostic(
            JSON.stringify({
              scope: session.scope,
              rawEnableHash: hash(reply),
              frozenEnableHash: hash(comparable),
              exactDeltaPaths: fullScopeParagraphs.map(
                (p) => `/content/paragraphs/${p}/currentReference/scope`,
              ),
              supportExpansion: false,
            }),
          );
        }
      }
    },
  );

test('real HWP5 reference scope differs between runtime instances and rejects foreign tokens before mutation', async (t) => {
  const wasmModule = await modulePromise;
  const a = createReaderRuntime({ wasmModule }),
    b = createReaderRuntime({ wasmModule });
  t.after(async () => {
    await a.dispose();
    await b.dispose();
  });
  const original = fixture('hwp5');
  for (const r of [a, b]) await ok(r, { kind: 'load', format: 'hwp5', bytes: original });
  const aState = await ok(a, { kind: 'enable' }),
    bState = await ok(b, { kind: 'enable' });
  const aRef = aState.content.paragraphs[1].currentReference,
    bRef = bState.content.paragraphs[1].currentReference;
  assert.notEqual(aRef.scope, bRef.scope);
  assert.deepEqual(
    { ...aRef, scope: undefined },
    { ...bRef, scope: undefined },
    'only instance scope distinguishes equivalent source tokens',
  );
  assert.equal(
    (await ok(a, { kind: 'query-current-text', reference: aRef })).text,
    (await ok(b, { kind: 'query-current-text', reference: bRef })).text,
  );
  for (const [runtime, foreign] of [
    [a, bRef],
    [b, aRef],
  ] as const) {
    const query = await runtime.request({ kind: 'query-current-text', reference: foreign });
    assert.equal(query.error, 'InvalidCurrentReferenceScope');
    const splice = await runtime.request({
      kind: 'splice-current',
      reference: foreign,
      startUnit: 0,
      endUnit: 0,
      text: 'FORBIDDEN',
    });
    assert.equal(splice.error, 'InvalidCurrentReferenceScope');
    assert.equal(splice.applied, false);
    const saved = await ok(runtime, { kind: 'save' });
    assert.equal(saved.historyRevision, 0);
    assert.deepEqual(Buffer.from(saved.bytes), original);
  }
});
