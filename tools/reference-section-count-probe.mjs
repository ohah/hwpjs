// Known cropped reference files only. Corrections stay in memory; no source writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createCfbReader } from "../js/cfb.mjs";
import { createHwp5Reader } from "../js/hwp5.mjs";
import { createExperimentalHwp5Editor } from "../js/hwp5-editor.mjs";
import {
  inspect,
  records,
  expectedSection,
} from "../tests/hwp5/style-preservation/text-record-oracle.mjs";

if (process.argv.length !== 2) throw new Error("UnexpectedProbeArgument");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
const wasmSha256 = createHash("sha256").update(wasm).digest("hex");
const cfb = await createCfbReader(wasm),
  reader = await createHwp5Reader(wasm);
try {
  for (const [path, declared, actual] of [
    ["issue5715/float_chart_ghost_ladder_gap.hwp", 2, 1],
    ["issue5802/hf_cross_section_inherit.hwp", 11, 2],
    ["issue5828/landscape_rowbreak_bleed.hwp", 4, 1],
  ]) {
    const input = readFileSync(`reference/rhwp/samples/${path}`),
      before = inspect(input);
    assert.throws(() => cfb.parse(input, { strict: true }), /InvalidFat/);
    assert.throws(() => reader.readText(input), /SectionCountMismatch/);
    cfb.parse(input);
    const document = cfb.document();
    assert(
      document.nodes[0].created !== 0n,
      "known cropped fixture has nonzero root creation time",
    );
    document.nodes[0].created = 0n;
    const expectedMetadata = new Map(before.metadata);
    expectedMetadata.set("", { ...before.metadata.get(""), createdMilliseconds: null });
    const canonical = cfb.write(document);
    cfb.parse(canonical, { strict: true });
    assert.throws(() => reader.readText(canonical), /SectionCountMismatch/);
    const nodes = document.nodes.filter((n) => n.name === "DocInfo" && n.kind === 2);
    assert.equal(nodes.length, 1);
    const info = Buffer.from(before.decode(before.streams.get("DocInfo")));
    const properties = records(info).filter((r) => r.tag === 16);
    assert.equal(properties.length, 1);
    assert.equal(properties[0].payload.readUInt16LE(0), declared);
    assert.equal(before.sections.length, actual);
    const offset = properties[0].start + properties[0].raw.length - properties[0].payload.length;
    info.writeUInt16LE(actual, offset);
    nodes[0].content = before.compressed ? deflateRawSync(info) : info;
    const corrected = cfb.write(document),
      after = inspect(corrected);
    cfb.parse(corrected, { strict: true });
    assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
    assert.deepEqual(after.metadata, expectedMetadata);
    for (const [name, bytes] of before.streams)
      if (name !== "DocInfo") assert.deepEqual(after.streams.get(name), bytes, name);
    assert.deepEqual(after.decode(after.streams.get("DocInfo")), info);
    const result = reader.readText(corrected);
    assert.equal(result.sections.length, actual);
    const editing = [];
    let editor;
    try {
      editor = await createExperimentalHwp5Editor(wasm, corrected);
    } catch (error) {
      editing.push({ status: "open_refused", error: error.message });
    }
    if (editor)
      try {
        editor.enableHistory();
        for (let section = 0; section < actual; section++) {
          try {
            editor.splice({ section, paragraph: 0, startUnit: 0, endUnit: 0, text: "검증" });
          } catch (error) {
            assert.deepEqual(Buffer.from(editor.save().bytes), Buffer.from(corrected));
            editing.push({ section, status: "splice_refused", error: error.message });
            continue;
          }
          const saved = editor.save({ allowStaleLayout: true }).bytes,
            savedView = inspect(saved);
          assert.deepEqual(
            savedView.sections[section].bytes,
            expectedSection(after.sections[section].bytes, 0, 0, 0, "검증"),
          );
          assert.deepEqual(savedView.metadata, after.metadata);
          for (const [name, bytes] of after.streams)
            if (name !== after.sections[section].path)
              assert.deepEqual(savedView.streams.get(name), bytes, name);
          const reopened = await createExperimentalHwp5Editor(wasm, saved);
          try {
            assert.equal(reopened.text(section, 0), editor.text(section, 0));
          } finally {
            reopened.close();
          }
          assert.equal(editor.undo(), true);
          assert.deepEqual(Buffer.from(editor.save().bytes), Buffer.from(corrected));
          assert.equal(editor.redo(), true);
          assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
          assert.equal(editor.undo(), true);
          editing.push({ section, status: "saved_independently_and_history_verified" });
        }
      } finally {
        editor.close();
      }
    assert.deepEqual(readFileSync(`reference/rhwp/samples/${path}`), input);
    console.log(
      JSON.stringify({
        path,
        declared,
        actual,
        wasmSha256,
        containerCorrections: "canonical FAT and zero root creation time",
        canonicalOnly: "SectionCountMismatch",
        correctedSections: result.sections.length,
        paragraphs: result.sections.reduce((sum, section) => sum + section.paragraphs.length, 0),
        editing,
        scope: "in-memory corrected derivative; original remains rejected and unchanged",
      }),
    );
  }
} finally {
  cfb.close();
  reader.close();
}
