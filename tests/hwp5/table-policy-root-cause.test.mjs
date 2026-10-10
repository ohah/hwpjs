import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records, readStreams, expectedSection } from "./style-preservation/text-record-oracle.mjs";
import { decodeDistributionSection } from "../../tools/hwp5-distribution-oracle.mjs";
import { firstTableCellScalar } from "./style-preservation/table-scalar-site.mjs";
import { verifyCharacterProperties } from "./style-preservation/character-property-oracle.mjs";
import { hwp5TableGeometry, hwp5TablePagination } from "../../web/preview/hwp5-table-geometry.mjs";


test("table453 parses original fields and edits cell while explicit unknown-bit layout policy refuses placement", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp");
  const parsed = inspect(input), framed = records(parsed.sections[0].bytes);
  const editor = await createExperimentalHwp5Editor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"), input);
  try {
    const source = editor.tableLayoutSources(0).find(row => row.table_record_node === 453);
    assert(source);
    const table = framed[453], object = framed[source.table_node];
    assert.equal(table.tag, 77); assert.equal(object.tag, 71);
    assert.equal(source.table_flags, table.payload.readUInt32LE(0));
    assert.equal(source.table_flags, 0x06000004);
    assert.equal(source.rows, table.payload.readUInt16LE(4)); assert.equal(source.columns, table.payload.readUInt16LE(6));
    assert.equal(source.object_flags, object.payload.readUInt32LE(4));
    assert.equal(source.width, object.payload.readUInt32LE(16)); assert.equal(source.height, object.payload.readUInt32LE(20));
    assert.equal(source.object_extra_bytes, 0); assert.equal(source.table_extra_bytes, 0);
    assert.throws(() => hwp5TableGeometry(source), /UnsupportedHwp5TableExtension/);
    assert.throws(() => hwp5TablePagination(source), /UnsupportedHwp5TablePagination/);
    // Counterfactual diagnostic only: never edit the original file or approve the unknown bit.
    const knownOnly = { ...source, table_flags: source.table_flags & ~0x02000000 };
    assert.doesNotThrow(() => hwp5TableGeometry(knownOnly));
    assert.doesNotThrow(() => hwp5TablePagination(knownOnly));
    assert.equal(source.table_flags, 0x06000004);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    const position = firstTableCellScalar(parsed.sections[0].bytes, 453);
    assert(position);
    editor.enableHistory(); editor.setCharacterEffect({ ...position, effect: "emboss", enabled: true });
    const saved = Buffer.from(editor.save({ allowStaleLayout: true }).bytes);
    assert.equal(verifyCharacterProperties(input, saved, { ...position, properties: { emboss: true } }), true);
    assert.deepEqual(editor.tableLayoutSources(0).find(row => row.table_record_node === 453), source);
    assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save({ allowStaleLayout: true }).bytes), saved);
  } finally { editor.close(); }
});

test("all distribution tables retain original flags and support independently verified cell text edits", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/distribution.hwp");
  const streams = readStreams(input), raw = decodeDistributionSection(streams.get("ViewText/Section0"), true);
  const framed = records(raw);
  const tableNodes = framed.flatMap((record, node) => record.tag === 77 ? [node] : []);
  assert.deepEqual(tableNodes, [178, 286, 349, 458, 622]);
  for (const node of tableNodes) {
    const site = firstTableCellScalar(raw, node);
    assert(site, `missing independent scalar for table ${node}`);
    const editor = await createExperimentalHwp5Editor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"), input, { distribution: true });
    try {
      const sources = editor.tableLayoutSources(0), source = sources.find(row => row.table_record_node === node);
      assert(source); assert.equal(source.table_flags, framed[node].payload.readUInt32LE(0));
      assert.equal(source.table_flags, node === 622 ? 0x04000006 : 0x06000006);
      if (node !== 622) {
        assert.throws(() => hwp5TableGeometry(source), /UnsupportedHwp5TableExtension/);
        assert.throws(() => hwp5TablePagination(source), /UnsupportedHwp5TablePagination/);
      }
      editor.enableHistory();
      editor.splice({ ...site, text: "표셀검증😀" });
      const saved = Buffer.from(editor.save({ allowStaleLayout: true }).bytes), after = readStreams(saved);
      const decoded = decodeDistributionSection(after.get("ViewText/Section0"), true);
      const expected = expectedSection(raw, site.paragraph, site.startUnit, site.endUnit, "표셀검증😀");
      assert.deepEqual(decoded, expected, `whole decrypted section table ${node}`);
      assert.throws(() => assert.deepEqual(decoded, expectedSection(raw, site.paragraph, site.startUnit, site.endUnit, "잘못된기대값")));
      for (const [path, bytes] of streams) if (path !== "ViewText/Section0") assert.deepEqual(after.get(path), bytes, path);
      assert.deepEqual(editor.tableLayoutSources(0), sources);
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save({ allowStaleLayout: true }).bytes), saved);
    } finally { editor.close(); }
  }
});
