import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCharacterPropertyControls } from "../../web/preview/character-property-controls.mjs";
import { characterPropertyDraftLabel } from "../../web/preview/character-property-draft-label.mjs";

test("advanced emphasis disclosure retains visible draft values without dispatching or changing permission", () => {
  const bold = Object.assign(new EventTarget(), { value: "keep" }), italic = Object.assign(new EventTarget(), { value: "keep" });
  const label = {}, form = new EventTarget(), fields = {}, size = { value: "17" }, calls = [];
  form.querySelector = selector => selector === "#character-property-draft" ? label : null;
  form.reportValidity = () => true;
  const controls = createCharacterPropertyControls({ form, fields, size, bold, italic, note: {}, selected: () => ({ startUnit: 0, endUnit: 2 }), request: value => { calls.push(value); return true; } });
  controls.message({ content: { characterPropertiesAvailable: true } });
  assert.equal(label.textContent, "강조 일괄값 · 굵게 유지 · 기울임 유지");
  bold.value = "on"; italic.value = "off"; bold.dispatchEvent(new Event("change"));
  assert.equal(label.textContent, "강조 일괄값 · 굵게 켜기 · 기울임 끄기");
  assert.deepEqual(calls, []); assert.equal(fields.disabled, false);
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.deepEqual(calls, [{ size: 1700, bold: true, italic: false }]); assert.equal(fields.disabled, true);
  controls.reset(); assert.equal(label.textContent, "강조 일괄값 · 굵게 유지 · 기울임 유지");
  controls.close(); bold.value = "on"; bold.dispatchEvent(new Event("change"));
  assert.equal(label.textContent, "강조 일괄값 · 굵게 유지 · 기울임 유지");
  assert.equal(characterPropertyDraftLabel("<img>", "__proto__"), "강조 일괄값 · 굵게 미확인 · 기울임 미확인");
});

test("advanced emphasis is closed initially while primary size and quick toggles stay outside", () => {
  const html = readFileSync(new URL("../../web/preview/index.html", import.meta.url), "utf8");
  const block = /<details\b([^>]*\bid="character-property-options"[^>]*)>([\s\S]*?)<\/details>/.exec(html);
  assert(block); assert.doesNotMatch(block[1], /\bopen(?:\s|=|$)/);
  for (const id of ["character-property-bold", "character-property-italic"]) {
    assert(block[2].includes(`id="${id}"`)); assert.equal(html.split(`id="${id}"`).length - 1, 1);
  }
  for (const id of ["character-property-size", "canvas-bold-toggle", "canvas-italic-toggle"]) assert(!block[2].includes(`id="${id}"`));
  assert(html.includes('<button type="submit">글자 속성 적용</button>'));
});
