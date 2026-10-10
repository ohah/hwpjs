import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records, paragraphRecords, expectedSection, encodeRecord } from "./style-preservation/text-record-oracle.mjs";

function expectedDefinition(input) {
  const before = inspect(input), section = before.sections[0].bytes;
  const field = records(section)[118];
  assert.equal(field.tag, 71); assert.equal(field.payload.readUInt32LE(0), 0x25666d75);
  const oldLength = field.payload.readUInt16LE(9) * 2;
  assert.equal(field.payload.subarray(11, 11 + oldLength).toString("utf16le"), "=SUM(B?:E?)??%g,;;67.5");
  const text = paragraphRecords(section, 23).direct.find(row => row.tag === 67).payload;
  let start, end;
  for (let unit = 0; unit < text.length / 2;) {
    const code = text.readUInt16LE(unit * 2), width = code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
    if (code === 3) { assert.equal(start, undefined); start = unit + width; }
    if (code === 4) { end = unit; break; }
    unit += width;
  }
  assert.equal(text.subarray(start * 2, end * 2).toString("utf16le"), "67.5");
  const projected = expectedSection(section, 23, start, end, "16.875", { skipLocalFieldAttributes: true });
  const command = Buffer.from("=AVG(B?:E?)??%g,;;16.875", "utf16le"), tail = field.payload.subarray(11 + oldLength);
  const payload = Buffer.concat([field.payload.subarray(0, 11), command, tail]);
  payload.writeUInt32LE(field.payload.readUInt32LE(4) | 0x8000, 4);
  payload.writeUInt16LE(command.length / 2, 9);
  const id = tail.readUInt32LE(0);
  let changed = 0;
  const expected = Buffer.concat(records(projected).map(row => {
    if (row.tag !== 71 || row.payload.readUInt32LE(0) !== 0x25666d75) return row.raw;
    const length = row.payload.readUInt16LE(9) * 2;
    if (row.payload.readUInt32LE(11 + length) !== id) return row.raw;
    changed++;
    return encodeRecord(row.tag, row.level, payload);
  }));
  assert.equal(changed, 1);
  return { before, expected };
}

test("HWP5 definition public API matches complete independent section and untouched streams through history and reopen", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp"), immutable = Buffer.from(input);
  const { before, expected } = expectedDefinition(input);
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    const edit = { section: 0, sourceNode: 118, formula: "=AVG(B?:E?)" };
    editor.setFormulaDefinition(edit);
    const saved = editor.save({ allowStaleLayout: true }).bytes, after = inspect(saved);
    assert.deepEqual(after.sections[0].bytes, expected);
    const mutant = Buffer.from(after.sections[0].bytes);
    const at = mutant.indexOf(Buffer.from("=AVG(B?:E?)", "utf16le"));
    assert(at >= 0);
    Buffer.from("=SUM(B?:E?)", "utf16le").copy(mutant, at);
    assert.throws(() => assert.deepEqual(mutant, expected), { code: "ERR_ASSERTION" });
    assert.deepEqual(after.metadata, before.metadata);
    for (const [path, bytes] of before.streams) if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
    const reopened = await createExperimentalHwp5Editor(wasm, saved);
    try {
      assert.deepEqual(Buffer.from(reopened.copyText(0, 23)), Buffer.from(editor.copyText(0, 23)));
      const reopenedNode = records(after.sections[0].bytes).findIndex(row => row.tag === 71
        && row.payload.readUInt32LE(0) === 0x25666d75
        && row.payload.subarray(11, 11 + row.payload.readUInt16LE(9) * 2).toString("utf16le") === "=AVG(B?:E?)??%g,;;16.875");
      assert(reopenedNode >= 0);
      reopened.setFormulaDefinition({ section: 0, sourceNode: reopenedNode, formula: "=SUM(B?:E?)" });
      assert(reopened.text(0, 23).includes("67.5"));
    } finally { reopened.close(); }
    editor.setFormulaDefinition(edit);
    assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false);
    for (const [patch, message] of [
      [{ section: 99 }, "InvalidSection"], [{ sourceNode: 0 }, "InvalidFormulaField"],
      [{ formula: "=SUM(Z999:Z1000)" }, "FormulaReferenceOutOfBounds"], [{ formula: "AVG(B?:E?)" }, "UnsupportedFormulaExpression"],
      [{ sourceNode: -1 }, "Invalid sourceNode"], [{ sourceNode: NaN }, "Invalid sourceNode"],
      [{ formula: "\ud800" }, "InvalidUnicodeEncoding"], [{ formula: null }, "Formula must be a string"],
    ]) {
      assert.throws(() => editor.setFormulaDefinition({ ...edit, ...patch }), { message });
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    }
    assert.equal(editor.redo(), true); assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    editor.splice({ section: 0, paragraph: 19, startUnit: 1, endUnit: 2, text: "2" });
    assert(editor.text(0, 23).includes("17.125"));
    const numericSaved = editor.save({ allowStaleLayout: true }).bytes;
    const commands = records(inspect(numericSaved).sections[0].bytes)
      .filter(row => row.tag === 71 && row.payload.readUInt32LE(0) === 0x25666d75)
      .map(row => row.payload.subarray(11, 11 + row.payload.readUInt16LE(9) * 2).toString("utf16le"));
    assert(commands.includes("=AVG(B?:E?)??%g,;;17.125"));
    assert.equal(editor.undo(), true); assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    assert.equal(editor.redo(), true); assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, numericSaved);
    assert.deepEqual(input, immutable);
  } finally { editor.close(); }
  assert.throws(() => editor.setFormulaDefinition({ section: 0, sourceNode: 118, formula: "=AVG(B?:E?)" }), /EditorClosed/);
});

test("missing optional definition export cannot mutate the document or discard redo", async () => {
  const bytes = Buffer.from(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  const name = "hwp5_edit_set_formula_definition", at = bytes.indexOf(Buffer.from(name));
  assert(at >= 0); bytes[at] = "x".charCodeAt(0);
  const module = await WebAssembly.compile(bytes);
  assert.equal(WebAssembly.Module.exports(module).some(row => row.name === name), false);
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp"), editor = await createExperimentalHwp5Editor(module, input);
  try {
    editor.enableHistory();
    editor.splice({ section: 0, paragraph: 19, startUnit: 1, endUnit: 2, text: "2" });
    const changed = editor.save({ allowStaleLayout: true }).bytes;
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.setFormulaDefinition({ section: 0, sourceNode: 118, formula: "=AVG(B?:E?)" }), { message: "Hwp5FormulaDefinitionAbiUnavailable" });
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true); assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, changed);
  } finally { editor.close(); }
});
