import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownObservation, isOwnedImmutableObservation } from '../../src/state/owned.ts';
import {
  createParagraphRowLookup,
  uniqueParagraphRow,
} from '../../src/internal/paragraph-index.ts';
import { validateSelection } from '../../src/commands/selection.ts';
import type { SelectionTarget } from '../../src/commands/commands.ts';
import type { EditorState } from '../../src/state/editor-state.ts';

const row = (section = 0, paragraph = 0, extra = {}) => ({
  section,
  paragraph,
  text: 'A😀B',
  editable: true,
  selectionOwner: `section:${section}:body`,
  ...extra,
});
const owned = <T>(value: T): T => ownObservation(value)();
const target = (extra = {}) =>
  ({
    editorId: 'editor',
    documentId: 'document',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
    format: 'hwp5',
    coordinateSpace: 'display',
    affinity: 'forward',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    owner: 'section:0:body',
    ...extra,
  }) as SelectionTarget;
const state = (paragraphs: unknown, branded = true) =>
  ({
    editorId: 'editor',
    documentId: 'document',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
    content: branded ? owned({ format: 'hwp5', paragraphs }) : { format: 'hwp5', paragraphs },
  }) as unknown as EditorState;
const oldLookup = (rows: ReturnType<typeof row>[] | undefined, s: number, p: number) => {
  const matches = rows?.filter((row) => row.section === s && row.paragraph === p);
  return matches?.length === 1 ? matches[0] : undefined;
};
const outcome = (fn: () => unknown) => {
  try {
    return { value: fn() };
  } catch (error) {
    return { name: (error as Error).name, message: (error as Error).message };
  }
};

test('only canonical owned immutable membership qualifies; frozen input gains no brand', () => {
  const external = Object.freeze([Object.freeze(row())]);
  assert.equal(isOwnedImmutableObservation(external), false);
  const internal = owned([row()]);
  assert.equal(isOwnedImmutableObservation(internal), true);
  assert.equal(isOwnedImmutableObservation(internal[0]), true);
  assert.equal(uniqueParagraphRow(internal, 0, 0), internal[0]);
  assert.equal(isOwnedImmutableObservation(external), false);
});

test('same snapshot builds once; n/2n/4n actual row visits stay linear', () => {
  for (const n of [32, 64, 128]) {
    const visits = { index: 0, fallback: 0 };
    const lookup = createParagraphRowLookup((phase) => visits[phase]++);
    const rows = owned(Array.from({ length: n }, (_, p) => row(0, p)));
    for (let p = 0; p < n; p++) assert.equal(lookup(rows, 0, p), rows[p]);
    assert.deepEqual(visits, { index: n, fallback: 0 });
    for (let p = n - 1; p >= 0; p--) assert.equal(lookup(rows, 0, p), rows[p]);
    assert.deepEqual(visits, { index: n, fallback: 0 });
    console.log(
      JSON.stringify({
        scope: 'paragraph-index-builder-only',
        n,
        queries: n * 2,
        indexRowVisits: visits.index,
        fallbackRowVisits: visits.fallback,
      }),
    );
  }
});

test('new array snapshot rebuilds even when owned rows are structurally shared', () => {
  let visits = 0;
  const lookup = createParagraphRowLookup(() => visits++);
  const first = owned([row(), row(0, 1)]);
  const second = owned([first[0], first[1], row(0, 2)]);
  assert.equal(lookup(first, 0, 1), first[1]);
  assert.equal(lookup(second, 0, 2), second[2]);
  assert.equal(lookup(first, 0, 1), first[1]);
  assert.equal(visits, 5);
  assert.notEqual(first, second);
});

test('duplicate sentinel never selects first or last match', () => {
  const rows = owned([row(0, 1), row(0, 1, { text: 'other' }), row(0, 2)]);
  assert.equal(uniqueParagraphRow(rows, 0, 1), undefined);
  assert.equal(uniqueParagraphRow(rows, 0, 2), rows[2]);
  assert.equal(uniqueParagraphRow(rows, 1, 2), undefined);
});

test('numeric nested keys avoid concatenation collisions and preserve -0 equality', () => {
  const rows = owned([row(1, 23), row(12, 3), row(Number.MAX_SAFE_INTEGER, 0)]);
  for (const r of rows) assert.equal(uniqueParagraphRow(rows, r.section, r.paragraph), r);
  assert.equal(uniqueParagraphRow(owned([row(-0, 0), row(0, -0)]), 0, 0), undefined);
});

