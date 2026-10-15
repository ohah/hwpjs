import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../../js/hwp5-editor.mjs";
import { inspect, records, verifyRaw } from "./text-record-oracle.mjs";

export async function verifyRangePrefixes(path, expectedCount, options = { normalizeObservedCfb: true }, expectedDisjoint = 0) {
  const input = readFileSync(path);
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const sites = [];
  inspect(input).sections.forEach((section, sectionIndex) => {
    let paragraph = -1;
    for (const record of records(section.bytes)) {
      if (record.tag === 66) paragraph++;
      if (record.tag === 70 && record.payload.length) {
        assert.equal(record.payload.length % 12, 0);
        const disjoint = Array.from({ length: record.payload.length / 12 }, (_, i) => record.payload.readUInt32LE(i * 12)).every(start => start > 0);
        sites.push({ section: sectionIndex, paragraph, disjoint });
      }
    }
  });
  assert.equal(sites.length, expectedCount);
  assert.equal(sites.filter(site => site.disjoint).length, expectedDisjoint, "independent strict-prefix inventory must not shrink");
  const editor = await createExperimentalHwp5Editor(wasm, input, options);
  try {
    const baseline = editor.save().bytes;
    if (!options.normalizeObservedCfb) assert.deepEqual(Buffer.from(baseline), input);
    assert.deepEqual(inspect(baseline).streams, inspect(input).streams);
    editor.enableHistory();
    for (const site of sites) {
      const command = { section: site.section, paragraph: site.paragraph, startUnit: 0, endUnit: 0, text: "범위😀" };
      if (site.disjoint) editor.splice(command);
      else {
        assert.throws(() => editor.splice(command), /UnsupportedRangeSemantics/);
        assert.deepEqual(editor.save().bytes, baseline);
        editor.splice({ ...command, rangePolicy: "half-open" });
      }
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(baseline, saved, site.section, site.paragraph, 0, 0, command.text, { preserveEmptyRanges: site.disjoint });
      assert.throws(() => verifyRaw(baseline, saved, site.section, site.paragraph, 0, 0, "틀림"), /complete Section must match/);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try { assert.equal(reopened.text(site.section, site.paragraph), editor.text(site.section, site.paragraph)); }
      finally { reopened.close(); }
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save().bytes, baseline);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      if (site.disjoint) {
        editor.splice(command);
        const twice = editor.save({ allowStaleLayout: true }).bytes;
        verifyRaw(saved, twice, site.section, site.paragraph, 0, 0, command.text, { preserveEmptyRanges: true });
        const current = await createExperimentalHwp5Editor(wasm, twice);
        try { assert.equal(current.text(site.section, site.paragraph), editor.text(site.section, site.paragraph)); }
        finally { current.close(); }
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      }
      assert.equal(editor.undo(), true);
    }
  } finally { editor.close(); }
  assert.deepEqual(readFileSync(path), input);
}
