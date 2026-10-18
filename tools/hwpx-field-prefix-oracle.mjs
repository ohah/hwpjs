import assert from "node:assert/strict";
import { execFileSync } from "./oracle-process.mjs";

// Selection follows independent source inventories, never the product's field type.
export function selectFieldPrefixOracle({ before, section, paragraph, beginElement }, run = execFileSync) {
  for (const oracle of ["tools/hwpx-field-edit-oracle.py", "tools/hwpx-bookmark-field-oracle.py", "tools/memo-label-oracle.py"]) {
    const inventory = JSON.parse(run("python3", [oracle], {
      input: JSON.stringify({ mode: "inventory", before }), encoding: "utf8", timeout: 30000,
    }));
    assert(Array.isArray(inventory), "InvalidFieldOracleInventory");
    const choices = inventory.filter(entry => entry.part === `Contents/section${section}.xml` && entry.paragraph === paragraph && (beginElement === null || entry.beginElement === beginElement));
    assert(choices.length <= 1, "independent field fragment must be unique");
    if (choices.length === 1) return { oracle, beginId: choices[0].beginId };
  }
  throw new Error("MissingIndependentFieldFragment");
}
