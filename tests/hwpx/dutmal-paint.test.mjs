import test from "node:test";
import assert from "node:assert/strict";
import { dutmalAt, dutmalPaintPlan, paintDutmal } from "../../web/preview/dutmal-paint.mjs";
import { withDraftText } from "../../web/preview/text-style.mjs";

test("dutmal preview reserves both runs while retaining one protected unit", () => {
  const row = { node: 7, unit: 1, mainText: "본문", subText: "small", sourceAttributes: { pos_type: "TOP", alignment: "CENTER", sz_ratio: "0" } };
  const paragraph = { section: 0, paragraph: 0, text: "A\ufffcB", dutmal: [row] };
  const before = structuredClone(paragraph);
  const measure = (text, font) => text.length * Number(/([\d.]+)px/.exec(font)[1]);
  const plan = dutmalPaintPlan(dutmalAt(paragraph, 1), "20px sans-serif", 20, measure);
  assert.equal(plan.width, 50); assert.equal(plan.height, 32);
  assert.equal(plan.main.y, 12); assert.equal(plan.sub.y, 0);
  assert.equal(plan.previewDefaultRatio, true);
  const calls = [];
  const ctx = { save() { calls.push("save"); }, restore() { calls.push("restore"); }, fillText(...args) { calls.push([this.font, ...args]); } };
  assert.equal(paintDutmal(ctx, plan, 100, 200), true);
  assert.deepEqual(calls, ["save", ["20px sans-serif", "본문", 105, 212], ["10px sans-serif", "small", 100, 200], "restore"]);
  const bottom = dutmalPaintPlan({ ...row, sourceAttributes: { ...row.sourceAttributes, pos_type: "BOTTOM", sz_ratio: "50", alignment: "RIGHT" } }, "20px sans-serif", 20, measure);
  assert.equal(bottom.main.y, 0); assert.equal(bottom.sub.y, 22);
  assert.equal(bottom.previewDefaultRatio, false);
  for (const change of [{ pos_type: "unknown" }, { alignment: "" }, { sz_ratio: "-1" }, { sz_ratio: "300" }]) assert.equal(dutmalPaintPlan({ ...row, sourceAttributes: { ...row.sourceAttributes, ...change } }, "20px sans-serif", 20, measure), null);
  assert.equal(dutmalAt({ ...paragraph, dutmal: [row, row] }, 1), null);
  const draft = withDraftText(paragraph, "앞😀A\ufffcB");
  assert.equal(draft.dutmal[0].unit, 4);
  assert.equal(dutmalAt(draft, 4).node, 7);
  assert.deepEqual(paragraph, before);
});
