import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { characterSpacingDelta } from "../../web/preview/character-spacing-arithmetic.mjs";
import { roundedMulDiv } from "../../web/preview/integer-mul-div.mjs";
import {
  roundedMulDiv as existingExport,
  hwp5LineSpacing,
} from "../../web/preview/hwp5-line-spacing.mjs";

test("character spacing is based on integer glyph advance, not a fixed em or nominal height", () => {
  for (const [advance, percent, expected] of [
    [1000, -5, -50],
    [500, -5, -25],
    [10, -5, -1],
    [10, 5, 1],
    [9, -5, 0],
    [0, 127, 0],
    [100, -128, -128],
    [100, 127, 127],
    [1000, 0, 0],
  ])
    assert.equal(characterSpacingDelta(advance, percent), expected);
  assert.notEqual(characterSpacingDelta(500, -5), characterSpacingDelta(1000, -5));
  for (const [advance, percent] of [
    [-1, 0],
    [1.5, 0],
    [NaN, 0],
    [Infinity, 0],
    ["1000", 0],
    [1000, "-5"],
    [1, -129],
    [1, 128],
    [2147483648, 0],
    [2147483647, 127],
  ])
    assert.equal(characterSpacingDelta(advance, percent), null);
});

test("line and character spacing share the exact multiply/divide implementation", () => {
  assert.equal(existingExport, roundedMulDiv);
  assert.deepEqual(hwp5LineSpacing(0, 160, 1000), { extra: 600, advance: 1600 });
  for (let advance = 0; advance <= 1000; advance++)
    for (const percent of [-128, -50, -5, -1, 0, 1, 5, 50, 127]) {
      const scaled = (advance * percent) / 100;
      const magnitude = Math.floor(Math.abs(scaled) + 0.5);
      const expected = magnitude === 0 ? 0 : Math.sign(scaled) * magnitude;
      assert.equal(characterSpacingDelta(advance, percent), expected);
    }
});

test("negative controls detect truncation wrong signed ties and narrow intermediate products", async () => {
  const source = readFileSync(
    new URL("../../web/preview/integer-mul-div.mjs", import.meta.url),
    "utf8",
  );
  for (const [from, to, args, expected] of [
    ["product + (product < 0n ? -half : half)", "product", [10, -5, 100], -1],
    ["product + (product < 0n ? -half : half)", "product + half", [10, -5, 100], -1],
    ["BigInt(a) * BigInt(b)", "BigInt(a * b | 0)", [2147483647, 100, 100], 2147483647],
  ]) {
    assert.ok(source.includes(from));
    const candidate = await import(
      `data:text/javascript;base64,${Buffer.from(source.replace(from, to)).toString("base64")}`
    );
    assert.notEqual(candidate.roundedMulDiv(...args), expected);
    assert.equal(roundedMulDiv(...args), expected);
  }
});
