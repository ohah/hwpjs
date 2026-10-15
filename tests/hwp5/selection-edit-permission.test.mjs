import test from "node:test";
import assert from "node:assert/strict";
import { createSelectionEditPermission } from "../../web/preview/selection-edit-permission.mjs";

const range = { section: 0, paragraph: 23, startUnit: 0, endUnit: 0 };
test("split pending state follows exact current selection and clears on denial or reset", () => {
  const state = createSelectionEditPermission({ kind: "query-split-range" });
  assert.equal(state.pending(range), false);
  const first = state.request(range);
  assert.equal(state.pending(range), true);
  assert.equal(state.pending({ ...range, startUnit: 1, endUnit: 1 }), false);
  assert.equal(state.accept({ ...first, allowed: false }), true);
  assert.equal(state.pending(range), false);
  const nextRange = { ...range, startUnit: 4, endUnit: 4 };
  const next = state.request(nextRange);
  assert.equal(state.pending(nextRange), true);
  assert.equal(state.accept({ ...first, allowed: true }), false);
  assert.equal(state.pending(nextRange), true);
  state.invalidate();
  assert.equal(state.pending(nextRange), false);
  assert.equal(state.accept({ ...next, allowed: true }), false);
});
test("split and input permission reject cross-kind and stale responses independently", () => {
  const edit = createSelectionEditPermission(), split = createSelectionEditPermission({ kind: "query-split-range" });
  const editRequest = edit.request(range), splitRequest = split.request(range);
  assert.equal(splitRequest.kind, "query-split-range");
  assert.equal(split.accept({ ...editRequest, allowed: true }), false);
  assert.equal(edit.accept({ ...splitRequest, allowed: true }), false);
  assert.equal(split.accept({ ...splitRequest, allowed: true }), true);
  assert.equal(split.allowed(range), true);
  assert.equal(edit.allowed(range), false);
  split.invalidate();
  assert.equal(split.accept({ ...splitRequest, allowed: true }), false);
  const next = split.request(range);
  assert.ok(next.requestId > splitRequest.requestId);
  assert.equal(split.reject({ ...next, error: "OutOfMemory" }), true);
  assert.equal(split.allowed(range), false);
  assert.throws(() => createSelectionEditPermission({ kind: "splice" }), /InvalidEditPermissionKind/);
});
test("selection permission consumes only current identified failures without granting permission", () => {
  const state = createSelectionEditPermission(), request = state.request(range);
  assert.equal(state.reject({ ...request, requestId: request.requestId + 1, error: "OutOfMemory" }), false);
  assert.equal(state.reject({ ...request, error: "" }), false);
  assert.equal(state.reject({ ...request, error: "OutOfMemory" }), true);
  assert.equal(state.allowed(range), false);
  assert.equal(state.accept({ ...request, allowed: true }), false);
  assert.equal(state.reject({ ...request, error: "OutOfMemory" }), false);
});
test("selection permission requires exact native boolean reply and does not authorize other ranges", () => {
  const state = createSelectionEditPermission(), request = state.request(range);
  assert.equal(state.allowed(range), false);
  for (const mutation of [{ allowed: 1 }, { allowed: "true" }, { paragraph: 11, allowed: true }, { kind: "splice", allowed: true }, { allowed: true, error: "ProtectedFieldRange" }]) assert.equal(state.accept({ ...request, ...mutation }), false);
  assert.equal(state.accept({ ...request, allowed: true }), true);
  assert.equal(state.allowed(range), true);
  assert.equal(state.accept({ ...request, allowed: false }), false);
  assert.equal(state.allowed(range), true);
  assert.equal(state.allowed({ ...range, startUnit: 7, endUnit: 7 }), false);
  assert.equal(state.request(range), null);
});
test("selection permission rejects reordered replies and reuse after model reset", () => {
  const state = createSelectionEditPermission(), old = state.request(range);
  const nextRange = { ...range, startUnit: 13, endUnit: 14 }, next = state.request(nextRange);
  assert.equal(state.accept({ ...old, allowed: true }), false);
  assert.equal(state.accept({ ...next, allowed: false }), true);
  assert.equal(state.allowed(nextRange), false);
  state.invalidate();
  const reopened = state.request(range);
  assert.ok(reopened.requestId > next.requestId);
  assert.equal(state.accept({ ...old, allowed: true }), false);
  assert.equal(state.allowed(range), false);
  assert.equal(state.accept({ ...reopened, allowed: true }), true);
});
test("selection permission refuses malformed ranges before changing current request", () => {
  const state = createSelectionEditPermission(), request = state.request(range);
  for (const mutation of [{ section: -1 }, { paragraph: 1.5 }, { startUnit: NaN }, { endUnit: 0x100000000 }, { startUnit: 2, endUnit: 1 }]) assert.throws(() => state.request({ ...range, ...mutation }), /InvalidEditPermissionRange/);
  assert.equal(state.accept({ ...request, allowed: true }), true);
});
