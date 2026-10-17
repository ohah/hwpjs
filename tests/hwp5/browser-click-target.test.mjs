import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { targetHitProbe, assertTargetHit, clickBrowserTarget } from "../../tools/browser/click-target.mjs";

test("browser click guard rejects missing disabled hidden outside and covered targets", () => {
  const good = { exists: true, enabled: true, positiveRect: true, inViewport: true, hitMatches: true };
  assert.doesNotThrow(() => assertTargetHit(good));
  for (const [key, error] of [["exists", "Missing"], ["enabled", "Disabled"], ["positiveRect", "NotVisible"], ["inViewport", "NotVisible"], ["hitMatches", "Covered"]]) {
    assert.throws(() => assertTargetHit({ ...good, [key]: false }), new RegExp(error));
    const absent = { ...good }; delete absent[key];
    assert.throws(() => assertTargetHit(absent), new RegExp(error));
  }
});

test("browser hit probe checks the actual hit element and safely quotes selectors", () => {
  const child = {}, main = {}, selector = 'button[data-value="quoted\\value"]';
  const target = { disabled: false, getBoundingClientRect: () => ({ x: 10, y: 20, width: 30, height: 20 }), contains: element => element === child };
  for (const [hit, expected] of [[target, true], [child, true], [main, false], [null, false]]) {
    const result = vm.runInNewContext(targetHitProbe(selector), { innerWidth: 100, innerHeight: 100, document: {
      querySelector(value) { assert.equal(value, selector); return target; },
      elementFromPoint(x, y) { assert.equal(x, 25); assert.equal(y, 30); return hit; },
    } });
    assert.equal(result.hitMatches, expected);
  }
  for (const value of [null, undefined, 0, "", "  "]) assert.throws(() => targetHitProbe(value), /InvalidBrowserClickSelector/);
});

test("a command success cannot substitute for trusted delivery to the intended element", () => {
  for (const proof of [null, {}, { trusted: false, matches: true }, { trusted: true, matches: false }, { trusted: true, matches: true }]) {
    const commands = [], expressions = [];
    const driver = { command(...args) { commands.push(args); }, evaluate(expression) {
      expressions.push(expression);
      if (expression.includes("positiveRect")) return { exists: true, enabled: true, positiveRect: true, inViewport: true, hitMatches: true };
      if (expression === "window.__hwpClickProof") return proof;
    } };
    if (proof?.trusted && proof.matches) clickBrowserTarget(driver, "#undo");
    else assert.throws(() => clickBrowserTarget(driver, "#undo"), /BrowserClickDidNotReachTarget/);
    assert.deepEqual(commands, [["scrollintoview", "#undo"], ["click", "#undo"]]);
    assert.equal(expressions.at(-1), "window.__hwpClickCleanup?.()");
  }
});

test("dialog resolution occurs before delivery proof and failed clicks still detach observers", () => {
  for (const failing of [null, "click", "dialog"]) {
    const order = [], failure = new Error("ExpectedBrowserActionFailure");
    const driver = {
      command(kind) { order.push(kind); if (kind === failing) throw failure; },
      afterClick() { order.push("dialog"); if (failing === "dialog") throw failure; },
      evaluate(expression) {
        if (expression.includes("positiveRect")) return { exists: true, enabled: true, positiveRect: true, inViewport: true, hitMatches: true };
        if (expression === "window.__hwpClickProof") { order.push("proof"); return { trusted: true, matches: true }; }
        if (expression === "window.__hwpClickCleanup?.()") order.push("detach");
      },
    };
    if (failing) assert.throws(() => clickBrowserTarget(driver, "#enable-edit"), error => error === failure);
    else clickBrowserTarget(driver, "#enable-edit");
    assert.equal(order.at(-1), "detach");
    if (!failing) assert.deepEqual(order, ["scrollintoview", "click", "dialog", "proof", "detach"]);
  }
});
