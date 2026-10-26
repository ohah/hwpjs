import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTableCreationControls } from "../../web/preview/table-creation-controls.mjs";
test("table creation toolbar starts hidden and shared hidden CSS overrides flex layout", () => {
  const html = readFileSync(new URL("../../web/preview/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../web/preview/preview.css", import.meta.url), "utf8");
  assert.match(html, /<form id="table-creation-form"[^>]*\shidden>/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});
test("table creation controls use actual resource IDs and disable absent or stale selections", () => {
  class Node extends EventTarget {
    value = "";
    attributes = {};
    setAttribute(key, value) {
      this.attributes[key] = value;
    }
    replaceChildren(...items) {
      this.items = items;
    }
    focus() {
      this.focused = true;
    }
  }
  const form = new Node(),
    fields = new Node(),
    focusButton = new Node(),
    submit = new Node(),
    note = new Node();
  let valid = true,
    selection = null,
    onValidity = null;
  form.reportValidity = () => {
    onValidity?.();
    return valid;
  };
  const dimensions = Object.fromEntries(
    Object.entries({ rows: 2, columns: 2, width: 36000, rowHeight: 1800 }).map(([key, value]) => [
      key,
      Object.assign(new Node(), { value: String(value) }),
    ]),
  );
  const resources = Object.fromEntries(
    ["paragraph", "character", "style", "border_fill"].map((key) => [key, new Node()]),
  );
  let ids = { paragraph: [0, 9], character: [1, 7], style: [0], border_fill: [3] };
  const sent = [];
  const controls = createTableCreationControls({
    form,
    fields,
    focusButton,
    submit,
    note,
    dimensions,
    resources,
    selected: () => selection,
    inventory: () => ids,
    request: (value) => {
      sent.push(value);
      return true;
    },
    createOption: () => ({}),
  });
  assert.equal(fields.disabled, true);
  assert.equal(fields.hidden, true);
  assert.equal(
    form.hidden,
    true,
    "unavailable closed tools without status must not reserve a toolbar row",
  );
  assert.equal(focusButton.attributes["aria-expanded"], "false");
  selection = { section: 0, paragraph: 1, unit: 0 };
  controls.update();
  assert.equal(fields.disabled, false);
  assert.equal(form.hidden, false);
  focusButton.dispatchEvent(new Event("click"));
  assert.equal(dimensions.rows.focused, true);
  assert.equal(fields.hidden, false);
  assert.equal(focusButton.attributes["aria-expanded"], "true");
  selection = null;
  controls.update();
  assert.equal(
    form.hidden,
    false,
    "an expanded form stays visible when its selection becomes unavailable",
  );
  selection = { section: 0, paragraph: 1, unit: 0 };
  controls.update();
  const escape = new Event("keydown", { cancelable: true });
  Object.defineProperty(escape, "key", { value: "Escape" });
  form.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(fields.hidden, true);
  assert.equal(focusButton.attributes["aria-expanded"], "false");
  assert.equal(focusButton.focused, true);
  focusButton.dispatchEvent(new Event("click"));
  assert.equal(fields.hidden, false);
  resources.paragraph.value = "9";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.deepEqual(sent[0].resources, { paragraph: 9, character: 1, style: 0, border_fill: 3 });
  assert.equal(sent[0].rowHeight, 1800);
  assert.equal(note.textContent, "표 생성 중…");
  controls.message({ kind: "save" });
  assert.equal(note.textContent, "표 생성 중…");
  controls.message({ kind: "insert-table" });
  assert.match(note.textContent, /표 생성 완료/);
  assert.equal(fields.hidden, true);
  selection = null;
  controls.update();
  assert.equal(
    form.hidden,
    false,
    "completion status stays visible even with closed unavailable tools",
  );
  selection = { section: 0, paragraph: 1, unit: 0 };
  controls.update();
  focusButton.dispatchEvent(new Event("click"));
  controls.message({ kind: "insert-table", error: "InvalidHost" });
  assert.equal(fields.hidden, false);
  assert.equal(note.textContent, "표 생성 실패: InvalidHost");
  controls.message({ kind: "insert-table", error: "DisplayFailed", applied: true });
  assert.equal(note.textContent, "표 생성 후 표시 실패: DisplayFailed");
  controls.message({ kind: "load" });
  assert.equal(note.textContent, "");
  assert.equal(fields.hidden, true);
  selection = null;
  controls.update();
  assert.equal(form.hidden, true);
  selection = { section: 0, paragraph: 1, unit: 0 };
  controls.update();
  valid = false;
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(sent.length, 1);
  selection = null;
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(sent.length, 1);
  valid = true;
  selection = { section: 0, paragraph: 1, unit: 0 };
  onValidity = () => {
    selection = { section: 0, paragraph: 2, unit: 0 };
  };
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(sent.length, 1, "validation must not insert at a changed caret");
  selection = { section: 0, paragraph: 1, unit: 0 };
  onValidity = () => {
    selection.unit = 1;
  };
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(sent.length, 1, "in-place caret mutation must not bypass the snapshot");
  selection = { section: 0, paragraph: 1, unit: 0 };
  const originalIds = ids;
  onValidity = () => {
    ids = null;
  };
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(sent.length, 1, "resource loss during validation must not submit");
  assert.equal(fields.disabled, true);
  assert.equal(submit.disabled, true);
  ids = originalIds;
  controls.update();
  assert.equal(fields.disabled, false);
  note.textContent = "old document status";
  controls.message({ kind: "unlock" });
  assert.equal(note.textContent, "");
  onValidity = () => {
    controls.close();
  };
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(sent.length, 1, "validation must not submit after close");
  controls.close();
  selection = {};
  controls.update();
  assert.equal(fields.disabled, true);
  assert.equal(form.hidden, true);
  focusButton.dispatchEvent(new Event("click"));
  assert.equal(fields.hidden, true);
  const afterCloseEscape = new Event("keydown", { cancelable: true });
  Object.defineProperty(afterCloseEscape, "key", { value: "Escape" });
  form.dispatchEvent(afterCloseEscape);
  assert.equal(afterCloseEscape.defaultPrevented, false);
  controls.message({ kind: "insert-table" });
  assert.equal(note.textContent, "");
});
