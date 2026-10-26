import test from "node:test";
import assert from "node:assert/strict";
import { createRangePolicyControls } from "../../web/preview/range-policy-controls.mjs";
import { createEditorControls } from "../../web/preview/editor-controls.mjs";
import { updateHwp5Consent } from "../../web/preview/hwp5-consent-visibility.mjs";
import { readFileSync } from "node:fs";

test("format-specific consent labels start hidden before the application initializes", () => {
  const html = readFileSync(new URL("../../web/preview/index.html", import.meta.url), "utf8");
  for (const id of ["allow-stale-layout", "range-policy-consent"])
    assert(html.includes(`<label hidden><input id="${id}"`));
});

test("HWP5 consent visibility follows format while preserving busy-document consent and clearing other formats", () => {
  const label = { hidden: false },
    node = {
      checked: true,
      disabled: false,
      closest: (selector) => {
        assert.equal(selector, "label");
        return label;
      },
    };
  updateHwp5Consent(node, "hwp5", true);
  assert.equal(label.hidden, false);
  assert.equal(node.disabled, false);
  updateHwp5Consent(node, "hwp5", false);
  assert.equal(label.hidden, false);
  assert.equal(node.disabled, true);
  assert.equal(node.checked, true);
  for (const format of ["hwpx", null, undefined, "unknown"]) {
    node.checked = true;
    updateHwp5Consent(node, format, true);
    assert.equal(label.hidden, true);
    assert.equal(node.disabled, true);
    assert.equal(node.checked, false);
  }
  updateHwp5Consent(node, "hwp5", false);
  assert.equal(label.hidden, false);
  assert.equal(node.checked, false);
  updateHwp5Consent(null, "hwp5", true);
});

test("range consent stays format-scoped and never rewrites explicit command policy", () => {
  const node = { checked: false, disabled: true };
  let format = "hwp5",
    ready = false;
  const controls = createRangePolicyControls({ node, format: () => format, ready: () => ready });
  controls.refresh();
  assert.equal(node.disabled, true);
  ready = true;
  controls.refresh();
  assert.equal(node.disabled, false);
  const message = Object.freeze({ kind: "splice", text: "한😀" });
  assert.equal(controls.prepare(message), message);
  node.checked = true;
  assert.deepEqual(controls.prepare(message), { ...message, rangePolicy: "half-open" });
  for (const kind of ["format", "save", "split", "merge", "splice-character-properties"]) {
    const other = { kind };
    assert.equal(controls.prepare(other), other);
  }
  for (const rangePolicy of ["reject", "half-open", "invalid", null]) {
    const explicit = { ...message, rangePolicy };
    assert.equal(controls.prepare(explicit), explicit);
  }
  format = "hwpx";
  controls.refresh();
  assert.equal(node.disabled, true);
  assert.equal(controls.prepare(message), message);
  controls.reset();
  assert.equal(node.checked, false);
  format = "hwp5";
  ready = false;
  controls.refresh();
  assert.equal(node.disabled, true);
  node.checked = true;
  assert.equal(controls.prepare(message), message);
  const absent = createRangePolicyControls({
    node: null,
    format: () => format,
    ready: () => ready,
  });
  absent.reset();
  assert.equal(absent.prepare(message), message);
});

test("editor command boundary applies consent to Canvas splice and resets between documents", (t) => {
  const selectors = [
    "#editor-panel",
    "#enable-edit",
    "#edit-fields",
    "#edit-status",
    "#edit-form",
    "#format-button",
    "#canvas-format-button",
    "#range-policy-consent",
  ];
  const nodes = new Map(
    selectors.map((key) => [
      key,
      Object.assign(new EventTarget(), { checked: false, disabled: true, textContent: "" }),
    ]),
  );
  nodes.get("#edit-form").elements = { charShapeId: { value: "0" } };
  const prior = globalThis.document;
  globalThis.document = { querySelector: (key) => nodes.get(key) ?? null };
  t.after(() => {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  });
  let format = "hwp5";
  const sent = [];
  const controls = createEditorControls((message) => sent.push(message), {
    documentFormat: () => format,
  });
  const node = nodes.get("#range-policy-consent");
  const label = { hidden: true };
  node.closest = () => label;
  controls.reset();
  controls.loaded();
  assert.equal(label.hidden, false, "HWP5 policy is visible before editing is enabled");
  assert.equal(node.disabled, true);
  assert.equal(controls.request({ kind: "enable" }), true);
  controls.message({ kind: "enable", charShapeCount: 0 });
  assert.equal(node.disabled, false);
  node.checked = true;
  const splice = Object.freeze({
    kind: "splice",
    origin: "canvas",
    section: 1,
    paragraph: 104,
    startUnit: 4,
    endUnit: 7,
    text: "한😀",
  });
  assert.equal(controls.request(splice), true);
  assert.deepEqual(sent.at(-1), { ...splice, rangePolicy: "half-open" });
  assert.equal(node.disabled, true);
  assert.equal(controls.request(splice), false);
  controls.message({ kind: "splice", error: "SplitSurrogatePair" });
  assert.equal(node.disabled, false);
  const save = { kind: "save" };
  assert.equal(controls.request(save), true);
  assert.equal(sent.at(-1), save);
  controls.message({ kind: "save" });
  controls.reset();
  format = "hwpx";
  controls.loaded();
  assert.equal(label.hidden, true, "loading HWPX must hide a previous HWP5 policy label");
  controls.request({ kind: "enable" });
  controls.message({ kind: "enable", charShapeCount: 0 });
  assert.equal(node.checked, false);
  assert.equal(node.disabled, true);
  node.checked = true;
  assert.equal(controls.request(splice), true);
  assert.equal(sent.at(-1), splice);
});
