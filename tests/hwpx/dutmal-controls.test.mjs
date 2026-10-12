import test from "node:test";
import assert from "node:assert/strict";
import { createDutmalControls } from "../../web/preview/dutmal-controls.mjs";

test("dutmal form queries native values, retains drafts, and disables closed controls", async () => {
  class Node extends EventTarget {
    value = ""; children = [];
    replaceChildren(...children) { this.children = children; }
  }
  const form = new Node(); form.ownerDocument = { createElement: () => new Node() };
  const fields = {}, targets = new Node(), textKind = new Node(), input = new Node(), note = {};
  textKind.value = "mainText";
  const requests = [];
  let ready = true;
  const control = createDutmalControls({ form, fields, targets, textKind, input, note, ready: () => ready, request: message => { requests.push(message); return true; } });
  assert.equal(form.hidden, true);
  control.message({ kind: "enable", dutmalTextAvailable: false }); await Promise.resolve(); assert.equal(requests.length, 0);
  control.message({ kind: "enable", dutmalTextAvailable: true }); await Promise.resolve();
  const source = requests.at(-1);
  assert.equal(source.kind, "inline-string-sources");
  control.message({ kind: source.kind, requestId: source.requestId, sources: { controls: [{ kind: "dutmal", section_ordinal: 0, element_index: 7 }] } });
  await Promise.resolve();
  assert.equal(form.hidden, false); assert.equal(fields.disabled, true);
  const query = requests.at(-1);
  control.message({ kind: query.kind, requestId: query.requestId, dutmal: { section: 0, node: 7, textKind: "mainText", value: "현재" } });
  assert.equal(input.value, "현재"); assert.equal(fields.disabled, false);
  // Submission reads the DOM value even if an autofill omitted input events.
  input.value = "수정😀";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  const write = requests.at(-1);
  assert.equal(write.value, "수정😀"); assert.equal(fields.disabled, true);
  control.message({ kind: write.kind, requestId: write.requestId, error: "ProtectedFieldRange" });
  assert.equal(input.value, "수정😀"); assert.equal(fields.disabled, false);
  const count = requests.length;
  ready = false;
  textKind.value = "subText"; textKind.dispatchEvent(new Event("change"));
  assert.equal(fields.disabled, true, "busy selection invalidates previous leaf baseline");
  ready = true;
  input.value = "wrong leaf";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(requests.length, count, "must not write previous main leaf after sub selection");
  textKind.dispatchEvent(new Event("change"));
  assert.equal(requests.at(-1).textKind, "subText");
  control.reset();
  assert.equal(form.hidden, true);
  control.close(); control.close();
  control.message({ kind: "enable", dutmalTextAvailable: true }); await Promise.resolve();
  assert.equal(form.hidden, true); assert.equal(fields.disabled, true);
});
