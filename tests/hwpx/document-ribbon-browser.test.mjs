import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openBrowserRibbonPage } from "../../tools/browser/ribbon-page.mjs";
import { hwpxGateTestPaths } from "../../tools/hwpx-gate-registration.mjs";

test("browser ribbon adapter uses a guarded real click and confirms selected visible state", () => {
  for (const name of ["home", "insert", "view"]) {
    const commands = [];
    const driver = { command(...args) { commands.push(args); }, evaluate(expression) {
      if (expression.startsWith("Boolean(")) return true;
      if (expression.includes("positiveRect")) return { exists: true, enabled: true, positiveRect: true, inViewport: true, hitMatches: true };
      if (expression === "window.__hwpClickProof") return { trusted: true, matches: true };
      if (expression.includes("visible:Boolean")) return { selected: "true", hidden: false, visible: true };
    } };
    assert.equal(openBrowserRibbonPage(driver, name), true);
    assert.deepEqual(commands, [["scrollintoview", `#document-ribbon-tab-${name}`], ["click", `#document-ribbon-tab-${name}`]]);
  }
});

test("browser ribbon adapter never treats missing proof or an invalid route as a successful tab", () => {
  const unused = { evaluate() { throw Error("UnexpectedBrowserAccess"); } };
  for (const name of ["__proto__", "constructor", "view\"]", null, undefined, 1]) assert.throws(() => openBrowserRibbonPage(unused, name), /UnknownBrowserRibbonPage/);
  assert.equal(openBrowserRibbonPage({ evaluate: () => false }, "view"), false);
  for (const value of [undefined, null, 0, "true"]) assert.throws(() => openBrowserRibbonPage({ evaluate: () => value }, "view"), /InvalidBrowserRibbonState/);
  for (const state of [undefined, {}, { selected: "false", hidden: false, visible: true }, { selected: "true", hidden: true, visible: true }, { selected: "true", hidden: false, visible: false }]) {
    const driver = { command() {}, evaluate(expression) {
      if (expression.startsWith("Boolean(")) return true;
      if (expression.includes("positiveRect")) return { exists: true, enabled: true, positiveRect: true, inViewport: true, hitMatches: true };
      if (expression === "window.__hwpClickProof") return { trusted: true, matches: true };
      if (expression.includes("visible:Boolean")) return state;
    } };
    assert.throws(() => openBrowserRibbonPage(driver, "view"), /BrowserRibbonPageNotOpened/);
  }
});

test("ribbon lifecycle and both regression files are registered without replacing menu authorities", () => {
  const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const app = read("web/preview/app.mjs"), css = read("web/preview/preview.css");
  assert.equal((app.match(/const documentRibbon = createDocumentRibbon\(/g) ?? []).length, 1);
  assert.match(app, /if \(!event.persisted\) documentRibbon\.close\(\)/);
  const paths = hwpxGateTestPaths(read("build.zig"));
  for (const path of ["tests/hwpx/document-ribbon-controls.test.mjs", "tests/hwpx/document-ribbon-browser.test.mjs"]) assert.equal(paths.filter(value => value === path).length, 1);
  assert.match(css, /\.document-ribbon-tabs button\[aria-selected="true"\]/);
  assert.match(read("tools/browser/document-menu-roundtrip.mjs"), /openBrowserRibbonPage\(driver,"view"\)/);
  assert.match(read("tools/hwp5-reference-browser-audit.mjs"), /openBrowserRibbonPage\(driver, "view"\)/);
});
