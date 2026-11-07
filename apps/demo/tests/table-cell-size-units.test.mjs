import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCellSize,
  parseCellSize,
  createCellSizeUnitDraft,
} from '../src/table-cell-size-units.ts';

// Literal expectations use 7200 units/inch and 25.4 mm/inch, not the production formatter as oracle.
for (const [raw, value] of [
  ['0', 0],
  ['0.01', 3],
  ['1.00', 283],
  ['4.53', 1284],
  ['74.00', 20976],
  ['15151690.18', 4294967295],
])
  test('mm literal ' + raw + ' rounds to independent expected HWPUNIT ' + value, () => {
    assert.equal(parseCellSize(raw, 'mm'), value);
  });
test('display labels and exact pt decimal conversion use integer arithmetic', () => {
  assert.equal(formatCellSize(7200, 'mm'), '25.40');
  assert.equal(formatCellSize(7200, 'pt'), '72');
  assert.equal(formatCellSize(3779, 'mm'), '13.33');
  assert.equal(formatCellSize(7086, 'mm'), '25.00');
  assert.equal(formatCellSize(180, 'mm'), '0.64');
  assert.equal(formatCellSize(0xffffffff, 'pt'), '42949672.95');
  assert.equal(parseCellSize('37.79', 'pt'), 3779);
  assert.equal(parseCellSize('37.7900', 'pt'), 3779);
  assert.equal(parseCellSize('.01', 'pt'), 1);
});
test('invalid syntax, precision, unit and u32 overflow never silently clamp or round pt', () => {
  for (const unit of ['mm', 'pt'])
    for (const text of [
      '',
      ' ',
      '1 ',
      ' 1',
      '-0',
      '-1',
      '+1',
      '1e2',
      'NaN',
      'Infinity',
      '.',
      '1..2',
      '1,23',
      '9'.repeat(65),
    ])
      assert.equal(parseCellSize(text, unit), null, unit + ' ' + text);
  for (const raw of ['1.000', '38.791', '.001']) assert.equal(parseCellSize(raw, 'mm'), null);
  for (const raw of ['38.791', '42949672.96', '9'.repeat(64)])
    assert.equal(parseCellSize(raw, 'pt'), null);
  assert.equal(parseCellSize('15151690.19', 'mm'), null);
  assert.equal(parseCellSize('1', 'inch'), null);
  for (const value of [-1, 0x100000000, NaN, Infinity, 1.1])
    assert.throws(() => formatCellSize(value, 'mm'));
  assert.throws(() => formatCellSize(1, 'inch'));
});
test('untouched rounded labels and any unit-only cycle preserve both exact originals', () => {
  const original = { width: 3779, height: 7086 },
    s = createCellSizeUnitDraft(original);
  original.height = 1; // Constructor owns scalar copies, not caller state.
  for (let i = 0; i < 30; i++) {
    for (const unit of ['pt', 'mm']) {
      assert.equal(s.changeUnit(unit), true);
      const labels = s.read();
      s.edit('width', labels.width);
      s.edit('height', labels.height);
      assert.deepEqual(s.points(), {
        widthPoints: '37.79',
        heightPoints: '70.86',
        dirty: { width: false, height: false },
      });
    }
  }
  assert.equal(s.read().height, '25.00');
});
test('changing and restoring an original rounded label restores exact raw size, not parsed rounded mm', () => {
  const s = createCellSizeUnitDraft({ width: 3779, height: 7086 });
  s.edit('height', '26.00');
  assert.equal(s.points().heightPoints, '73.7');
  assert.deepEqual(s.points().dirty, { width: false, height: true });
  s.edit('height', '25.00');
  assert.equal(s.points().heightPoints, '70.86');
  assert.deepEqual(s.points().dirty, { width: false, height: false });
});
test('canonical pending pt size survives lossy mm labels and repeated unchanged events without double rounding', () => {
  const s = createCellSizeUnitDraft({ width: 3, height: 7086 });
  s.changeUnit('pt');
  s.edit('width', '0.02');
  assert.equal(s.points().widthPoints, '0.02');
  for (let i = 0; i < 30; i++) {
    s.changeUnit('mm');
    assert.equal(s.read().width, '0.01');
    s.edit('width', '0.01');
    s.changeUnit('pt');
    assert.equal(s.read().width, '0.02');
    assert.equal(s.points().dirty.width, true);
  }
  s.edit('width', '0.03');
  assert.equal(s.points().dirty.width, false);
});
test('invalid input blocks unit change atomically and keeps lexical input until corrected', () => {
  const s = createCellSizeUnitDraft({ width: 3779, height: 7086 });
  s.edit('height', 'abc');
  const before = s.read();
  assert.equal(s.changeUnit('pt'), false);
  assert.equal(s.changeUnit('inch'), false);
  assert.deepEqual(s.read(), before);
  assert.throws(() => s.points());
  s.edit('height', '25.00');
  assert.equal(s.changeUnit('pt'), true);
  assert.equal(s.read().height, '70.86');
});
test('returned drafts and labels cannot mutate private canonical state', () => {
  const s = createCellSizeUnitDraft({ width: 3779, height: 7086 });
  const points = s.points();
  points.dirty.width = true;
  points.widthPoints = '0';
  assert.equal(s.points().widthPoints, '37.79');
  assert.equal(s.points().dirty.width, false);
  assert.throws(() => {
    s.read().unit = 'pt';
  });
  assert.equal(s.read().unit, 'mm');
});

test('formatting-only label edits preserve exact originals and pending integers behind colliding labels', () => {
  const s = createCellSizeUnitDraft({ width: 3, height: 7086 });
  s.edit('height', '25');
  assert.equal(s.points().heightPoints, '70.86');
  assert.equal(s.points().dirty.height, false);
  s.edit('height', '26.00');
  s.edit('height', '025.00');
  assert.equal(s.points().heightPoints, '70.86');
  s.changeUnit('pt');
  s.edit('width', '0.02');
  s.changeUnit('mm');
  s.edit('width', '00.01');
  assert.equal(s.points().widthPoints, '0.02');
  assert.equal(s.points().dirty.width, true);
});
