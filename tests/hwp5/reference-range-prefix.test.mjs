import test from "node:test";
import { verifyRangePrefixes } from "./style-preservation/range-prefix-fixture.mjs";

for (const [name, count, disjoint] of [
  ["21_언어_기출_편집가능본.hwp", 43, 5],
  ["basic/treatise sample.hwp", 13, 12],
  ["exam_math.hwp", 46, 9],
  ["exam_math_no.hwp", 46, 9],
  ["exam_social-p1.hwp", 1, 0],
  ["exam_social.hwp", 1, 1],
  ["h-pen-01.hwp", 2, 1],
])
  test(`actual range prefix mapping and saved history: ${name}`, async () => {
    await verifyRangePrefixes(
      `reference/rhwp/samples/${name}`,
      count,
      { normalizeObservedCfb: true },
      disjoint,
    );
  });
