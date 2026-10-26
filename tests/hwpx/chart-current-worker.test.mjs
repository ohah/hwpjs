import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("chart Worker publishes canonical values and preserves history after refusal", async (t) => {
  const descriptors = new Map(
    ["self", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const replies = [];
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  globalThis.self = { postMessage: (value) => replies.push(value) };
  globalThis.fetch = async () => new Response(wasm);
  t.after(async () => {
    try {
      await self.onmessage({ data: { kind: "load", format: "test-close", bytes: [] } });
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  await import(`../../web/preview/reader-worker.mjs?chart-current=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  const ok = async (data) => {
    const result = await send(data);
    assert.equal(result.error, undefined);
    return result;
  };
  const input = readFileSync("reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx");
  const wrapper = Number(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,io,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(next(i for i,n in enumerate(E.fromstring(z.read('Contents/section0.xml')).iter()) if n.tag=='{http://www.hancom.co.kr/hwpml/2011/paragraph}switch'))",
      ],
      { input },
    ),
  );
  await ok({ kind: "load", format: "hwpx", bytes: input });
  const enabled = await ok({ kind: "enable" });
  assert.deepEqual(enabled.content.chartTargets, [
    { section: 0, wrapper, paragraph: 0, anchorUnit: 0, error_name: null },
  ]);
  const query = { kind: "chart-points", section: 0, wrapper };
  const original = (await ok(query)).chart;
  const point = original.values.points.findIndex((p) => p.kind === "numeric_cache");
  assert.ok(point >= 0);
  const command = { kind: "chart-numeric-point", section: 0, wrapper, point, value: "6.70" };
  const edited = await ok(command);
  assert.equal(edited.chart.values.points[point].value, "6.70");
  const saved = Buffer.from((await ok({ kind: "save" })).bytes);
  assert.match((await send({ ...command, value: "NaN" })).error, /InvalidChartNumericValue/);
  assert.deepEqual(Buffer.from((await ok({ kind: "save" })).bytes), saved);
  await ok({ kind: "undo" });
  assert.deepEqual((await ok(query)).chart, original);
  assert.deepEqual(Buffer.from((await ok({ kind: "save" })).bytes), input);
  await ok({ kind: "redo" });
  assert.equal((await ok(query)).chart.values.points[point].value, "6.70");
  assert.deepEqual(Buffer.from((await ok({ kind: "save" })).bytes), saved);
  const stringPoint = original.values.points.findIndex((row) => row.kind === "string_cache");
  assert.ok(stringPoint >= 0);
  const value = "워커😀<&_x0008_\0\r\n\t";
  const stringChanged = await ok({
    kind: "chart-point",
    section: 0,
    wrapper,
    point: stringPoint,
    value,
  });
  assert.equal(stringChanged.chart.values.points[stringPoint].value, value);
  const stringSaved = Buffer.from((await ok({ kind: "save" })).bytes);
  for (const flags of [[], ["-O"]])
    execFileSync("python3", [...flags, "tools/hwpx-chart-session-oracle.py"], {
      input: JSON.stringify({
        before: saved.toString("base64"),
        after: stringSaved.toString("base64"),
        chart: original.pair.chart_path,
        ole: original.pair.ole_path,
        kind: original.values.points[stringPoint].kind,
        value_node: original.values.points[stringPoint].value_node,
        value,
      }),
      timeout: 30000,
    });
  await ok({ kind: "undo" });
  assert.deepEqual(Buffer.from((await ok({ kind: "save" })).bytes), saved);
  await ok({ kind: "redo" });
  assert.deepEqual(Buffer.from((await ok({ kind: "save" })).bytes), stringSaved);
});
