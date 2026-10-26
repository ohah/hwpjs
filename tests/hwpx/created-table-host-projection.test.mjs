import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCreatedTableHost } from '../../web/preview/created-table-host-projection.mjs';
const source = { section: 0, paragraph: 2, text: 'A😀BC' };
const table = (identity, anchorUnit) => ({ identity, anchorUnit, section: 0, hostParagraph: 2 });

test('generated host projection preserves source scalars and stable equal-anchor identities', () => {
  const tables = [table('9', 4), table('2', 1), table('18446744073709551615', 1)];
  const before = structuredClone({ source, tables });
  const result = projectCreatedTableHost(source, tables);
  assert.equal(result.text, 'A\ufffc\ufffc😀B\ufffcC');
  assert.deepEqual(
    result.anchors.map((a) => a.createdTableIdentity),
    ['2', '18446744073709551615', '9'],
  );
  assert.deepEqual(
    result.anchors.map((a) => a.unit),
    [1, 2, 6],
  );
  assert.equal(result.viewUnitForSource(1), 1);
  assert.equal(result.viewUnitForSource(1, 'after'), 3);
  assert.deepEqual(
    [1, 2, 3].map((unit) => result.sourceUnitForView(unit)),
    [1, 1, 1],
  );
  for (const unit of [0, 1, 3, 4, 5])
    for (const affinity of ['before', 'after']) {
      assert.equal(result.sourceUnitForView(result.viewUnitForSource(unit, affinity)), unit);
    }
  assert.deepEqual(
    result.sourceRunsForViewRange(0, result.text.length).map((run) => run.text),
    ['A', '😀B', 'C'],
  );
  assert.deepEqual(result.sourceRunsForViewRange(1, 3), []);
  assert.equal(result.sourceRunsForViewRange(3, 5)[0].text, '😀');
  assert.deepEqual({ source, tables }, before);
  assert.throws(() => result.sourceUnitForView(4), /InvalidCreatedTableHostProjection/);
  assert.throws(() => result.viewUnitForSource(2), /InvalidCreatedTableHostProjection/);
});

test('generated host projection handles windows empty hosts and refuses stale owners', () => {
  const window = projectCreatedTableHost({ ...source, textStartUnit: 10 }, [table('1', 11)]);
  assert.equal(window.sourceUnitForView(0), 10);
  assert.equal(window.viewUnitForSource(11, 'after'), 2);
  assert.equal(window.sourceRunsForViewRange(0, window.text.length).at(-1).sourceEnd, 15);
  const empty = projectCreatedTableHost({ ...source, text: '' }, [table('1', 0), table('2', 0)]);
  assert.equal(empty.text, '\ufffc\ufffc');
  assert.equal(empty.sourceUnitForView(2), 0);
  assert.equal(empty.viewUnitForSource(0, 'after'), 2);
  const plain = projectCreatedTableHost(source, []);
  assert.equal(plain.text, source.text);
  for (const tables of [
    [table('1', 2)],
    [table('0', 1)],
    [table('1', 1), table('1', 4)],
    [{ ...table('1', 1), section: 1 }],
    [{ ...table('1', 1), hostParagraph: 3 }],
    [table('1', 6)],
  ]) {
    assert.throws(
      () => projectCreatedTableHost(source, tables),
      /InvalidCreatedTableHostProjection/,
    );
  }
  assert.throws(() => plain.sourceRunsForViewRange(3, 1), /InvalidCreatedTableHostProjection/);
  assert.throws(() => plain.viewUnitForSource(1, 'unknown'), /InvalidCreatedTableHostProjection/);
});

test('host mappings are immutable value projections and agree with a linear boundary oracle', () => {
  const current = { ...source };
  const tables = Array.from({ length: 300 }, (_, index) =>
    table(String(index + 1), [0, 1, 3, 4, 5][index % 5]),
  );
  const result = projectCreatedTableHost(current, tables);
  current.text = 'replaced';
  for (const unit of [0, 1, 3, 4, 5])
    for (const affinity of ['before', 'after']) {
      const expected =
        unit +
        tables.filter(
          (table) => table.anchorUnit < unit || (affinity === 'after' && table.anchorUnit === unit),
        ).length;
      assert.equal(result.viewUnitForSource(unit, affinity), expected);
      assert.equal(result.sourceUnitForView(expected), unit);
    }
  assert.throws(() => result.viewUnitForSource(2), /InvalidCreatedTableHostProjection/);
  assert.equal(
    result
      .sourceRunsForViewRange(0, result.text.length)
      .map((run) => run.text)
      .join(''),
    source.text,
  );
});
