import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function verify(css) {
  const rules = [...css.matchAll(/^#table-creation-fields\s*\{([^}]*)\}/gm)];
  assert.equal(rules.length, 1, "one table field layout authority");
  const declarations = new Map(rules[0][1].split(";").filter(row => row.trim()).map(row => {
    const colon = row.indexOf(":");
    return [row.slice(0, colon).trim(), row.slice(colon + 1).trim()];
  }));
  assert.equal(declarations.get("display"), "flex", "avoid vertically stacked fields behind the Canvas");
  assert.equal(declarations.get("flex-wrap"), "wrap", "narrow screens must wrap the settings");
}

test("table creation settings have one wrapping row layout rather than an overflowing fieldset", () => {
  const css = readFileSync(new URL("../../web/preview/preview.css", import.meta.url), "utf8");
  verify(css);
  assert.throws(() => verify(css.replace(/^#table-creation-fields[^\n]*\n/m, "")), /one table field layout authority/);
  assert.throws(() => verify(css.replace(/(#table-creation-fields\s*\{[^}]*?)display: flex/, "$1display: block")), /vertically stacked/);
  assert.throws(() => verify(css.replace(/(#table-creation-fields\s*\{[^}]*?)flex-wrap: wrap/, "$1flex-wrap: nowrap")), /narrow screens/);
});
