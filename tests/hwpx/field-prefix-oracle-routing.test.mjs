import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectFieldPrefixOracle } from "../../tools/hwpx-field-prefix-oracle.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("field prefix oracle selection preserves section paragraph and native element identity", () => {
  const request = { before: "source", section: 2, paragraph: 2694, beginElement: 25779 };
  const target = { part: "Contents/section2.xml", paragraph: 2694, beginElement: 25779, beginId: "memo" };
  const calls = [];
  const run = (_command, [path], options) => {
    calls.push(path); assert.deepEqual(JSON.parse(options.input), { mode: "inventory", before: "source" });
    return JSON.stringify(path.endsWith("memo-label-oracle.py") ? [target] : [{ ...target, part: "Contents/section0.xml" }, { ...target, paragraph: 1 }, { ...target, beginElement: 7 }]);
  };
  assert.deepEqual(selectFieldPrefixOracle(request, run), { oracle: "tools/memo-label-oracle.py", beginId: "memo" });
  assert.equal(calls.length, 3);
  assert.throws(() => selectFieldPrefixOracle(request, () => "[]"), /MissingIndependentFieldFragment/);
  assert.throws(() => selectFieldPrefixOracle(request, () => JSON.stringify([target, target])), /must be unique/);
  assert.throws(() => selectFieldPrefixOracle(request, () => "{}"), /InvalidFieldOracleInventory/);
  assert.deepEqual(selectFieldPrefixOracle(request, () => JSON.stringify([target])), { oracle: "tools/hwpx-field-edit-oracle.py", beginId: "memo" });
});

test("actual aift MEMO target selects the independent annotation-preserving oracle", () => {
  const before = readFileSync("reference/rhwp/samples/hwpx/aift.hwpx").toString("base64");
  assert.deepEqual(selectFieldPrefixOracle({ before, section: 2, paragraph: 2694, beginElement: 25779 }), { oracle: "tools/memo-label-oracle.py", beginId: "2135782115" });
  for (const flags of [[], ["-O"]]) assert.match(execFileSync("python3", [...flags, "tools/memo-label-oracle.py", "--self-test"], { encoding: "utf8", timeout: 10000 }), /self-test verified/);
});
