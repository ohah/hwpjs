import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { trackedDemoFixtures } from "../../web/preview/fixture-inventory.mjs";
import { demoFixtures, fixtureUrl } from "../../web/preview/fixture-catalog.mjs";

test("demo inventory covers every tracked HWP5/HWPX path without duplicate identities", () => {
  const paths = execFileSync("git", ["ls-files", "-z", "*.hwp", "*.hwpx"])
    .toString()
    .split("\0")
    .filter(Boolean)
    .sort();
  assert.deepEqual(trackedDemoFixtures.map((row) => row.path).sort(), paths);
  assert.equal(new Set(demoFixtures.map((row) => row.path)).size, demoFixtures.length);
  assert.equal(new Set(demoFixtures.map((row) => row.id)).size, demoFixtures.length);
  for (const row of trackedDemoFixtures) {
    assert.match(row.id, /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(hwp|hwpx)$/);
    assert.equal(fixtureUrl(row.id), `/web/preview/demo-fixtures/${encodeURIComponent(row.id)}`);
    const bytes = readFileSync(row.path);
    assert(bytes.length > 0 && bytes.length <= 64 * 1024 * 1024);
    assert(
      bytes.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1" ||
        bytes.subarray(0, 4).toString("hex") === "504b0304",
      row.path,
    );
    assert(Object.isFrozen(row));
  }
  const duplicates = trackedDemoFixtures.filter((row) => row.name === "noori.hwp");
  assert(duplicates.length > 1);
  assert(duplicates.every((row) => row.label.includes(row.path)));
});
