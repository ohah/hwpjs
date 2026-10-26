import test from "node:test";
import assert from "node:assert/strict";
const { createCanvasEditor } = await import(
  process.env.HWPJS_FOCUS_CONTROLLER_URL ??
    new URL("../../web/preview/canvas-editor.mjs", import.meta.url).href
);
function fixture() {
  const old = Object.getOwnPropertyDescriptor(globalThis, "document"),
    doc = { activeElement: null };
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: doc });
  const fire = (node, type, props = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, props);
    node.dispatchEvent(e);
    return e;
  };
  class Element extends EventTarget {
    ownerDocument = doc;
    style = {};
    dataset = {};
    value = "";
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = "forward";
    disabled = false;
    restoreBrowserRange = false;
    scrollTop = 0;
    scrollLeft = 0;
    clientWidth = 440;
    clientHeight = 300;
    setAttribute() {}
    getRootNode() {
      return doc;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, bottom: 300 };
    }
    setSelectionRange(start, end, direction = "forward") {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    }
    focus() {
      doc.activeElement = this;
      if (this.restoreBrowserRange) this.setSelectionRange(0, 0);
      fire(this, "focus");
    }
    blur() {
      doc.activeElement = null;
      fire(this, "blur");
    }
    scrollIntoView() {}
    hasPointerCapture() {
      return false;
    }
  }
  const row = {
      section: 0,
      paragraph: 0,
      text: "기울임진하게",
      editable: true,
      selectionOwner: "section:0:body",
    },
    canvas = new Element(),
    input = new Element(),
    viewport = new Element();
  let busy = false,
    lastSelection;
  // A deterministic layout fixture only. Production caretGeometry is exercised
  // through the real controller; no alternate mapper/clipboard/Native is installed.
  const renderer = {
    paragraph: () => row,
    layout: () => ({
      rows: [
        {
          ...row,
          startUnit: 0,
          endUnit: row.text.length,
          boundaries: Array.from({ length: row.text.length + 1 }, (_, unit) => ({
            unit,
            x: unit * 10,
          })),
          x: 0,
          y: 0,
          height: 24,
        },
      ],
    }),
    onGeometry() {},
    preview() {},
    select(value) {
      lastSelection = value;
    },
  };
  const requests = [];
  const direct = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    controls: {
      ready: () => true,
      busy: () => busy,
      request(message) {
        requests.push(message);
        busy = true;
        return true;
      },
    },
    note: { textContent: "" },
    platform: "MacIntel",
  });
  assert.equal(
    direct.selectTextRange(
      { section: 0, paragraph: 0, startUnit: 3, endUnit: 6 },
      { focusInput: false },
    ),
    true,
  );
  return {
    doc,
    canvas,
    input,
    row,
    direct,
    requests,
    fire,
    get selection() {
      return lastSelection;
    },
    setBusy(value) {
      busy = value;
    },
    ack(text) {
      row.text = text;
      busy = false;
      direct.message({ kind: "splice", origin: "canvas" });
    },
    close() {
      direct.close();
      if (old) Object.defineProperty(globalThis, "document", old);
      else delete globalThis.document;
    },
  };
}
test("focus restores the canonical find range before queued DOM select can collapse it", () => {
  const f = fixture();
  try {
    f.input.blur();
    f.input.restoreBrowserRange = true;
    f.input.focus();
    f.fire(f.input, "select");
    assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [3, 6]);
    assert.equal(f.canvas.dataset.selection, "3:6");
    assert.equal(f.selection.anchor.unit, 3);
    assert.equal(f.selection.focus.unit, 6);
    assert.equal(f.selection.active, true);
    assert.equal(f.requests.length, 0);
  } finally {
    f.close();
  }
});
test("explicit and repeated focusInput preserve backward selection without edits", () => {
  const f = fixture();
  try {
    assert(
      f.direct.selectTextRange(
        { section: 0, paragraph: 0, startUnit: 3, endUnit: 6, affinity: "backward" },
        { focusInput: false },
      ),
    );
    f.input.restoreBrowserRange = true;
    for (let i = 0; i < 3; i++) {
      assert.equal(f.direct.focusInput(), true);
      f.fire(f.input, "select");
      assert.deepEqual(
        [f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection],
        [3, 6, "backward"],
      );
    }
    assert.equal(f.canvas.dataset.selection, "6:3");
    assert.equal(f.requests.length, 0);
  } finally {
    f.close();
  }
});
test("existing paste-input/ACK and next typing keep exactly one command per edit and caret", () => {
  const f = fixture();
  try {
    f.input.restoreBrowserRange = true;
    assert.equal(f.direct.focusInput(), true);
    f.fire(f.input, "select");
    assert.equal(
      f.fire(f.input, "beforeinput", { inputType: "insertFromPaste", data: "기울임" })
        .defaultPrevented,
      false,
    );
    // Unit default-action simulation with fixture text, not browser clipboard proof.
    f.input.value = "기울임기울임";
    f.input.setSelectionRange(6, 6);
    f.fire(f.input, "input", { inputType: "insertFromPaste", data: "기울임" });
    assert.equal(f.requests.length, 1);
    assert.deepEqual(
      [f.requests[0].kind, f.requests[0].startUnit, f.requests[0].endUnit, f.requests[0].text],
      ["splice", 3, 6, "기울임"],
    );
    f.ack("기울임기울임");
    assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [6, 6]);
    f.fire(f.input, "beforeinput", { inputType: "insertText", data: "x" });
    f.input.value += "x";
    f.input.setSelectionRange(7, 7);
    f.fire(f.input, "input", { inputType: "insertText", data: "x" });
    assert.equal(f.requests.length, 2);
    assert.deepEqual(
      [f.requests[1].kind, f.requests[1].startUnit, f.requests[1].endUnit, f.requests[1].text],
      ["splice", 6, 6, "x"],
    );
    f.ack("기울임기울임x");
    assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [7, 7]);
  } finally {
    f.close();
  }
});
for (const mode of ["composition", "pending", "busy"])
  test(`focus preserves ${mode} input rather than replaying settled range`, () => {
    const f = fixture();
    try {
      if (mode === "composition") {
        f.fire(f.input, "compositionstart");
        f.input.value = "조합중";
        f.input.setSelectionRange(2, 2);
      }
      if (mode === "pending") {
        f.input.value = "기울임기울임";
        f.input.setSelectionRange(6, 6);
        f.fire(f.input, "input");
        assert.equal(f.requests.length, 1);
      }
      if (mode === "busy") f.setBusy(true);
      const before = {
        text: f.input.value,
        start: f.input.selectionStart,
        end: f.input.selectionEnd,
        count: f.requests.length,
      };
      assert.equal(f.direct.focusInput(), true);
      assert.deepEqual(
        {
          text: f.input.value,
          start: f.input.selectionStart,
          end: f.input.selectionEnd,
          count: f.requests.length,
        },
        before,
      );
    } finally {
      f.close();
    }
  });
test("focus grants no edit permission and a closed controller cannot focus", () => {
  const f = fixture();
  try {
    f.row.editable = false;
    assert.equal(f.direct.focusInput(), true);
    assert.equal(
      f.fire(f.input, "beforeinput", { inputType: "insertText", data: "x" }).defaultPrevented,
      true,
    );
    assert.equal(f.requests.length, 0);
    f.direct.close();
    f.doc.activeElement = null;
    assert.equal(f.direct.focusInput(), false);
    assert.equal(f.doc.activeElement, null);
  } finally {
    f.close();
  }
});
test("activeElement lookup follows the input root instead of another document", () => {
  const f = fixture();
  try {
    globalThis.document = { activeElement: null };
    f.input.restoreBrowserRange = true;
    assert.equal(f.direct.focusInput(), true);
    assert.equal(f.selection.active, true);
    assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [3, 6]);
  } finally {
    f.close();
  }
});
