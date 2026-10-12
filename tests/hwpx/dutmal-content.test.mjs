import test from "node:test";
import assert from "node:assert/strict";
import { attachDutmal } from "../../web/preview/dutmal-content.mjs";

test("dutmal display binds current text and values without editing authorization", () => {
  const source = { kind: "dutmal", section_ordinal: 0, element_index: 7, attributes: { pos_type: "TOP", sz_ratio: "0" } };
  const editor = {
    inlineStringSources: () => ({ sourceOnly: true, controls: [source] }),
    dutmalSites: () => [{ node: 7, paragraph: 1, anchor_unit: 1 }],
    dutmalDisplayText: () => "A\ufffcB",
    dutmalText: (_section, _node, kind) => kind === "mainText" ? "current" : "ruby",
  };
  const make = () => ({ paragraphs: [{ section: 0, paragraph: 0, text: "AB", editable: false }] });
  const content = attachDutmal(editor, make(), true);
  assert.deepEqual(content.dutmalErrors, []);
  assert.equal(content.paragraphs[0].text, "A\ufffcB");
  assert.equal(content.paragraphs[0].editable, false);
  assert.equal(content.paragraphs[0].dutmal[0].mainText, "current");
  content.paragraphs[0].dutmal[0].sourceAttributes.pos_type = "changed";
  assert.equal(source.attributes.pos_type, "TOP");
  const bad = attachDutmal({ ...editor, dutmalDisplayText: () => "wrong" }, make(), true);
  assert.equal(bad.dutmalErrors[0].error, "DutmalBindingMismatch");
  assert.equal(bad.paragraphs[0].text, "AB");
  assert.deepEqual(bad.paragraphs[0].dutmal, []);
  const limited = attachDutmal({ ...editor, dutmalDisplayText: () => "x".repeat(200001) }, make(), true);
  assert.equal(limited.dutmalErrors[0].error, "DutmalDisplayBudgetExceeded");
  assert.equal(limited.paragraphs[0].text, "AB");
  assert.equal(attachDutmal(null, make(), false).dutmalAvailable, false);
});