test('unbranded mutable and merely frozen rows always use current filter result', () => {
  const visits = { index: 0, fallback: 0 };
  const lookup = createParagraphRowLookup((phase) => visits[phase]++);
  const rows = [row()];
  assert.equal(lookup(rows, 0, 0), rows[0]);
  rows.push(row());
  assert.equal(lookup(rows, 0, 0), undefined);
  const frozen = Object.freeze([Object.freeze(row())]) as unknown as ReturnType<typeof row>[];
  assert.equal(lookup(frozen, 0, 0), frozen[0]);
  assert.equal(lookup(frozen, 0, 0), frozen[0]);
  assert.deepEqual(visits, { index: 0, fallback: 5 });
});

test('sparse owned arrays and malformed branded coordinates retain filter behavior', () => {
  // oxlint-disable-next-line unicorn/no-new-array -- Sparse slots are intentional; Array.from would change the regression.
  const sparse = new Array<ReturnType<typeof row>>(3);
  sparse[2] = row();
  const cases = [owned(sparse), owned([row(), row(0, 1.5)]), owned([row(), row(-1, 0)])];
  for (const rows of cases) assert.equal(uniqueParagraphRow(rows, 0, 0), oldLookup(rows, 0, 0));
});

test('NaN/string coordinates and throwing external accessors keep prior semantics', () => {
  const malformed = [row(NaN, 0), row(0, 0), row(0, '0' as unknown as number)];
  assert.equal(uniqueParagraphRow(malformed, 0, 0), oldLookup(malformed, 0, 0));
  const error = new Error('external accessor');
  const rows = [
    Object.defineProperty(row(), 'section', {
      get() {
        throw error;
      },
    }),
  ];
  assert.throws(
    () => uniqueParagraphRow(rows, 0, 0),
    (e) => e === error,
  );
  const revoked = Proxy.revocable([row()], {});
  revoked.revoke();
  assert.deepEqual(
    outcome(() => uniqueParagraphRow(revoked.proxy, 0, 0)),
    outcome(() => oldLookup(revoked.proxy, 0, 0)),
  );
  const nil = [row(), null] as unknown as ReturnType<typeof row>[];
  assert.deepEqual(
    outcome(() => uniqueParagraphRow(nil, 0, 0)),
    outcome(() => oldLookup(nil, 0, 0)),
  );
});

test('non-array custom filter method is invoked exactly as before', () => {
  let calls = 0;
  const rows = {
    filter() {
      calls++;
      return [row()];
    },
  } as unknown as ReturnType<typeof row>[];
  assert.equal(uniqueParagraphRow(rows, 0, 0)?.paragraph, 0);
  assert.equal(calls, 1);
  assert.equal(uniqueParagraphRow(undefined, 0, 0), undefined);
});

for (const [name, rows, patch, editable, error] of [
  [
    'stale before malformed coordinate',
    [row()],
    { operationRevision: 0, startUnit: -1 },
    true,
    'StaleTarget',
  ],
  [
    'space before malformed coordinates',
    [row()],
    { coordinateSpace: 'source', startUnit: -1 },
    true,
    'InvalidCoordinateSpace',
  ],
  ['coordinate before null row', [null], { startUnit: -1 }, true, 'InvalidTextPosition'],
  [
    'duplicate before editable and text',
    [row(0, 0, { editable: false, text: 1 }), row()],
    {},
    true,
    'InvalidSelectionOwner',
  ],
  ['missing owner', [row(0, 1)], {}, false, 'InvalidSelectionOwner'],
  [
    'clipped before editable',
    [row(0, 0, { clipped: true, editable: false })],
    {},
    true,
    'InvalidSelectionOwner',
  ],
  [
    'wrong owner before editable',
    [row(0, 0, { editable: false })],
    { owner: 'bad' },
    true,
    'InvalidSelectionOwner',
  ],
  [
    'editable before text range',
    [row(0, 0, { editable: false, text: 1 })],
    {},
    true,
    'SelectionNotEditable',
  ],
  ['invalid text', [row(0, 0, { text: 1 })], {}, false, 'InvalidTextPosition'],
  ['surrogate boundary', [row()], { startUnit: 2, endUnit: 2 }, true, 'InvalidScalarBoundary'],
] as const)
  test(`validation order: ${name}`, () => {
    for (const branded of [false, true]) {
      assert.throws(() => validateSelection(target(patch), state(rows, branded), editable), {
        message: error,
      });
    }
  });

test('full canonical validator uses new array after replacement and preserves row identity', () => {
  const first = state([row()]);
  const second = state([row(0, 0, { text: '' })]);
  assert.equal(
    validateSelection(target(), first),
    (first.content as { paragraphs: unknown[] }).paragraphs[0],
  );
  assert.equal(
    validateSelection(target(), second),
    (second.content as { paragraphs: unknown[] }).paragraphs[0],
  );
  assert.equal(validateSelection(target({ startUnit: 1, endUnit: 3 }), first).text, 'A😀B');
  assert.throws(() => validateSelection(target({ startUnit: 1, endUnit: 1 }), second), {
    message: 'InvalidTextPosition',
  });
});
