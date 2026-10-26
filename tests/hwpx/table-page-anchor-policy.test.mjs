import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tablePageAnchorSupported,
  tablePageAnchorError,
} from '../../web/preview/table-page-anchor-policy.mjs';

test('inline anchors ignore floating declarations without weakening floating guards', () => {
  const source = {
    geometry: {
      width_relative: 4,
      height_relative: 2,
      treat_as_character: false,
      vertical_offset: 0,
    },
    text_wrap: 1,
    text_flow: 0,
    flow_with_text: true,
    allow_overlap: false,
    vertical_relative: 2,
    horizontal_relative: 3,
    vertical_alignment: 0,
    horizontal_alignment: 0,
  };
  assert.equal(tablePageAnchorSupported(source), true);
  for (const [name, value] of [
    ['text_wrap', 0],
    ['text_flow', 1],
    ['flow_with_text', false],
    ['allow_overlap', true],
    ['vertical_relative', 0],
    ['horizontal_alignment', 4],
  ]) {
    const changed = structuredClone(source);
    changed[name] = value;
    assert.equal(tablePageAnchorSupported(changed), false, name);
    changed.geometry.treat_as_character = true;
    assert.equal(tablePageAnchorSupported(changed), true, `inline ${name}`);
  }
  const offset = structuredClone(source);
  offset.geometry.vertical_offset = 0xffffffff;
  assert.equal(tablePageAnchorSupported(offset), true);
  offset.geometry.treat_as_character = true;
  assert.equal(tablePageAnchorSupported(offset), true);
  offset.geometry.width_relative = 0;
  assert.equal(tablePageAnchorSupported(offset), false);
  assert.equal(tablePageAnchorSupported(null), false);
});

test('table anchor diagnostics apply explicit page and paragraph policies without type coercion', () => {
  const base = {
    geometry: {
      width_relative: 4,
      height_relative: 2,
      treat_as_character: false,
      vertical_offset: 0,
    },
    text_wrap: 1,
    text_flow: 0,
    flow_with_text: true,
    allow_overlap: false,
    vertical_relative: 2,
    horizontal_relative: 3,
    vertical_alignment: 0,
    horizontal_alignment: 0,
  };
  const expectedPolicy = (source) => {
    const geometry = source?.geometry;
    if (!geometry || geometry.width_relative !== 4 || geometry.height_relative !== 2) return false;
    if (geometry.treat_as_character === true) return true;
    const offset = geometry.vertical_offset;
    const signed = Number.isInteger(offset) && offset >= -0x80000000 && offset <= 0xffffffff;
    return (
      geometry.treat_as_character === false &&
      signed &&
      source.text_wrap === 1 &&
      source.text_flow === 0 &&
      source.flow_with_text === true &&
      source.allow_overlap === false &&
      [1, 2].includes(source.vertical_relative) &&
      [0, 1, 2, 3].includes(source.horizontal_relative) &&
      (source.vertical_relative === 2
        ? source.vertical_alignment === 0
        : [0, 1, 2].includes(source.vertical_alignment)) &&
      [0, 1, 2].includes(source.horizontal_alignment)
    );
  };
  for (const inline of [true, false, null, 0, 'false']) {
    for (const key of [
      ...Object.keys(base).filter((key) => key !== 'geometry'),
      ...Object.keys(base.geometry),
    ]) {
      for (const value of [
        undefined,
        null,
        false,
        true,
        -1,
        0,
        1,
        2,
        3,
        4,
        '1',
        0xffffffff,
        0x100000000,
        NaN,
      ]) {
        const row = structuredClone(base);
        row.geometry.treat_as_character = inline;
        if (key in row.geometry) row.geometry[key] = value;
        else row[key] = value;
        assert.equal(tablePageAnchorSupported(row), expectedPolicy(row), `${key}:${String(value)}`);
      }
    }
  }
  assert.equal(tablePageAnchorError({ ...base, vertical_relative: 1 }), null);
  assert.equal(
    tablePageAnchorError({ ...base, vertical_alignment: 2 }),
    'UnsupportedTableVerticalAlignment',
  );
});
