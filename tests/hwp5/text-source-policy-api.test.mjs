import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp');
test('native text source policy queries preserve source save and history and keep supported input available', async () => {
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    assert.equal(editor.supportsTextSourcePolicy(), true);
    editor.validateTextSourcePolicy(0);
    for (const invalid of [-1, NaN, Infinity, 0.5, 2 ** 32, '0'])
      assert.throws(() => editor.validateTextSourcePolicy(invalid), /Invalid section/);
    assert.throws(() => editor.validateTextSourcePolicy(editor.sectionCount()), /InvalidSection/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false);
    assert.equal(editor.redo(), false);
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: '허가😀' });
    assert.equal(editor.undo(), true);
    editor.validateTextSourcePolicy(0);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
  } finally {
    editor.close();
  }
  assert.throws(() => editor.validateTextSourcePolicy(0), /EditorClosed/);
});

test('actual unclosed click field keeps strict policy and protected owner refusal without damaging original history', async (t) => {
  const path = 'reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp';
  const { existsSync } = await import('node:fs');
  if (!existsSync(path)) return t.skip('RHWP reference fixture unavailable');
  const original = readFileSync(path);
  const { inspect, records } = await import('./style-preservation/text-record-oracle.mjs');
  const sections = inspect(original).sections;
  assert.equal(sections.length, 1);
  const markers = [];
  let paragraph = -1;
  for (const record of records(sections[0].bytes)) {
    if (record.tag === 66) paragraph++;
    if (record.tag !== 67) continue;
    for (let unit = 0; unit < record.payload.length / 2;) {
      const code = record.payload.readUInt16LE(unit * 2);
      const width = code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
      assert(unit * 2 + width * 2 <= record.payload.length);
      if (code === 3 || code === 4)
        markers.push({ code, paragraph, unit, id: record.payload.readUInt32LE(unit * 2 + 2) });
      unit += width;
    }
  }
  assert.equal(markers.filter((row) => row.code === 3).length, 29);
  assert.equal(markers.filter((row) => row.code === 4).length, 28);
  assert(
    markers.some(
      (row) => row.code === 3 && row.paragraph === 52 && row.unit === 0 && row.id === 0x25636c6b,
    ),
  );
  const editor = await createExperimentalHwp5Editor(wasm, original);
  try {
    editor.enableHistory();
    assert.throws(() => editor.validateTextSourcePolicy(0), /UnsupportedCrossParagraphField/);
    assert.throws(
      () => editor.splice({ section: 0, paragraph: 52, startUnit: 0, endUnit: 0, text: '검증😀' }),
      /UnsupportedCrossParagraphField/,
    );
    assert.deepEqual(Buffer.from(editor.save().bytes), original);
    assert.equal(editor.undo(), false);
    assert.equal(editor.redo(), false);
  } finally {
    editor.close();
  }
  assert.deepEqual(readFileSync(path), original);
});

test('text source policy optional ABI absence is explicit rather than a positive permission', async () => {
  const old = Buffer.from(wasm),
    name = 'hwp5_edit_validate_text_source_policy';
  const at = old.indexOf(name);
  assert(at >= 0);
  old[at] = 'x'.charCodeAt(0);
  const module = new WebAssembly.Module(old);
  assert.equal(
    WebAssembly.Module.exports(module).some((row) => row.name === name),
    false,
  );
  const editor = await createExperimentalHwp5Editor(module, input);
  try {
    assert.equal(editor.supportsTextSourcePolicy(), false);
    assert.throws(() => editor.validateTextSourcePolicy(0), /Hwp5TextSourcePolicyAbiUnavailable/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
  }
});
