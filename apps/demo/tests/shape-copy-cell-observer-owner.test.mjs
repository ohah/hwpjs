import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createTableCellAppearanceObserver,
  observeTableCellAppearance,
} from '../../../js/table-cell-appearance-observation.mjs';
import { strictObserve } from './shape-copy-cell-observer-preimage.mjs';
const cases = JSON.parse(
  await readFile(
    new URL(
      '../../../tools/tests/fixtures/table-cell-appearance-observation.json',
      import.meta.url,
    ),
    'utf8',
  ),
).cases;
const target = (f) => ({
  section: 0,
  tableNode: f === 'hwp5' ? 20 : 59,
  listNode: f === 'hwp5' ? 21 : 66,
});
function known(actual, format) {
  assert.equal(actual.state, 'known');
  assert.equal(actual.fill.state, 'known');
  assert.equal(actual.fill.kind, 'solid');
  assert.equal(actual.fill.color, '#e7e7a5');
  assert.equal(actual.source.section, 0);
  assert.equal(actual.source.tableNode, target(format).tableNode);
  assert.equal(actual.source.listNode, target(format).listNode);
  assert.deepEqual(
    ['left', 'right', 'top', 'bottom'].map((k) => actual.edges[k].style),
    ['SOLID', 'SOLID', 'SOLID', 'SOLID'],
  );
  assert.deepEqual(
    ['left', 'right', 'top', 'bottom'].map((k) => actual.edges[k].color),
    format === 'hwp5'
      ? ['#654321', '#654321', '#654321', '#654321']
      : ['#654321', '#000000', '#654321', '#000000'],
  );
  assert.deepEqual(
    ['left', 'right', 'top', 'bottom'].map((k) => actual.edges[k].width),
    format === 'hwp5' ? [70, 70, 70, 70] : [70, 15, 70, 12],
  );
}
function check(content, format, available) {
  const owner = target(format),
    strict = strictObserve(content, owner),
    actual = observeTableCellAppearance(content, owner),
    indexed = createTableCellAppearanceObserver(content)(owner);
  if (available) {
    known(strict, format);
    known(actual, format);
    known(indexed, format);
  } else {
    for (const value of [strict, actual, indexed]) {
      assert.equal(value.state, 'unavailable');
      assert.equal(value.reason, 'MissingOrAmbiguousCellOwner');
      assert.equal(value.fill.kind, 'unknown');
    }
  }
  assert.deepEqual(
    actual,
    strict,
    'actual frozen strict function, not another wrapper of candidate factory',
  );
  assert.deepEqual(indexed, strict);
}
for (const format of ['hwp5', 'hwpx']) {
  test('independent explicit known values + frozen preimage baseline/' + format, () =>
    check(structuredClone(cases[format]), format, true),
  );
  for (const field of ['section', 'tableNode']) {
    test(
      'strict numeric owner/' + format + '/' + field + '/malformed-only numeric string -> refusal',
      () => {
        const c = structuredClone(cases[format]);
        c.tables[0][field] = String(c.tables[0][field]);
        check(c, format, false);
      },
    );
    for (const order of ['before', 'after'])
      test(
        'strict numeric owner/' +
          format +
          '/' +
          field +
          '/valid plus numeric-string decoy ' +
          order +
          ' -> known',
        () => {
          const c = structuredClone(cases[format]),
            decoy = structuredClone(c.tables[0]);
          decoy[field] = String(decoy[field]);
          if (order === 'before') c.tables.unshift(decoy);
          else c.tables.push(decoy);
          check(c, format, true);
        },
      );
  }
  test('strict owner/' + format + '/duplicate valid numeric tables -> ambiguous', () => {
    const c = structuredClone(cases[format]);
    c.tables.push(structuredClone(c.tables[0]));
    check(c, format, false);
  });
  test('strict owner/' + format + '/numeric-string LIST only -> refusal', () => {
    const c = structuredClone(cases[format]);
    c.tables[0].cells.find((v) => v.listNode === target(format).listNode).listNode = String(
      target(format).listNode,
    );
    check(c, format, false);
  });
  test('strict owner/' + format + '/valid LIST plus numeric-string LIST decoy -> known', () => {
    const c = structuredClone(cases[format]),
      decoy = structuredClone(
        c.tables[0].cells.find((v) => v.listNode === target(format).listNode),
      );
    decoy.listNode = String(decoy.listNode);
    c.tables[0].cells.push(decoy);
    check(c, format, true);
  });
  test('strict owner/' + format + '/duplicate valid numeric LIST -> ambiguous', () => {
    const c = structuredClone(cases[format]);
    c.tables[0].cells.push(
      structuredClone(c.tables[0].cells.find((v) => v.listNode === target(format).listNode)),
    );
    check(c, format, false);
  });
}
for (const invalid of [null, undefined, -1, 0.5, Infinity, NaN, 4294967296])
  test('uint owner malformed decoy is ignored without guessing/' + String(invalid), () => {
    const c = structuredClone(cases.hwpx),
      decoy = structuredClone(c.tables[0]);
    decoy.section = invalid;
    c.tables.unshift(decoy);
    check(c, 'hwpx', true);
  });
test('owner index never coerces object owner to a string or to a number', () => {
  const c = structuredClone(cases.hwpx),
    decoy = structuredClone(c.tables[0]);
  let coerced = 0;
  decoy.section = {
    toString() {
      coerced++;
      return '0';
    },
  };
  c.tables.unshift(decoy);
  check(c, 'hwpx', true);
  assert.equal(coerced, 0);
});
