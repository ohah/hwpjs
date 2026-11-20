import test from 'node:test';
import assert from 'node:assert/strict';
import { hwp5ChartRasterSize as size } from '../src/hwp5-chart-raster-size.mjs';
test('default dialog geometry uses canonical pixel density and half-up short edge', () => {
  assert.deepEqual(size({ width: 20000, height: 12000 }), { width: 267, height: 160 });
});
test('common geometry rounds only raster pixels and retains document geometry', () => {
  const d = { width: 36000, height: 22000 };
  assert.deepEqual(size(d), { width: 480, height: 293 });
  assert.deepEqual(d, { width: 36000, height: 22000 });
});
test('non-reducible aspect is supported without changing document units', () => {
  assert.deepEqual(size({ width: 20001, height: 12000 }), { width: 267, height: 160 });
});
test('portrait swaps axes and half-pixel ties round up', () => {
  assert.deepEqual(size({ width: 12000, height: 20001 }), { width: 160, height: 267 });
  assert.deepEqual(size({ width: 12800, height: 6400 }), { width: 171, height: 86 });
});
test('small geometry uses the existing minimum and large geometry respects pixel budget', () => {
  assert.deepEqual(size({ width: 1, height: 1 }), { width: 64, height: 64 });
  assert.deepEqual(size({ width: 200000, height: 120000 }), { width: 2048, height: 1229 });
});
test('extreme aspect that cannot meet both pixel bounds refuses', () => {
  assert.throws(() => size({ width: 1, height: 1000 }), /AspectUnavailable/);
});
test('malformed document units refuse before sizing', () => {
  for (const value of [NaN, Infinity, 0, -1, 1.5, 2147483648])
    assert.throws(() => size({ width: value, height: 12000 }), /Geometry/);
});
