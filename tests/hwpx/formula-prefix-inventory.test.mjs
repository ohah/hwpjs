import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "../../tools/oracle-process.mjs";

const script =
  "import json,runpy,sys,xml.etree.ElementTree as ET; m=runpy.run_path('tools/hwpx-formula-prefix-inventory.py'); print(json.dumps([m['paragraphs_with_formula_prefix'](ET.fromstring(x)) for x in json.load(sys.stdin)]))";
const xml = (body) =>
  `<section xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph">${body}</section>`;
test("formula prefix source witness rejects text prefixes wrong types namespaces and nested ownership", () => {
  const cases = [
    ["<p:p><p:run><p:ctrl><p:fieldBegin type='FORMULA'/></p:ctrl><p:t>1</p:t></p:run></p:p>", [1]],
    ["<p:p><p:run><p:t>x</p:t><p:ctrl><p:fieldBegin type='FORMULA'/></p:ctrl></p:run></p:p>", []],
    ["<p:p><p:run><p:t/><p:ctrl><p:fieldBegin type='FORMULA'/></p:ctrl></p:run></p:p>", [1]],
    ["<p:p><p:run><p:ctrl><p:fieldBegin type='CLICK_HERE'/></p:ctrl></p:run></p:p>", []],
    ["<p:p><p:run><fieldBegin type='FORMULA'/></p:run></p:p>", []],
    [
      "<p:p><p:run><p:t><p:tab/></p:t><p:ctrl><p:fieldBegin type='FORMULA'/></p:ctrl></p:run></p:p>",
      [],
    ],
    [
      "<p:p><p:run><p:subList><p:p><p:run><p:ctrl><p:fieldBegin type='FORMULA'/></p:ctrl><p:t>1</p:t></p:run></p:p></p:subList></p:run></p:p>",
      [2],
    ],
  ];
  for (const flags of [[], ["-O"]]) {
    const actual = JSON.parse(
      execFileSync("python3", [...flags, "-c", script], {
        input: JSON.stringify(cases.map(([body]) => xml(body))),
        encoding: "utf8",
        timeout: 10000,
      }),
    );
    assert.deepEqual(
      actual,
      cases.map(([, expected]) => expected),
    );
  }
});
test("chart source witnesses exactly thirteen formula result prefixes", () => {
  const rows = JSON.parse(
    execFileSync(
      "python3",
      [
        "tools/hwpx-formula-prefix-inventory.py",
        "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx",
      ],
      { encoding: "utf8", timeout: 10000 },
    ),
  );
  assert.deepEqual(
    rows,
    [24, 30, 36, 65, 71, 77, 130, 131, 132, 133, 157, 163, 169].map((localParagraph) => ({
      section: 0,
      localParagraph,
    })),
  );
});
