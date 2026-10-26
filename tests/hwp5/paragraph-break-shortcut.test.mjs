import test from "node:test";
import assert from "node:assert/strict";
import { paragraphBreakShortcut } from "../../web/preview/paragraph-break-shortcut.mjs";
test("flow break shortcut requires exactly one primary modifier and no Alt", () => {
  for (const primary of ["ctrlKey", "metaKey"]) {
    assert.equal(paragraphBreakShortcut({ key: "Enter", [primary]: true }), "page");
    assert.equal(
      paragraphBreakShortcut({ key: "Enter", [primary]: true, shiftKey: true }),
      "column",
    );
    assert.equal(paragraphBreakShortcut({ key: "Enter", [primary]: true, altKey: true }), null);
  }
  for (const event of [
    { key: "Enter" },
    { key: "Enter", shiftKey: true },
    { key: "Enter", altKey: true },
    { key: "Enter", ctrlKey: true, metaKey: true },
    { key: "a", ctrlKey: true },
  ])
    assert.equal(paragraphBreakShortcut(event), null);
});
