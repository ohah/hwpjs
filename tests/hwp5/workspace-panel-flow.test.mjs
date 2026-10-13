import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("expanded help panels release pinned workspace without changing viewport scrolling", () => {
  const css = readFileSync("web/preview/preview.css", "utf8");
  assert.match(css, /\.editor-surface\s*\{[^}]*position:\s*sticky;/);
  assert.match(css, /\.editor-surface\s*~\s*details\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*3;/);
  assert.match(css, /main:has\(> details\[open\]\)\s*>\s*\.editor-surface\s*\{\s*position:\s*relative;/);
  assert.match(css, /#viewport\s*\{[^}]*overflow:\s*auto;/);
});
