import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("independent chart census distinguishes direct series names and rich text from cache points", () => {
  const source = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:x="urn:other"><c:chart><c:title><c:tx><c:v>not a series name</c:v><c:rich><a:p><a:r><a:t>title</a:t></a:r><a:r><a:t>second run</a:t></a:r><x:t>not drawing text</x:t></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser><c:tx><c:v>series</c:v></c:tx><c:cat><c:strLit><c:ptCount val="1"/><c:pt idx="0"><c:v>category</c:v></c:pt></c:strLit></c:cat><x:tx><c:v>not chart tx</c:v></x:tx></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const script =
    "import json,runpy,sys;m=runpy.run_path('tools/hwpx-chart-reference-census.py');s=sys.stdin.read();print(json.dumps({'text':m['text_counts'](s),'points':m['point_counts'](s)}))";
  for (const flags of [[], ["-O"]]) {
    const result = JSON.parse(
      execFileSync("python3", [...flags, "-c", script], {
        input: source,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    assert.deepEqual(result, {
      text: { direct_series_values: 1, rich_text_values: 2 },
      points: { string_literal: 1 },
    });
  }
});
