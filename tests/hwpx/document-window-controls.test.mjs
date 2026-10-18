import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentWindowControls } from "../../web/preview/document-window-controls.mjs";

function harness() {
  const nodes = Object.fromEntries(["form", "start", "count", "apply", "restore", "note"].map(key => [key, Object.assign(new EventTarget(), { value: key === "count" ? "100" : "1", disabled: false, textContent: "" })]));
  let ready = true;
  const requests = [];
  const controls = createDocumentWindowControls({ ...nodes, ready: () => ready, request: message => { requests.push(message); return true; } });
  return { ...nodes, controls, requests, ready: value => { ready = value; }, submit: () => nodes.form.dispatchEvent(new Event("submit", { cancelable: true })) };
}

test("window controls translate one-based requests clamp tail and restore without editing values", () => {
  const h = harness();
  h.submit(); assert.equal(h.requests.length, 0);
  h.controls.message({ kind: "load", content: { format: "hwpx", totalParagraphs: 120 } });
  h.start.value = "115";
  h.submit();
  assert.deepEqual(h.requests, [{ kind: "set-edit-window", offset: 114, count: 6 }]);
  h.controls.message({ kind: "set-edit-window", content: { format: "hwpx", totalParagraphs: 120, window: { requestedOffset: 114, paragraphOffset: 100, paragraphCount: 20 } } });
  assert.match(h.note.textContent, /101~120/);
  h.restore.dispatchEvent(new Event("click"));
  assert.deepEqual(h.requests[1], { kind: "set-edit-window", offset: null, count: null });
});

test("window controls reject busy IME gate invalid drafts format changes and closed listeners", () => {
  const h = harness();
  h.controls.message({ kind: "load", content: { format: "hwpx", totalParagraphs: 20 } });
  for (const value of ["0", "21", "1.5", "1e1", "-1"]) { h.start.value = value; h.submit(); }
  assert.equal(h.requests.length, 0);
  h.start.value = "1";
  h.ready(false); h.submit(); h.restore.dispatchEvent(new Event("click"));
  assert.equal(h.requests.length, 0);
  h.ready(true);
  h.controls.message({ kind: "load", content: { format: "hwp5", totalParagraphs: 20 } });
  h.submit(); assert.equal(h.requests.length, 0);
  h.controls.message({ kind: "load", content: { format: "hwpx", totalParagraphs: 20 } });
  h.controls.close(); h.submit(); h.restore.dispatchEvent(new Event("click"));
  assert.equal(h.requests.length, 0);
  assert.equal(h.apply.disabled, true);
});

test("HWP5 window controls require advertised ABI and reset on replacement", () => {
  const h = harness();
  h.controls.message({ kind: "load", content: { format: "hwp5", totalParagraphs: 20 } });
  assert.equal(h.apply.disabled, true);
  h.controls.message({ kind: "enable", content: { format: "hwp5", totalParagraphs: 20, documentWindowAvailable: true } });
  assert.equal(h.apply.disabled, false);
  h.start.value = "4"; h.count.value = "3"; h.submit();
  assert.deepEqual(h.requests, [{ kind: "set-edit-window", offset: 3, count: 3 }]);
  h.controls.reset(); h.submit();
  assert.equal(h.apply.disabled, true);
  assert.equal(h.requests.length, 1);
  h.controls.close();
});
