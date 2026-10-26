import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import {
  inspect,
  records,
  paragraphRecords,
  verifyRaw,
} from "./style-preservation/text-record-oracle.mjs";

for (const [name, expected] of [
  ["21_언어_기출_편집가능본.hwp", 43],
  ["basic/treatise sample.hwp", 8],
  ["exam_math.hwp", 46],
  ["exam_math_no.hwp", 46],
  ["h-pen-01.hwp", 1],
])
  test(`actual strict suffix insertion and deletion preserve ranges: ${name}`, async () => {
    const path = `reference/rhwp/samples/${name}`,
      input = readFileSync(path);
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
    const sites = [];
    inspect(input).sections.forEach((section, sectionIndex) => {
      const count = records(section.bytes).filter((r) => r.tag === 66).length;
      for (let paragraph = 0; paragraph < count; paragraph++) {
        const owner = paragraphRecords(section.bytes, paragraph);
        const direct = owner.direct.filter((r) => r.level === owner.head.level + 1);
        const ranges = direct.find((r) => r.tag === 70)?.payload;
        if (!ranges?.length) continue;
        const text = direct.find((r) => r.tag === 67)?.payload;
        assert(text);
        assert.equal(ranges.length % 12, 0);
        const at = text.length / 2 - 1;
        assert.equal(text.readUInt16LE(at * 2), 13);
        if (
          Array.from({ length: ranges.length / 12 }, (_, i) =>
            ranges.readUInt32LE(i * 12 + 4),
          ).every((end) => at > end)
        )
          sites.push({ section: sectionIndex, paragraph, at });
      }
    });
    assert.equal(sites.length, expected, "independent suffix inventory must not shrink");
    const editor = await createExperimentalHwp5Editor(wasm, input, { normalizeObservedCfb: true });
    try {
      const baseline = editor.save().bytes;
      editor.enableHistory();
      for (const site of sites) {
        editor.splice({
          section: site.section,
          paragraph: site.paragraph,
          startUnit: site.at,
          endUnit: site.at,
          text: "뒤😀",
        });
        const saved = editor.save({ allowStaleLayout: true }).bytes;
        verifyRaw(baseline, saved, site.section, site.paragraph, site.at, site.at, "뒤😀", {
          preserveEmptyRanges: true,
        });
        assert.throws(
          () =>
            verifyRaw(baseline, saved, site.section, site.paragraph, site.at, site.at, "틀림", {
              preserveEmptyRanges: true,
            }),
          /complete Section must match/,
        );
        editor.splice({
          section: site.section,
          paragraph: site.paragraph,
          startUnit: site.at,
          endUnit: site.at + 3,
          text: "",
        });
        const deleted = editor.save({ allowStaleLayout: true }).bytes;
        verifyRaw(saved, deleted, site.section, site.paragraph, site.at, site.at + 3, "", {
          preserveEmptyRanges: true,
        });
        const reopened = await createExperimentalHwp5Editor(wasm, deleted);
        try {
          assert.equal(
            reopened.text(site.section, site.paragraph),
            editor.text(site.section, site.paragraph),
          );
        } finally {
          reopened.close();
        }
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
        assert.equal(editor.undo(), true);
        assert.deepEqual(editor.save().bytes, baseline);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, deleted);
        assert.equal(editor.undo(), true);
        assert.equal(editor.undo(), true);
      }
    } finally {
      editor.close();
    }
    assert.deepEqual(readFileSync(path), input);
  });
