import test from "node:test";
import assert from "node:assert/strict";
import { attachHwp5Formulas } from "../../web/preview/hwp5-formulas-content.mjs";
const content = () => ({ format: "hwp5", paragraphs: [{ section: 0, paragraph: 23 }] });
test("HWP5 formula adapter uses native ownership and requires explicit export capability", () => {
  const row = {
    source_node: 118,
    paragraph: 23,
    formula: "=SUM(B?:E?)",
    last_result: "67.5",
    derived: false,
  };
  const editor = {
    formulaSources: (section) => {
      assert.equal(section, 0);
      return [row];
    },
  };
  const result = attachHwp5Formulas(editor, content(), true);
  assert.deepEqual(result.formulas, [
    {
      section: 0,
      beginElement: 118,
      owner: { paragraph: 23 },
      formula: row.formula,
      last_result: row.last_result,
      derived: false,
    },
  ]);
  assert.equal(result.formulaDefinitionAvailable, true);
  assert.equal(attachHwp5Formulas(editor, content(), "true").formulaDefinitionAvailable, false);
  assert.deepEqual(attachHwp5Formulas(null, content(), true).formulas, []);
  const failed = attachHwp5Formulas(
    {
      formulaSources() {
        throw new Error("OutOfMemory");
      },
    },
    content(),
    false,
  );
  assert.deepEqual(failed.formulaErrors, [{ section: 0, error: "OutOfMemory" }]);
  assert.deepEqual(failed.formulas, []);
});
