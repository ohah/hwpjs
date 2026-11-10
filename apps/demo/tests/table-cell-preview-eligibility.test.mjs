// Pure app-port contracts; these mocks do not execute Native or browser input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTableCellPropertiesPort,
  tableCellReason,
} from '../src/table-cell-properties-port.ts';
import { createTableCellAppearancePort } from '../src/table-cell-appearance-port.ts';
import { createTableCellBackgroundPort } from '../src/table-cell-background-port.ts';
import { createTableCellBorderPort } from '../src/table-cell-border-port.ts';
import { fixture, changed } from './table-cell-properties-fixture.mjs';

const unavailable = 'PreviewCellPropertiesUnavailable';
for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: denied preview cell disables all shared property presentations`, () => {
    const f = fixture(format),
      calls = [];
    f.api.canEditCellProperties = (section, listNode) => {
      calls.push([section, listNode]);
      return false;
    };
    for (const create of [
      createTableCellPropertiesPort,
      createTableCellAppearancePort,
      createTableCellBackgroundPort,
      createTableCellBorderPort,
    ]) {
      const p = create(f.editor, f.api);
      assert.equal(p.capture().reason, unavailable);
      assert.equal(p.presentation().enabled, false);
    }
    assert(calls.length > 0);
    assert(calls.every(([s, l]) => s === 0 && l === 82));
    assert.equal(f.mutationCalls().length, 0);
  });

  test(`${format}: allowed host guard preserves the existing mutation contract`, async () => {
    const f = fixture(format);
    f.api.canEditCellProperties = () => true;
    const p = createTableCellPropertiesPort(f.editor, f.api);
    assert.equal(p.presentation().enabled, true);
    const c = p.capture();
    assert.equal(c.reason, null);
    assert.equal((await p.apply(c, changed)).status, 'committed-with-snapshot');
    assert.equal(f.mutationCalls().length, 1);
  });
}

for (const guard of [
  () => false,
  () => undefined,
  () => {
    throw Error('view unavailable');
  },
]) {
  test('modal capture is revoked when preview permission changes without a Native state change', async () => {
    const f = fixture();
    let allow = true;
    f.api.canEditCellProperties = (...args) => (allow ? true : guard(...args));
    const p = createTableCellPropertiesPort(f.editor, f.api),
      c = p.capture();
    assert.equal(c.reason, null);
    allow = false;
    assert.equal(p.isCurrent(c), false);
    assert.equal(p.presentation().enabled, false);
    const result = await p.apply(c, changed);
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(result.error, unavailable);
    assert.equal(f.mutationCalls().length, 0);
  });
}

test('queue flush revocation prevents dispatch and allows a later fresh capture', async () => {
  const f = fixture();
  let allow = true;
  f.api.canEditCellProperties = () => allow;
  f.editor.update = async () => {
    allow = false;
  };
  const p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  assert.equal((await p.apply(c, changed)).error, unavailable);
  assert.equal(f.mutationCalls().length, 0);
  allow = true;
  f.editor.update = async () => {};
  assert.equal((await p.apply(p.capture(), changed)).status, 'committed-with-snapshot');
});

test('throwing guard getter fails closed for capture and presentation', () => {
  const f = fixture();
  Object.defineProperty(f.api, 'canEditCellProperties', {
    get() {
      throw Error('host gone');
    },
  });
  const p = createTableCellPropertiesPort(f.editor, f.api);
  assert.equal(p.capture().reason, unavailable);
  assert.equal(p.presentation().enabled, false);
  assert.equal(p.presentation().reason, tableCellReason(unavailable));
});

test('absent guard preserves headless presentation and apply', async () => {
  const f = fixture(),
    p = createTableCellPropertiesPort(f.editor, f.api);
  assert.equal(p.presentation().enabled, true);
  assert.equal(f.calls.length, 0);
  assert.equal((await p.apply(p.capture(), changed)).status, 'committed-with-snapshot');
});

test('read-only source remains queryable when preview eligibility permits the cell', () => {
  const f = fixture();
  f.state.content.readOnly = true;
  f.api.canEditCellProperties = () => true;
  const c = createTableCellPropertiesPort(f.editor, f.api).capture();
  assert.equal(c.reason, null);
  assert.equal(c.cell.width, 3779);
  assert.equal(c.writeReason, 'ReadOnlyDocument');
});
