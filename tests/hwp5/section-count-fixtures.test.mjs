import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sectionCountFixtures,
  parseSectionCountFixtureInventory,
} from "./section-count-fixtures.mjs";

const input = readFileSync(
  new URL("../../src/hwp5/testdata/section-count-fixtures.json", import.meta.url),
  "utf8",
);
test("shared native/JS count inventory preserves owned immutable fixture identities", () => {
  assert.deepEqual(parseSectionCountFixtureInventory(input), sectionCountFixtures);
  assert.equal(sectionCountFixtures.length, 3);
  assert(Object.isFrozen(sectionCountFixtures));
  assert(sectionCountFixtures.every(Object.isFrozen));
  assert.throws(() => {
    sectionCountFixtures[0][0] = "wrong";
  }, TypeError);
});

test("missing duplicate and malformed count inventory cannot silently reduce or redirect coverage", () => {
  for (const value of [null, {}, [], JSON.parse(input).slice(1)])
    assert.throws(
      () => parseSectionCountFixtureInventory(JSON.stringify(value)),
      /InvalidSectionCountFixtureInventory/,
    );
  const rows = JSON.parse(input);
  rows[1] = rows[0];
  assert.throws(
    () => parseSectionCountFixtureInventory(JSON.stringify(rows)),
    /DuplicateSectionCountFixturePath/,
  );
  for (const [key, value] of [
    ["path", "../outside.hwp"],
    ["path", "/outside.hwp"],
    ["path", "..\\outside.hwp"],
    ["path", "./outside.hwp"],
    ["path", "a//outside.hwp"],
    ["path", "C:outside.hwp"],
    ["version", "5.0"],
    ["version", "5.0.256.0"],
    ["version", ["5.0.0.6"]],
    ["sha256", "bad"],
    ["sha256", [JSON.parse(input)[0].sha256]],
    ["declared", "2"],
    ["declared", 0],
    ["available", 1025],
    ["available", 2],
    ["paragraphs", 0],
  ]) {
    const changed = JSON.parse(input);
    changed[0][key] = value;
    assert.throws(
      () => parseSectionCountFixtureInventory(JSON.stringify(changed)),
      /InvalidSectionCountFixtureInventory/,
      `${key}=${value}`,
    );
  }
});
