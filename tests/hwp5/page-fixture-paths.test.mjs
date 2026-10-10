import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hwp5PageFixturePaths } from "../../tools/hwp5-page-fixture-paths.mjs";

test("page corpus inventory uses signatures and includes demo paths regardless of suffix", () => {
  const bytes = new Map([["demo/renamed.hwpx", Buffer.from("d0cf11e0a1b11ae1", "hex")], ["fixtures/zip.hwp", Buffer.from("504b0304", "hex")], ["fixtures/old.hwp", Buffer.from("HWP Document File")]]);
  assert.deepEqual(hwp5PageFixturePaths([...bytes.keys(), "demo/renamed.hwpx", "README.md"], path => bytes.get(path)), ["demo/renamed.hwpx"]);
  assert.throws(() => hwp5PageFixturePaths(["missing.hwp"], () => { throw new Error("MissingInput"); }), /MissingInput/);
});

test("page corpus includes every tracked CFB document and no ZIP inputs", () => {
  const paths = execFileSync("git", ["ls-files", "-z", "*.hwp", "*.hwpx"]).toString().split("\0").filter(Boolean);
  const actual = hwp5PageFixturePaths(paths);
  const expected = paths.filter(path => readFileSync(path).subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1").sort();
  assert.deepEqual(actual, expected);
  assert(actual.includes("legacy/noori.hwp"));
  assert(actual.includes("legacy/rust/documents/docs/public/demo/noori.hwp"));
});
