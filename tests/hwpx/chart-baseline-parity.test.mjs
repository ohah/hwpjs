import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { referenceChartFixturePaths } from "./chart-fixture-paths.mjs";

test("all original chart query packets and current value history match the explicit baseline", async (t) => {
  if (!process.env.HWPJS_BASELINE_WASM) {
    t.skip("explicit baseline WASM is required");
    return;
  }
  if (!existsSync("reference/rhwp/samples/chart")) {
    t.skip("RHWP chart reference fixtures are unavailable");
    return;
  }
  const baseline = await createHwpxEditor(readFileSync(process.env.HWPJS_BASELINE_WASM));
  const candidate = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  let files = 0,
    edits = 0;
  try {
    for (const path of referenceChartFixturePaths()) {
      const input = readFileSync(path);
      for (const editor of [baseline, candidate]) {
        editor.open(input);
        editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 16 * 1024 * 1024 });
      }
      const wrappers = baseline.chartNodes(0);
      assert.deepEqual(candidate.chartNodes(0), wrappers);
      assert.deepEqual(candidate.chartSites(0), baseline.chartSites(0));
      assert.equal(candidate.anchorText(0, 1), baseline.anchorText(0, 1));
      for (const editor of [baseline, candidate]) editor.spliceAnchored(0, 1, 0, 0, "기능유지😀");
      assert.equal(candidate.anchorText(0, 1), baseline.anchorText(0, 1));
      assert.deepEqual(
        candidate.chartSites(0),
        baseline.chartSites(0),
        "host input retains current chart anchor identity and position",
      );
      for (const wrapper of wrappers) {
        const original = baseline.chartPoints(0, wrapper);
        const compare = () =>
          assert.deepEqual(
            candidate.chartPoints(0, wrapper),
            baseline.chartPoints(0, wrapper),
            path,
          );
        compare();
        for (const numeric of [true, false]) {
          const point = original.values.points.findIndex((row) =>
            numeric
              ? row.kind === "numeric_cache" || row.kind === "numeric_literal"
              : row.kind === "string_cache" || row.kind === "string_literal",
          );
          if (point < 0) continue;
          for (const editor of [baseline, candidate]) {
            if (numeric) editor.setChartNumericPoint(0, wrapper, point, "31.4159");
            else editor.setChartPoint(0, wrapper, point, "호환😀<&");
          }
          compare();
          for (const editor of [baseline, candidate]) assert.equal(editor.undo(), true);
          compare();
          for (const editor of [baseline, candidate]) assert.equal(editor.redo(), true);
          compare();
          edits++;
        }
      }
      assert.deepEqual(readFileSync(path), input);
      files++;
    }
    assert.equal(files, 28);
    assert.equal(edits, 56);
    t.diagnostic(
      JSON.stringify({
        files,
        hostEdits: files,
        edits,
        scope:
          "chart nodes sites host text and complete point packets before edit after edit undo and redo; not every API or wire signature",
      }),
    );
  } finally {
    baseline.close();
    candidate.close();
  }
});
