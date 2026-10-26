import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentMenuControls } from "../../web/preview/document-menu-controls.mjs";
import { readFileSync } from "node:fs";

function setup(keys = ["o", "s"]) {
  const summary = new EventTarget(),
    calls = [];
  const popup = Object.assign(new EventTarget(), {
    open: true,
    querySelector: (selector) => (selector === "summary" ? summary : null),
  });
  const targets = keys.map((_, index) => ({ disabled: false, click: () => calls.push(index) }));
  const buttons = keys.map((key, index) =>
    Object.assign(new EventTarget(), {
      id: `menu-${index}`,
      textContent: `명령${index}`,
      getAttribute: (name) => (name === "data-menu-key" ? key : null),
      closest: () => popup,
    }),
  );
  const controls = createDocumentMenuControls(
    buttons.map((button, index) => ({ button, target: targets[index] })),
  );
  const key = (value, extra = {}, target = summary, consumed = false) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), {
      key: value,
      ...extra,
    });
    if (consumed) event.preventDefault();
    Object.defineProperty(event, "target", { value: target });
    popup.dispatchEvent(event);
    return event;
  };
  return { popup, targets, buttons, calls, controls, key };
}

test("actual alignment menu keys are unique and use live command eligibility", () => {
  const html = readFileSync(new URL("../../web/preview/index.html", import.meta.url), "utf8");
  const format = html.match(/<details><summary>서식<\/summary>([\s\S]*?)<\/details>/)?.[1];
  assert(format);
  const rows = [...format.matchAll(/<button id="([^"]+)"[^>]*data-menu-key="([^"]+)"/g)].map(
    ([, id, key]) => ({ id, key }),
  );
  assert.equal(new Set(rows.map((row) => row.key.toLowerCase())).size, rows.length);
  const alignment = rows.filter((row) => row.id.startsWith("menu-align-"));
  assert.deepEqual(
    alignment.map((row) => [row.id, row.key]),
    [
      ["menu-align-left", "l"],
      ["menu-align-center", "c"],
      ["menu-align-right", "r"],
      ["menu-align-justify", "j"],
      ["menu-align-distribute", "d"],
      ["menu-align-space", "n"],
    ],
  );
  const f = setup(alignment.map((row) => row.key));
  try {
    for (const [index, { key }] of alignment.entries()) {
      f.popup.open = true;
      f.targets[index].disabled = true;
      assert.equal(f.key(key).defaultPrevented, false);
      assert.equal(f.calls.length, index);
      f.targets[index].disabled = false;
      assert.equal(f.key(key).defaultPrevented, true);
      assert.equal(f.popup.open, false);
      assert.deepEqual(
        f.calls,
        Array.from({ length: index + 1 }, (_, value) => value),
      );
    }
  } finally {
    f.controls.close();
  }
});

test("open menu mnemonic executes the existing current command once and closes without new dispatch", () => {
  const f = setup();
  try {
    assert.equal(f.key("O").defaultPrevented, true);
    assert.deepEqual(f.calls, [0]);
    assert.equal(f.popup.open, false);
    assert.equal(f.key("o").defaultPrevented, false);
    assert.deepEqual(f.calls, [0]);
    f.popup.open = true;
    f.targets[1].disabled = true;
    assert.equal(f.key("s").defaultPrevented, false);
    f.targets[1].disabled = false;
    assert.equal(f.key("s").defaultPrevented, true);
    assert.deepEqual(f.calls, [0, 1]);
  } finally {
    f.controls.close();
  }
});

test("menu mnemonic preserves consumed events and rechecks disposal during eligibility refresh", () => {
  const f = setup();
  try {
    assert.equal(f.key("o", {}, f.popup.querySelector("summary"), true).defaultPrevented, true);
    assert.deepEqual(f.calls, []);
    f.controls.subscribe(() => f.controls.close());
    f.targets[1].disabled = true;
    assert.equal(f.key("o").defaultPrevented, false);
    assert.deepEqual(f.calls, []);
    assert.equal(f.popup.open, false);
    assert.equal(f.controls.execute("menu-0"), false);
  } finally {
    f.controls.close();
  }
});

test("menu mnemonic refuses IME modifiers repeat input focus duplicate keys and disposal", () => {
  const f = setup();
  try {
    for (const extra of [
      { isComposing: true },
      { keyCode: 229 },
      { repeat: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
    ])
      assert.equal(f.key("o", extra).defaultPrevented, false);
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "TEXTAREA" },
      { isContentEditable: true },
    ])
      assert.equal(f.key("o", {}, target).defaultPrevented, false);
    assert.deepEqual(f.calls, []);
    f.controls.close();
    assert.equal(f.key("o").defaultPrevented, false);
    assert.deepEqual(f.calls, []);
  } finally {
    f.controls.close();
  }
  const duplicate = setup(["o", "O"]);
  try {
    assert.equal(duplicate.key("o").defaultPrevented, false);
    assert.deepEqual(duplicate.calls, []);
  } finally {
    duplicate.controls.close();
  }
});
