import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { verifySplit } from "./style-preservation/structure-record-oracle.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
function independent(bytes) {
  const result = [], parents = [], anchors = new Map();
  let paragraph = -1;
  for (const [index, record] of records(bytes).entries()) {
    parents.length = record.level;
    const parent = parents.at(-1);
    if (record.tag === 66) paragraph++;
    parents.push({ index, tag: record.tag, paragraph });
    if (record.tag === 67) {
      const found = [];
      for (let unit = 0; unit < record.payload.length / 2;) {
        const code = record.payload.readUInt16LE(unit * 2);
        if (code === 2 && record.payload.readUInt32LE(unit * 2 + 2) === 0x636f6c64) found.push(unit);
        unit += code >= 32 || [0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31].includes(code) ? 1 : 8;
      }
      anchors.set(parent.index, found);
    }
    if (record.tag !== 71 || record.payload.readUInt32LE(0) !== 0x636f6c64) continue;
    assert.equal(parent?.tag, 66);
    const raw = record.payload.subarray(4), low = raw.readUInt16LE(0), count = (low >>> 2) & 255;
    assert(count > 0);
    const same_width = Boolean(low & 4096), columns = [];
    let offset = 2, spacing = null, high;
    if (count < 2 || same_width) { spacing = raw.readInt16LE(offset); offset += 2; high = raw.readUInt16LE(offset); offset += 2; }
    else {
      high = raw.readUInt16LE(offset); offset += 2;
      for (let i = 0; i < count; i++) { columns.push({ width: raw.readUInt16LE(offset), gap: raw.readUInt16LE(offset + 2) }); offset += 4; }
    }
    const line_type = raw[offset++], line_width = raw[offset++], color = raw.readUInt32LE(offset); offset += 4;
    assert.equal(anchors.get(parent.index)?.length, 1);
    result.push({ current_paragraph: parent.paragraph, current_unit: anchors.get(parent.index)[0], source_node: index, paragraph_node: parent.index, flags: (high * 65536 + low) >>> 0, count, kind: low & 3, direction: (low >>> 10) & 3, same_width, spacing, columns, line_type, line_width, color, extra_bytes: raw.length - offset });
  }
  return result;
}
test("actual HWP5 column source fields and parents match independent CFB Node oracle", async () => {
  let checked = 0;
  for (const name of ["multicolumns", "multicolumns-widths", "multicolumns-in-common-controls", "multicolumns-layout"]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`), before = Buffer.from(input), parsed = inspect(input);
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      for (const [section, value] of parsed.sections.entries()) {
        const expected = independent(value.bytes), actual = editor.columnSources(section);
        assert.deepEqual(actual, expected, `${name}:${section}`);
        for (const row of expected) { assert.throws(() => assert.deepEqual(actual, expected.map(value => value === row ? { ...value, count: value.count + 1 } : value))); checked++; }
      }
      assert.deepEqual(Buffer.from(editor.save().bytes), before);
      assert.deepEqual(input, before);
      if (["multicolumns", "multicolumns-widths"].includes(name)) {
        editor.enableHistory();
        const original = editor.columnSources(0);
        const flow = editor.paragraphFlow(0);
        assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 7 }), /UnsupportedColumnAnchorRelocation/);
        assert.deepEqual(editor.paragraphFlow(0), flow);
        editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 8 });
        const splitSaved = editor.save({ allowStaleLayout: true }).bytes;
        verifySplit(input, splitSaved, 0, 1, 8);
        assert.throws(() => verifySplit(input, splitSaved, 0, 1, 7));
        const expected = original.map(row => ({ ...row, current_paragraph: row.current_paragraph > 1 ? row.current_paragraph + 1 : row.current_paragraph }));
        assert.deepEqual(editor.columnSources(0), expected);
        assert.equal(editor.columnSources(0).some(row => row.current_paragraph === 2), false);
        const suffix = editor.text(0, 2), prefix = "단후속😀";
        editor.splice({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0, text: prefix });
        assert.equal(editor.text(0, 2), prefix + suffix);
        assert.deepEqual(editor.columnSources(0), expected);
        const saved = editor.save({ allowStaleLayout: true }).bytes;
        const expectedLeftText = editor.text(0, 1);
        const reopened = await createExperimentalHwp5Editor(wasm, saved);
        try {
          assert.deepEqual(reopened.columnSources(0), independent(inspect(saved).sections[0].bytes));
          assert.equal(reopened.text(0, 2), prefix + suffix);
          assert.equal(reopened.text(0, 1), expectedLeftText, "saved left must reflect the split rather than retain original source text");
        }
        finally { reopened.close(); }
        assert.equal(editor.undo(), true);
        assert.equal(editor.text(0, 2), suffix);
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.columnSources(0), original);
        assert.deepEqual(Buffer.from(editor.save().bytes), before);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.columnSources(0), expected);
        assert.equal(editor.redo(), true);
        assert.equal(editor.text(0, 2), prefix + suffix);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      }
    } finally { editor.close(); }
  }
  assert(checked > 0);
});
