// Independent official UI synthetic export, not product-writer/reader self-consistency.
// Captured by Volta: table-cell-fill-dialog-r1/pattern-oracle/RAW-ORACLE.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observeTableCellAppearance } from '../../js/table-cell-appearance-observation.mjs';
const captured = JSON.parse(
  readFileSync(
    new URL('./fixtures/table-cell-appearance-observation.json', import.meta.url),
    'utf8',
  ),
);
const official = Object.freeze({
  version: '5.1.0.1',
  patternKind: 0,
  faceRaw: 0xffffff,
  hatchRaw: 0x999999,
  hwpSHA256: 'fb62737b6349c0482657852fca358ad146a4d13f514541e69019b14eb6e23e5f',
  hwpxSHA256: 'fb488413f36adf48c861a080fd931b156ab4fad0f17e2e57401379da954ec2f9',
});
function observation(version) {
  const content = structuredClone(captured.cases.hwp5);
  content.version = version;
  const cell = content.tables[0].cells.find((cell) => cell.listNode === 21);
  const style = content.hwp5BorderFillSources[cell.layoutSource.border_fill_id - 1];
  style.pattern = {
    background: official.faceRaw,
    foreground: official.hatchRaw,
    kind: official.patternKind,
  };
  return observeTableCellAppearance(content, { section: 0, tableNode: 20, listNode: 21 });
}
test('official HWP5 5.1.0.1 horizontal hatch raw0 must match its paired HWPX HORIZONTAL export', () => {
  const out = observation(official.version);
  assert.equal(out.fill.state, 'known');
  assert.equal(out.fill.kind, 'hatch');
  assert.equal(out.fill.pattern, 'HORIZONTAL');
  assert.equal(out.fill.background, '#ffffff');
  assert.equal(out.fill.color, '#999999');
  assert.equal(out.fill.raw.pattern.kind, 0);
});
test('version spelling alone cannot prove a fill without the current owner-bound resource', () => {
  for (const version of [official.version, undefined, 'unproven-version']) {
    const content = structuredClone(captured.cases.hwp5);
    content.version = version;
    delete content.hwp5BorderFillSources;
    const out = observeTableCellAppearance(content, { section: 0, tableNode: 20, listNode: 21 });
    assert.equal(out.fill.state, 'unavailable');
    assert.notEqual(out.fill.state, 'none');
  }
});
const oracle = JSON.parse(
  readFileSync(new URL('./fixtures/hwp5-official-hatch-oracle.json', import.meta.url), 'utf8'),
);
for (const swatch of oracle.swatches)
  test(`official paired six-swatch raw${swatch.raw} is ${swatch.hx}`, () => {
    const content = structuredClone(captured.cases.hwp5);
    content.version = official.version;
    const cell = content.tables[0].cells.find((cell) => cell.listNode === 21);
    const style = content.hwp5BorderFillSources[cell.layoutSource.border_fill_id - 1];
    style.pattern = {
      background: official.faceRaw,
      foreground: official.hatchRaw,
      kind: swatch.raw,
    };
    const out = observeTableCellAppearance(content, { section: 0, tableNode: 20, listNode: 21 });
    assert.equal(out.fill.state, 'known');
    assert.equal(out.fill.pattern, swatch.hx);
  });
for (const version of oracle.versions)
  test(`official current importer accepted header-only ${version.input} raw0 as HORIZONTAL`, () => {
    assert.equal(version.opened, true);
    assert.equal(version.outputVersion, '5.1.0.1');
    assert.equal(version.inputRaw, 0);
    assert.equal(version.outputRaw, 0);
    assert.equal(version.outputHatch, 'HORIZONTAL');
    const out = observation(version.input);
    assert.equal(out.fill.pattern, 'HORIZONTAL');
    assert.equal(Object.hasOwn(out.source, 'historicalProducerVerified'), false);
  });
