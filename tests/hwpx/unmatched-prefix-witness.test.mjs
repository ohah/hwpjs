import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "../../tools/oracle-process.mjs";

const wrap = (body) =>
  `<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph">${body}</s:sec>`;
const paragraph = (text) => `<p:p><p:run><p:t>${text}</p:t></p:run></p:p>`;
const begin =
  "<p:p><p:run><p:ctrl><p:fieldBegin id='7' type='CLICK_HERE'/></p:ctrl><p:t>A</p:t></p:run></p:p>";
const script =
  "import json,runpy,sys; f=runpy.run_path('tools/hwpx-unmatched-prefix-witness.py')['witnesses']; print(json.dumps([f(x) for x in json.load(sys.stdin)]))";
test("unmatched source evidence stays within its nearest list and never invents an end", () => {
  const row = (localParagraph) => ({ localParagraph, unmatchedBeginIds: ["7"] });
  const cases = [
    [
      wrap(
        paragraph("before") +
          "<p:subList>" +
          begin +
          paragraph("inside") +
          "</p:subList>" +
          paragraph("after"),
      ),
      [row(2), row(3)],
    ],
    [wrap(paragraph("before") + begin + paragraph("inside")), [row(2), row(3)]],
    [
      wrap(
        "<p:subList>" + begin + "</p:subList><p:subList>" + paragraph("sibling") + "</p:subList>",
      ),
      [row(1)],
    ],
    [
      wrap(
        begin.replace("<p:t>A</p:t>", "<p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl>"),
      ),
      [],
    ],
    [
      wrap(
        "<p:p><p:run><p:tbl><p:subList>" +
          begin +
          "</p:subList></p:tbl><p:t>outer</p:t></p:run></p:p>",
      ),
      [row(2)],
    ],
    [wrap("<p:p><p:run><fieldBegin id='7'/><p:t>foreign</p:t></p:run></p:p>"), []],
  ];
  for (const flags of [[], ["-O"]]) {
    assert.deepEqual(
      JSON.parse(
        execFileSync("python3", [...flags, "-c", script], {
          input: JSON.stringify(cases.map(([xml]) => xml)),
          encoding: "utf8",
          timeout: 10000,
        }),
      ),
      cases.map(([, expected]) => expected),
    );
    for (const xml of [
      wrap(begin + begin.replace("id='7'", "id='0007'")),
      wrap(begin + "<p:fieldEnd beginIDRef='8'/>"),
      wrap(begin).replace("2011/section", "foreign"),
    ]) {
      assert.throws(
        () =>
          execFileSync("python3", [...flags, "-c", script], {
            input: JSON.stringify([xml]),
            encoding: "utf8",
            timeout: 10000,
          }),
        (error) =>
          error.status === 1 &&
          /AmbiguousFieldWitness|InvalidSectionWitnessRoot/.test(String(error.stderr)),
      );
    }
  }
});

test("actual unresolved field witnesses include protected rows but exclude early exterior", () => {
  for (const [id, paragraph, beginId] of [
    ["80168", 187, "1575661054"],
    ["86712", 387, "1505851682"],
  ]) {
    const path = `reference/rhwp/samples/issue1891/${id}_regulatory_analysis.hwpx`;
    for (const flags of [[], ["-O"]]) {
      const rows = JSON.parse(
        execFileSync("python3", [...flags, "tools/hwpx-unmatched-prefix-witness.py", path], {
          encoding: "utf8",
          timeout: 30000,
        }),
      );
      assert(
        rows.some(
          (row) =>
            row.section === 0 &&
            row.localParagraph === paragraph &&
            row.unmatchedBeginIds.includes(beginId),
        ),
      );
      assert(!rows.some((row) => row.section === 0 && row.localParagraph === 2));
    }
  }
});

test("actual audit classifies unresolved protection without accepting it as editable", (t) => {
  if (!process.env.HWPJS_TEST_WASM) {
    t.skip("explicit candidate WASM required");
    return;
  }
  for (const [id, ranges] of [
    [
      "80168",
      [
        [2, 3],
        [186, 189],
      ],
    ],
    [
      "86712",
      [
        [2, 3],
        [386, 399],
        [403, 406],
        [1789, 1797],
      ],
    ],
  ]) {
    for (const [start, end] of ranges) {
      const result = spawnSync(
        process.execPath,
        [
          "tools/hwpx-edit-corpus-audit.mjs",
          `--wasm=${process.env.HWPJS_TEST_WASM}`,
          `--fixture=reference/rhwp/samples/issue1891/${id}_regulatory_analysis.hwpx`,
          `--paragraphs=${start}:${end}`,
          "--history",
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      const rows = result.stdout.trim().split("\n").map(JSON.parse),
        totals = rows.at(-1).totals;
      assert.equal(rows.at(-2).completeFixture, false);
      assert.equal(totals.paragraphs, end - start);
      const protectedRange = start !== 2;
      assert.equal(totals.accepted, protectedRange ? 0 : end - start);
      assert.equal(totals.restored, protectedRange ? 0 : end - start);
      assert.deepEqual(totals.refused, protectedRange ? { ProtectedFieldRange: end - start } : {});
    }
  }
});

test("actual truncated tail audit verifies its unresolved source witness instead of requiring valid labels", (t) => {
  if (!process.env.HWPJS_TEST_WASM) {
    t.skip("explicit candidate WASM required");
    return;
  }
  for (const flags of [[], ["-O"]]) {
    const witness = JSON.parse(
      execFileSync(
        "python3",
        [
          ...flags,
          "tools/hwpx-unmatched-prefix-witness.py",
          "reference/rhwp/samples/issue5729/stacked_tac_band_om_top.hwpx",
        ],
        { encoding: "utf8", timeout: 30000 },
      ),
    );
    assert.deepEqual(witness, [
      { section: 0, localParagraph: 32, unmatchedBeginIds: ["1854889790"] },
    ]);
  }
  const result = spawnSync(
    process.execPath,
    [
      "tools/hwpx-edit-corpus-audit.mjs",
      `--wasm=${process.env.HWPJS_TEST_WASM}`,
      "--fixture=reference/rhwp/samples/issue5729/stacked_tac_band_om_top.hwpx",
      "--paragraphs=32:33",
      "--history",
    ],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const rows = result.stdout.trim().split("\n").map(JSON.parse),
    totals = rows.at(-1).totals;
  assert.equal(rows.at(-2).completeFixture, false);
  assert.equal(totals.paragraphs, 1);
  assert.equal(totals.accepted, 0);
  assert.equal(totals.restored, 0);
  assert.deepEqual(totals.refused, { ProtectedFieldRange: 1 });
  assert.equal(totals.refusalRedoPreserved, 0);
});
