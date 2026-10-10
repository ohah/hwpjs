import assert from "node:assert/strict";
import test from "node:test";
import { transferSelectedText, pasteClipboardText } from "../../web/preview/clipboard-transfer.mjs";

test("clipboard paste requires fresh selection after reading and preserves multiline Unicode", async () => {
  for (const stale of [false, true]) {
    let complete, current = true;
    const calls = [];
    const pending = pasteClipboardText({ clipboard: { readText: () => new Promise(resolve => { complete = resolve; }) }, isCurrent: () => current, replace: text => { calls.push(text); return true; }, report() {} });
    current = !stale; complete("한😀\r\n\n끝");
    assert.equal(await pending, !stale);
    assert.deepEqual(calls, stale ? [] : ["한😀\r\n\n끝"]);
  }
});

test("clipboard paste rejects absent API permission empty invalid text and refused command", async () => {
  for (const clipboard of [null, { readText: async () => { throw new Error("denied"); } }, ...["", "\ud800", null].map(text => ({ readText: async () => text }))]) {
    assert.equal(await pasteClipboardText({ clipboard, isCurrent: () => true, replace() { throw new Error("must not edit"); }, report() {} }), false);
  }
  assert.equal(await pasteClipboardText({ clipboard: { readText: async () => "a" }, isCurrent: () => true, replace: () => false, report() {} }), false);
});

test("clipboard writes before deleting and refuses stale asynchronous completion", async () => {
  for (const cut of [false, true]) for (const stale of [false, true]) {
    let complete, current = true, removed = 0;
    const written = [], reports = [];
    const pending = transferSelectedText({ clipboard: { writeText(text) { written.push(text); return new Promise(resolve => { complete = resolve; }); } }, text: "가😀\n나", isCurrent: () => current, cut, remove() { removed++; return true; }, report: text => reports.push(text) });
    assert.deepEqual(written, ["가😀\n나"]); assert.equal(removed, 0);
    current = !stale; complete();
    assert.equal(await pending, !stale);
    assert.equal(removed, cut && !stale ? 1 : 0);
    assert.equal(reports.length, !cut && !stale ? 1 : 0);
  }
});

test("clipboard failures empty selections and refused deletion never claim success", async () => {
  for (const clipboard of [null, { writeText() { throw new Error("denied"); } }, { writeText: () => Promise.reject(new Error("denied")) }]) {
    let removed = false;
    assert.equal(await transferSelectedText({ clipboard, text: "a", isCurrent: () => true, cut: true, remove() { removed = true; }, report() {} }), false);
    assert.equal(removed, false);
  }
  assert.equal(await transferSelectedText({ clipboard: { writeText() { throw new Error("must not write"); } }, text: "", isCurrent: () => true }), false);
  assert.equal(await transferSelectedText({ clipboard: { writeText: async () => {} }, text: "a", isCurrent: () => true, cut: true, remove: () => false, report() {} }), false);
});
