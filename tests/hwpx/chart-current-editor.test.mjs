import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { referenceChartFixturePaths } from "./chart-fixture-paths.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

const paths = existsSync("reference/rhwp/samples/chart") ? referenceChartFixturePaths() : [];
test("every reference numeric chart point supports independent save and history", async (t) => {
  if (!paths.length) {
    t.skip("RHWP chart reference fixtures are unavailable");
    return;
  }
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  let verified = 0;
  try {
    for (const path of paths) {
      const input = readFileSync(path);
      editor.open(input);
      const wrappers = editor.chartNodes(0);
      assert.equal(wrappers.length, 1);
      const wrapper = wrappers[0];
      const original = editor.chartPoints(0, wrapper);
      for (const [point, source] of original.values.points.entries()) {
        if (!["numeric_cache", "numeric_literal"].includes(source.kind)) continue;
        editor.open(input);
        editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 16 * 1024 * 1024 });
        const value = point % 2 ? "-0.00" : "1.234e+2";
        editor.setChartNumericPoint(0, wrapper, point, value);
        const saved = editor.save();
        const payload = {
          before: input.toString("base64"),
          after: Buffer.from(saved).toString("base64"),
          chart: original.pair.chart_path,
          ole: original.pair.ole_path,
          value_node: source.value_node,
          value,
        };
        for (const flags of [[], ["-O"]])
          execFileSync("python3", [...flags, "tools/hwpx-chart-session-oracle.py"], {
            input: JSON.stringify(payload),
            timeout: 30000,
          });
        const current = editor.chartPoints(0, wrapper);
        for (const [index, row] of original.values.points.entries())
          assert.equal(
            current.values.points[index].value,
            index === point ? value : row.value,
            `${path}: point ${point} changed unrelated ${index}`,
          );
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save()), input);
        assert.equal(editor.redo(), true);
        assert.deepEqual(editor.save(), saved);
        editor.open(saved);
        assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, value);
        verified++;
      }
    }
    assert.equal(verified, 289, "complete reference numeric point inventory");
  } finally {
    editor.close();
  }
});
for (const path of paths)
  test(`chart public current values own edits and survive history: ${path}`, async () => {
    const input = readFileSync(path);
    const wrapper = Number(
      execFileSync(
        "python3",
        [
          "-c",
          "import sys,io,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); r=E.fromstring(z.read('Contents/section0.xml')); print(next(i for i,n in enumerate(r.iter()) if n.tag=='{http://www.hancom.co.kr/hwpml/2011/paragraph}switch'))",
        ],
        { input },
      ),
    );
    const editor = await createHwpxEditor(
      readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
    );
    try {
      for (const history of [false, true]) {
        editor.open(input);
        assert.deepEqual(
          editor.chartNodes(0),
          [wrapper],
          "native source targets match independent XML inventory",
        );
        assert.deepEqual(editor.chartSites(0), [
          { wrapper, paragraph: 1, anchorUnit: 0, error_name: null },
        ]);
        if (history) editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
        const original = editor.chartPoints(0, wrapper);
        const point = original.values.points.findIndex(
          (p) => p.kind === "numeric_cache" || p.kind === "numeric_literal",
        );
        assert.ok(point >= 0);
        assert.deepEqual(Buffer.from(editor.save()), input, "query is not a mutation");
        editor.setChartNumericPoint(0, wrapper, point, "314.159");
        const current = editor.chartPoints(0, wrapper);
        assert.equal(current.values.points[point].value, "314.159");
        assert.notEqual(
          original.values.points[point].value,
          "314.159",
          "owned earlier query remains unchanged",
        );
        const saved = editor.save();
        const payload = {
          before: input.toString("base64"),
          after: Buffer.from(saved).toString("base64"),
          chart: current.pair.chart_path,
          ole: current.pair.ole_path,
          value_node: current.values.points[point].value_node,
          value: "314.159",
        };
        for (const flags of [[], ["-O"]]) {
          const verify = (value) =>
            execFileSync("python3", [...flags, "tools/hwpx-chart-session-oracle.py"], {
              input: JSON.stringify({ ...payload, value }),
              timeout: 30000,
            });
          verify("314.159");
          assert.throws(
            () => verify("wrong"),
            (error) => error.status === 1 && String(error.stderr).includes("chart XML mismatch"),
          );
        }
        assert.throws(
          () => editor.setChartNumericPoint(0, wrapper, point, "NaN"),
          /InvalidChartNumericValue/,
        );
        assert.throws(() => editor.chartPoints(0xffffffff, wrapper), /InvalidSectionIndex/);
        assert.throws(() => editor.chartPoints(0, 0xffffffff), /InvalidChartPair/);
        assert.throws(
          () => editor.setChartNumericPoint(0, wrapper, 0xffffffff, "2"),
          /InvalidChartPointIndex/,
        );
        for (const invalid of ["", "Infinity", "1e9999", "1 2", "<v>2</v>"]) {
          assert.throws(
            () => editor.setChartNumericPoint(0, wrapper, point, invalid),
            /InvalidChartNumericValue/,
          );
        }
        assert.throws(
          () => editor.setChartNumericPoint(0, wrapper, point, "1".repeat(1024 * 1024 + 1)),
          /LimitExceeded/,
        );
        const stringPoint = original.values.points.findIndex(
          (p) => p.kind === "string_cache" || p.kind === "string_literal",
        );
        if (stringPoint >= 0)
          assert.throws(
            () => editor.setChartNumericPoint(0, wrapper, stringPoint, "2"),
            /UnsupportedChartPointKind/,
          );
        assert.deepEqual(editor.save(), saved);
        if (history) {
          editor.setChartNumericPoint(0, wrapper, point, "6.70");
          const second = editor.save();
          assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, "6.70");
          assert.equal(editor.undo(), true);
          assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, "314.159");
          assert.deepEqual(editor.save(), saved);
          assert.equal(editor.redo(), true);
          assert.deepEqual(editor.save(), second);
          assert.equal(editor.undo(), true);
          assert.equal(editor.undo(), true);
          assert.deepEqual(editor.chartPoints(0, wrapper), original);
          assert.deepEqual(Buffer.from(editor.save()), input);
          assert.equal(editor.redo(), true);
          assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, "314.159");
          assert.deepEqual(editor.save(), saved);
        }
        editor.open(saved);
        assert.equal(editor.chartPoints(0, wrapper).values.points[point].value, "314.159");
        assert.deepEqual(editor.save(), saved);
      }
    } finally {
      editor.close();
    }
  });
