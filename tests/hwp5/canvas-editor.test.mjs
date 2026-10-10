import test from "node:test";

test("Canvas selection delete command preserves independent records and one history transaction", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const original = Buffer.from(h.native.save().bytes), before = h.input.value;
  assert.equal(h.controller.canDeleteSelection(), false);
  assert.equal(h.controller.deleteSelection(), false);
  assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 0, endUnit: 1 }));
  assert.equal(h.controller.canDeleteSelection(), true);
  h.input.blur();
  assert.equal(h.controller.deleteSelection(), true);
  assert.equal(document.activeElement, h.input);
  assert.equal(h.controller.canDeleteSelection(), false);
  assert.equal(h.controller.deleteSelection(), false);
  assert.equal(h.requests.length, 1); h.ack();
  assert.equal(h.input.value, before.slice(1));
  const saved = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  verifyRaw(original, saved, 0, 5, 0, 1, "");
  assert.equal(h.native.undo(), true); assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  assert.equal(h.native.redo(), true); assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), saved);
});

test("Canvas selection delete refuses protected busy composing and closed selections", async t => {
  for (const state of ["protected", "busy", "composing", "closed"]) await t.test(state, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    const original = Buffer.from(h.native.save().bytes);
    assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 0, endUnit: 1 }));
    if (state === "protected") h.renderer.paragraph(h.paragraph).editable = false;
    if (state === "busy") h.setBusy(true);
    if (state === "composing") dispatch(h.input, "compositionstart");
    if (state === "closed") h.controller.close();
    assert.equal(h.controller.canDeleteSelection(), false);
    assert.equal(h.controller.deleteSelection(), false);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  });
});

test("Canvas denied clipboard read restores input focus and preserves selection and source", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = Buffer.from(h.native.save().bytes);
  assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 1, endUnit: 2 }));
  h.input.blur();
  assert.notEqual(document.activeElement, h.input);
  assert.equal(await h.controller.pasteSelection({ clipboard: { readText: async () => { throw new Error("denied"); } } }), false);
  assert.equal(document.activeElement, h.input);
  assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 2);
  assert.match(h.note.textContent, /Ctrl\/Cmd\+V/);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
});

test("Canvas menu clipboard paste at caret uses native history and keeps Unicode", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const before = h.input.value, original = Buffer.from(h.native.save().bytes);
  assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 0, endUnit: 0 }));
  assert.equal(await h.controller.pasteSelection({ clipboard: { readText: async () => "한😀" } }), true);
  assert.equal(h.requests.length, 1); h.ack();
  assert.equal(h.input.value, "한😀" + before);
  const saved = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  assert.equal(h.native.undo(), true); assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  assert.equal(h.native.redo(), true); assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), saved);
});

test("Canvas delayed clipboard paste refuses changed selection close and busy state", async t => {
  for (const invalidate of ["selection", "close", "busy"]) await t.test(invalidate, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    const original = Buffer.from(h.native.save().bytes);
    assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 0, endUnit: 0 }));
    let complete;
    const promise = h.controller.pasteSelection({ clipboard: { readText: () => new Promise(resolve => { complete = resolve; }) } });
    if (invalidate === "selection") assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 1, endUnit: 1 }));
    if (invalidate === "close") h.controller.close();
    if (invalidate === "busy") h.setBusy(true);
    complete("한😀"); assert.equal(await promise, false);
    assert.equal(h.requests.length, 0); assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  });
});

test("Canvas menu clipboard cut uses one native transaction with byte-exact history", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const before = h.input.value;
  const original = Buffer.from(h.native.save().bytes);
  assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 0, endUnit: 1 }));
  const copied = [];
  const clipboard = { writeText: async text => { copied.push(text); } };
  assert.equal(await h.controller.transferSelection({ clipboard }), true);
  assert.deepEqual(copied, [before.slice(0, 1)]);
  assert.equal(h.requests.length, 0);
  assert.equal(await h.controller.transferSelection({ clipboard, cut: true }), true);
  assert.equal(h.requests.length, 1); h.ack();
  assert.equal(h.input.value, before.slice(1));
  const saved = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  assert.equal(h.native.undo(), true); assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  assert.equal(h.native.redo(), true); assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), saved);
});

test("Canvas delayed clipboard cut cannot delete a changed selection or closed editor", async t => {
  for (const invalidate of ["selection", "close", "busy"]) await t.test(invalidate, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    const original = Buffer.from(h.native.save().bytes);
    assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 0, endUnit: 1 }));
    let complete;
    const promise = h.controller.transferSelection({ cut: true, clipboard: { writeText: () => new Promise(resolve => { complete = resolve; }) } });
    if (invalidate === "selection") assert(h.controller.selectTextRange({ ...h.paragraph, startUnit: 1, endUnit: 2 }));
    if (invalidate === "close") h.controller.close();
    if (invalidate === "busy") h.setBusy(true);
    complete(); assert.equal(await promise, false);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  });
});

test("Canvas uses renderer scale for pointer and IME and cancels drag when it changes", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  let scale = 2; h.renderer.viewScale = () => scale;
  h.viewport.clientWidth = 2000; h.viewport.clientHeight = 20000;
  h.viewport.scrollLeft = 30; h.viewport.scrollTop = 20;
  const original = Buffer.from(h.native.save().bytes);
  const caret = caretGeometry(h.renderer.layout(), { ...h.paragraph, unit: 1 });
  const bounds = caret.screenBounds ?? caret;
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 77, clientX: bounds.x * scale - 30, clientY: bounds.y * scale - 20 });
  assert.equal(h.input.selectionStart, 1);
  assert.equal(Number.parseFloat(h.input.style.left), bounds.x * scale);
  assert.equal(Number.parseFloat(h.input.style.top), bounds.y * scale);
  const selection = h.canvas.dataset.selection;
  scale = 1;
  dispatch(h.canvas, "pointermove", { pointerId: 77, clientX: 100, clientY: bounds.y });
  assert.equal(h.canvas.dataset.selection, selection);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
});

test("Canvas cancelled or lost capture ends horizontal drag without late edits", async t => {
  for (const type of ["pointercancel", "lostpointercapture"]) await t.test(type, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    const original = Buffer.from(h.native.save().bytes);
    const start = caretGeometry(h.renderer.layout(), { ...h.paragraph, unit: 0 });
    h.viewport.scrollLeft = 0;
    h.viewport.getBoundingClientRect = () => ({ left: 0, right: 40, top: 0, bottom: 10000 });
    dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 77, clientX: start.x, clientY: start.y });
    dispatch(h.canvas, type, { pointerId: 78 });
    dispatch(h.canvas, "pointermove", { pointerId: 77, clientX: 50, clientY: start.y });
    assert(h.viewport.scrollLeft > 0, "another pointer must not end the active drag");
    dispatch(h.canvas, type, { pointerId: 77 });
    const before = { scrollLeft: h.viewport.scrollLeft, selection: h.canvas.dataset.selection };
    dispatch(h.canvas, "pointermove", { pointerId: 77, clientX: 80, clientY: start.y });
    assert.equal(h.viewport.scrollLeft, before.scrollLeft);
    assert.equal(h.canvas.dataset.selection, before.selection);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  });
});

test("Canvas captured text drag scrolls horizontally only for the owning pointer", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = Buffer.from(h.native.save().bytes);
  const start = caretGeometry(h.renderer.layout(), { ...h.paragraph, unit: 0 });
  h.viewport.scrollLeft = 0;
  h.viewport.getBoundingClientRect = () => ({ left: 0, right: 40, top: 0, bottom: 10000 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 77, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 78, clientX: 50, clientY: start.y });
  assert.equal(h.viewport.scrollLeft, 0);
  dispatch(h.canvas, "pointermove", { pointerId: 77, clientX: 50, clientY: start.y });
  assert(h.viewport.scrollLeft > 0);
  const right = h.viewport.scrollLeft;
  dispatch(h.canvas, "pointermove", { pointerId: 77, clientX: 20, clientY: start.y });
  assert.equal(h.viewport.scrollLeft, right);
  dispatch(h.canvas, "pointermove", { pointerId: 77, clientX: -10, clientY: start.y });
  assert.equal(h.viewport.scrollLeft, 0);
  dispatch(h.canvas, "pointerup", { pointerId: 77 });
  dispatch(h.canvas, "pointermove", { pointerId: 77, clientX: 50, clientY: start.y });
  assert.equal(h.viewport.scrollLeft, 0);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
});

test("Canvas geometry refresh moves IME target with scrolling and detaches on close", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = Buffer.from(h.native.save().bytes);
  h.viewport.scrollLeft = 120;
  const caret = caretGeometry(h.renderer.layout(), { ...h.paragraph, unit: 0 });
  h.viewport.scrollTop = (caret.screenBounds ?? caret).y + 100;
  h.renderer.notifyGeometry();
  assert.equal(Number.parseFloat(h.input.style.left), 120);
  assert.equal(Number.parseFloat(h.input.style.top), h.viewport.scrollTop);
  assert.equal(h.viewport.scrollLeft, 120, "manual scroll must not be undone by placement");
  assert.equal(h.requests.length, 0);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  h.controller.close();
  const before = { ...h.input.style };
  h.viewport.scrollLeft = 240; h.viewport.scrollTop = 200;
  h.renderer.notifyGeometry();
  assert.deepEqual(h.input.style, before);
});

test("Canvas keyboard reveals horizontal caret without editing native bytes", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = Buffer.from(h.native.save().bytes);
  h.viewport.clientWidth = 40;
  h.viewport.scrollLeft = 0;
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  const caret = caretGeometry(h.renderer.layout(), { ...h.paragraph, unit: h.input.selectionEnd });
  assert(caret);
  const bounds = caret.screenBounds ?? caret;
  assert(bounds.x > 40, "fixture must put the final caret beyond the narrow viewport");
  assert.equal(h.viewport.scrollLeft, bounds.x + 2 - 40);
  assert.equal(Number.parseFloat(h.input.style.left), bounds.x);
  const right = h.viewport.scrollLeft;
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  assert.equal(h.viewport.scrollLeft, right, "already visible caret must not drift on repeated navigation");
  dispatch(h.input, "keydown", { key: "Home", ctrlKey: true });
  const start = caretGeometry(h.renderer.layout(), { ...h.paragraph, unit: 0 });
  assert.equal(h.viewport.scrollLeft, (start.screenBounds ?? start).x);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
});

test("closed Canvas controller cannot restore text selection or send public editing commands", async t => {
  const h = await harness(t);
  const range = { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 };
  h.controller.close();
  const before = h.requests.length;
  h.controller.message({ kind: "enable", historyAvailable: true, structureAvailable: true });
  assert.equal(h.controller.selectTextRange(range), false);
  assert.equal(h.controller.replaceSelectedText("늦은 입력"), false);
  assert.equal(h.controller.replaceSelection("늦은 교체"), false);
  assert.equal(h.controller.history("undo"), false);
  assert.equal(h.controller.canHistory(), false);
  assert.equal(h.requests.length, before);
  assert.equal(h.input.disabled, true);
});

test("Canvas Enter carries anchored split capability on a normally editable paragraph", async t => {
  const h = await harness(t);
  h.paragraph.anchoredSplitAvailable = true;
  h.controller.message({ kind: "enable", structureAvailable: true });
  h.input.setSelectionRange(1, 1);
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].kind, "split");
  assert.equal(h.requests[0].anchored, true);
  assert.equal(h.requests[0].atUnit, 1);
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(h.requests.length, 1);
});

test("Canvas HWP5 resize sends picture record identity and blocks pending duplicate requests", async t => {
  const h = await harness(t);
  h.setBusy(false);
  h.renderer.selectedPicture = () => ({ section: 0, pictureNode: 17, resizeRecordNode: 18, geometry: { width: 10000, height: 6000, widthRelative: 4, heightRelative: 2 } });
  assert.equal(h.controller.selectedPicture(), null);
  h.controller.message({ kind: "enable", pictureResizeAvailable: true });
  assert.equal(h.controller.selectedPicture().pictureNode, 17);
  assert.equal(h.controller.resizePicture(7000, 11000), true);
  assert.deepEqual(h.requests.at(-1), { kind: "picture-resize", origin: "canvas", section: 0, pictureNode: 18, width: 7000, height: 11000 });
  const count = h.requests.length;
  assert.equal(h.controller.resizePicture(9000, 9000), false);
  assert.equal(h.requests.length, count);
});

test("Canvas group resize preserves paint identity and rejects protected or invalid record selection", async t => {
  const h = await harness(t);
  h.setBusy(false);
  let picture = { section: 0, pictureNode: 17, resizeRecordNode: 18, geometry: null, resizeGeometry: { width: 5000, height: 6000, widthRelative: 4, heightRelative: 2 } };
  h.renderer.selectedPicture = () => picture;
  h.controller.message({ kind: "enable", pictureResizeAvailable: true });
  assert.equal(h.controller.selectedPicture().resizeRecordNode, 18);
  assert.equal(picture.geometry, null);
  picture = { ...picture, sizeProtected: true };
  assert.equal(h.controller.resizePicture(7000, 11000), false);
  picture = { ...picture, sizeProtected: false, resizeRecordNode: -1 };
  assert.equal(h.controller.resizePicture(7000, 11000), false);
  assert.equal(h.requests.length, 0);
});

test("Canvas search selection validates current boundaries and does not issue edits", async t => {
  const h = await harness(t);
  const range = { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 };
  h.setBusy(false);
  const count = h.requests.length;
  assert.equal(h.controller.selectTextRange(range), true);
  assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 1);
  assert.equal(h.requests.length, count);
  assert.equal(h.controller.selectTextRange({ ...range, endUnit: -1 }), false);
  assert.equal(h.controller.selectTextRange({ ...range, paragraph: 0xffffffff }), false);
  h.setBusy(true); assert.equal(h.controller.selectTextRange(range), false);
});

test("Canvas found selection replacement follows the existing native command boundary", async t => {
  const h = await harness(t);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges([h.paragraph], a, f, undefined, { includeEmpty: true });
  h.setBusy(false);
  const range = { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 };
  assert.equal(h.controller.selectTextRange(range), true);
  const count = h.requests.length;
  assert.equal(h.controller.replaceSelection("찾기😀"), true);
  assert.equal(h.requests.length, count + 1);
  assert.equal(h.requests.at(-1).kind, "replace-paragraph-ranges");
  assert.equal(h.requests.at(-1).text, "찾기😀");
  assert.equal(h.controller.replaceSelection("중복"), false);
});

test("Canvas found text splice preserves native history and refuses pending duplicate replacement", async t => {
  const h = await harness(t);
  h.native.enableHistory();
  const original = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  const range = { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 };
  assert.equal(h.controller.selectTextRange(range), true);
  assert.equal(h.controller.replaceSelectedText("교체😀"), true);
  assert.equal(h.requests.at(-1).kind, "splice");
  assert.equal(h.controller.replaceSelectedText("중복"), false);
  h.ack();
  assert(h.input.value.startsWith("교체😀"));
  const saved = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  assert.equal(h.native.undo(), true); assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  assert.equal(h.native.redo(), true); assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), saved);
});

test("Canvas found restricted text requires the exact range grant", async t => {
  const rangeRequests = [], h = await harness(t, "charshape", p => p.editable && !p.sourceOffsets && p.text.length > 1, "", { rangeRequests });
  const range = { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 };
  assert.equal(h.controller.selectTextRange(range), true);
  assert.equal(h.controller.replaceSelectedText("교체"), false);
  const query = rangeRequests.at(-1);
  h.controller.message({ ...query, allowed: true });
  assert.equal(h.controller.replaceSelectedText("교체"), true);
  h.ack(); assert(h.input.value.startsWith("교체"));
});

test("Canvas restricted replacement preserves the approved range when replacement shares its prefix", async t => {
  const rangeRequests = [], h = await harness(t, "charshape", p => p.editable && !p.sourceOffsets && p.text.length > 1, "", { rangeRequests });
  const range = { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 };
  assert.equal(h.controller.selectTextRange(range), true);
  const query = rangeRequests.at(-1);
  h.controller.message({ ...query, allowed: true });
  assert.equal(h.controller.replaceSelectedText(h.input.value.slice(0, 1) + "교체"), true);
  assert.equal(h.requests.at(-1).startUnit, 0); assert.equal(h.requests.at(-1).endUnit, 1);
  h.ack(); assert(h.input.value.startsWith(h.paragraph.text.slice(0, 1) + "교체"));
});

test("Canvas found anchored text splice preserves the retained control bytes", async t => {
  const h = await harness(t, "software", p => p.paragraph === 44 && p.editable);
  h.type("\ufffc텍스트" + h.input.value.slice(1)); h.ack();
  const control = Buffer.from(h.native.copyText(0, 44).subarray(0, 16));
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 44, startUnit: 1, endUnit: 4 }), true);
  assert.equal(h.controller.replaceSelectedText("교체😀"), true);
  h.ack(); assert(h.input.value.startsWith("\ufffc교체😀"));
  assert.deepEqual(Buffer.from(h.native.copyText(0, 44).subarray(0, 16)), control);
});
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { createCanvasEditor } from "../../web/preview/canvas-editor.mjs";
import { displayContent } from "../../web/preview/content.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
import { caretGeometry } from "../../web/preview/text-geometry.mjs";
import { characterTogglePatch, characterSelectionState } from "../../web/preview/character-property-selection.mjs";
import { paragraphSelectionRanges, paragraphSelectionText } from "../../web/preview/paragraph-selection.mjs";
import { verifyRaw, inspect, paragraphRecords } from "./style-preservation/text-record-oracle.mjs";
import { verifyMerge } from "./style-preservation/merge-record-oracle.mjs";
import { verifySplit } from "./style-preservation/structure-record-oracle.mjs";
import { verifyChartFormulas } from "./style-preservation/formula-record-oracle.mjs";
import { sectionTexts, verifySaved } from "../../tools/hwp5-edit-corpus-lib.mjs";

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
test("Canvas split permission allows Enter without granting text input or stale grants", async t => {
  const splitRequests = [], rangeRequests = [];
  const h = await harness(t, "charshape", p => p.editable && !p.sourceOffsets && p.text.length > 1, "", { rangeRequests, splitRequests });
  h.controller.message({ kind: "enable", structureAvailable: true });
  assert.equal(splitRequests.length, 0);
  h.controller.message({ kind: "enable", structureAvailable: true, splitQueryAvailable: true });
  assert.equal(h.input.readOnly, true);
  const query = splitRequests.at(-1); assert(query);
  dispatch(h.input, "keydown", { key: "Enter" }); assert.equal(h.requests.length, 0);
  assert.match(h.note.textContent, /분할 범위를 확인 중/);
  h.controller.message({ ...query, kind: "query-edit-range", allowed: false });
  h.controller.message({ ...query, requestId: query.requestId + 1, allowed: true });
  dispatch(h.input, "keydown", { key: "Enter" }); assert.equal(h.requests.length, 0);
  h.controller.message({ ...query, allowed: true });
  assert.equal(h.input.readOnly, true);
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].kind, "split");
  h.setBusy(false);
  h.controller.message({ kind: "split", origin: "canvas", error: "ProtectedFieldRange" });
  const next = splitRequests.at(-1); assert.ok(next.requestId > query.requestId);
  h.controller.message({ ...query, allowed: true });
  dispatch(h.input, "keydown", { key: "Enter" }); assert.equal(h.requests.length, 1);
  h.controller.reset(); h.controller.message({ ...next, allowed: true });
  dispatch(h.input, "keydown", { key: "Enter" }); assert.equal(h.requests.length, 1);
});
test("Canvas restricted selection waits for exact permission and sends only approved draft range", async t => {
  const rangeRequests = [];
  const h = await harness(t, "charshape", p => p.editable && !p.sourceOffsets && p.text.length > 1, "", { rangeRequests });
  assert.equal(h.input.readOnly, true);
  assert.equal(rangeRequests.length, 1);
  const first = rangeRequests[0];
  h.controller.message({ ...first, requestId: first.requestId + 1, allowed: true });
  assert.equal(h.input.readOnly, true);
  h.controller.message({ ...first, allowed: true });
  assert.equal(h.input.readOnly, false);
  h.type(h.paragraph.text.slice(1));
  assert.equal(h.requests.length, 0);
  assert.equal(h.input.readOnly, true);
  const deletion = rangeRequests.at(-1);
  assert.equal(deletion.startUnit, 0); assert.equal(deletion.endUnit, 1);
  h.controller.message({ ...first, allowed: true });
  assert.equal(h.requests.length, 0);
  h.controller.message({ ...deletion, allowed: true });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].startUnit, 0); assert.equal(h.requests[0].endUnit, 1);
});
test("Canvas denied range restores uncommitted text and reset rejects late grants", async t => {
  const rangeRequests = [];
  const h = await harness(t, "charshape", p => p.editable && !p.sourceOffsets && p.text.length > 1, "", { rangeRequests });
  h.controller.message({ ...rangeRequests[0], allowed: true });
  h.type(h.paragraph.text.slice(1));
  const deletion = rangeRequests.at(-1);
  h.controller.message({ ...deletion, allowed: false });
  assert.equal(h.input.value, h.paragraph.text);
  assert.equal(h.requests.length, 0);
  h.controller.reset();
  h.controller.message({ ...rangeRequests.at(-1), allowed: true });
  assert.equal(h.input.disabled, true);
  assert.equal(h.requests.length, 0);
});
test("Canvas matching permission failure restores draft while foreign errors cannot discard it", async t => {
  const rangeRequests = [];
  const h = await harness(t, "charshape", p => p.editable && !p.sourceOffsets && p.text.length > 1, "", { rangeRequests });
  h.controller.message({ ...rangeRequests[0], allowed: true });
  h.type(h.paragraph.text.slice(1));
  const deletion = rangeRequests.at(-1), draft = h.input.value;
  h.controller.message({ ...deletion, requestId: deletion.requestId + 1, error: "OutOfMemory" });
  assert.equal(h.input.value, draft);
  h.controller.message({ ...deletion, error: "OutOfMemory", allowed: true });
  assert.equal(h.input.value, h.paragraph.text);
  assert.match(h.note.textContent, /OutOfMemory/);
  assert.equal(h.requests.length, 0);
  h.controller.message({ ...deletion, allowed: true });
  assert.equal(h.requests.length, 0);
});
test("Canvas queues rapid text until authoritative split target arrives", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.controller.message({ kind: "enable", structureAvailable: true });
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(h.input.readOnly, false);
  dispatch(h.input, "beforeinput", { inputType: "insertText", data: "FAST😀<&" });
  assert.equal(h.requests.length, 1);
  h.setBusy(false);
  h.controller.message({ kind: "split", origin: "canvas", splitTarget: { section: 0, paragraph: 7 } });
  assert.equal(h.requests.at(-1).kind, "splice");
  assert.equal(h.requests.at(-1).paragraph, 7);
  assert.equal(h.requests.at(-1).text, "FAST😀<&");
});
test("Canvas rapid split input commits to the actual generated native paragraph", async t => {
  const h = await harness(t);
  h.controller.message({ kind: "enable", structureAvailable: true });
  h.input.setSelectionRange(1, 1);
  const before = h.input.value;
  const rawBefore = h.native.text(h.paragraph.section, h.paragraph.paragraph);
  dispatch(h.input, "keydown", { key: "Enter" });
  dispatch(h.input, "beforeinput", { inputType: "insertText", data: "FAST😀<&" });
  h.ack();
  assert.equal(h.requests.at(-1).kind, "splice");
  assert.equal(h.requests.at(-1).paragraph, h.paragraph.paragraph + 1);
  h.ack();
  assert.equal(h.native.text(h.paragraph.section, h.paragraph.paragraph + 1), "FAST😀<&" + rawBefore.slice(1));
  assert.equal(h.input.value, "FAST😀<&" + before.slice(1));
});
test("Canvas split queue appends keys paste and text in arrival order", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.controller.message({ kind: "enable", structureAvailable: true });
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(dispatch(h.input, "keydown", { key: "A" }).defaultPrevented, true);
  dispatch(h.input, "paste", { clipboardData: { getData: () => "한글<&" } });
  dispatch(h.input, "beforeinput", { inputType: "insertText", data: "😀" });
  dispatch(h.input, "beforeinput", { inputType: "insertText", data: "\ud800" });
  assert.equal(h.requests.length, 1);
  h.setBusy(false);
  h.controller.message({ kind: "split", origin: "canvas", splitTarget: { section: 0, paragraph: 7 } });
  assert.equal(h.requests.at(-1).text, "A한글<&😀");
  assert.equal(h.requests.at(-1).paragraph, 7);
});
test("Canvas reset discards split queue and ignores late acknowledgement", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.controller.message({ kind: "enable", structureAvailable: true });
  dispatch(h.input, "keydown", { key: "Enter" });
  dispatch(h.input, "beforeinput", { inputType: "insertText", data: "OLD" });
  h.controller.reset();
  h.setBusy(false);
  h.controller.message({ kind: "split", origin: "canvas", splitTarget: { section: 0, paragraph: 7 } });
  assert.equal(h.requests.length, 1);
  assert.equal(h.input.disabled, true);
  assert.equal(h.input.value, "");
});
test("Canvas foreign split response cannot release queued input", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.controller.message({ kind: "enable", structureAvailable: true });
  dispatch(h.input, "keydown", { key: "Enter" });
  dispatch(h.input, "beforeinput", { inputType: "insertText", data: "NEW" });
  h.setBusy(false);
  h.controller.message({ kind: "split", origin: "other", splitTarget: { section: 0, paragraph: 7 } });
  assert.equal(h.requests.length, 1);
  h.controller.message({ kind: "split", origin: "canvas", splitTarget: { section: 0, paragraph: 7 } });
  assert.equal(h.requests.at(-1).text, "NEW");
});
test("Canvas split composition boundary does not publish intermediate IME text", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.controller.message({ kind: "enable", structureAvailable: true });
  dispatch(h.input, "keydown", { key: "Enter" });
  dispatch(h.input, "compositionstart");
  assert.equal(h.input.readOnly, true);
  dispatch(h.input, "beforeinput", { inputType: "insertCompositionText", data: "ㅎ", isComposing: true });
  dispatch(h.input, "compositionend", { data: "한" });
  h.setBusy(false);
  h.controller.message({ kind: "split", origin: "canvas", splitTarget: { section: 0, paragraph: 7 } });
  assert.equal(h.requests.length, 1);
  assert.equal(h.input.readOnly, false);
});
test("Canvas split queue never publishes to a failed missing or foreign target", async t => {
  for (const response of [{ error: "LimitExceeded" }, { splitTarget: null }, { splitTarget: { section: 1, paragraph: 7 } }]) await t.test(JSON.stringify(response), async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    const baseline = h.native.save().bytes;
    h.controller.message({ kind: "enable", structureAvailable: true });
    dispatch(h.input, "keydown", { key: "Enter" });
    dispatch(h.input, "beforeinput", { inputType: "insertText", data: "후속😀" });
    h.setBusy(false);
    h.controller.message({ kind: "split", origin: "canvas", ...response });
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.native.save().bytes, baseline);
    assert.match(h.note.textContent, response.error ? /대기 입력은 적용되지/ : /새 문단 위치/);
  });
});
test("Canvas split acknowledgement follows authoritative target beyond nested paragraph ordinals", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = h.native.save().bytes;
  h.controller.message({ kind: "enable", structureAvailable: true });
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(h.requests.at(-1).kind, "split");
  h.setBusy(false);
  h.controller.message({ kind: "split", origin: "canvas", splitTarget: { section: 0, paragraph: 7 } });
  assert.equal(h.canvas.dataset.caret, "0:7:0");
  assert.equal(h.input.value, h.renderer.paragraph({ section: 0, paragraph: 7 }).text);
  h.type("본문" + h.input.value);
  assert.equal(h.requests.at(-1).paragraph, 7);
  assert.deepEqual(h.native.save().bytes, original);
});
test("Canvas split acknowledgement refuses missing invalid and foreign authoritative targets", async t => {
  for (const splitTarget of [null, { section: 1, paragraph: 7 }, { section: 0, paragraph: 5 }, { section: 0, paragraph: 7.5 }]) await t.test(JSON.stringify(splitTarget), async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.controller.message({ kind: "enable", structureAvailable: true });
    dispatch(h.input, "keydown", { key: "Enter" });
    h.setBusy(false);
    h.controller.message({ kind: "split", origin: "canvas", splitTarget });
    assert.equal(h.input.disabled, true);
    assert.match(h.note.textContent, /새 문단 위치/);
  });
});
test("Canvas boundary merge follows explicit native neighbors instead of global numbering", async t => {
  for (const direction of ["backward", "forward", "none"]) await t.test(direction, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true });
    const original = h.renderer.paragraph;
    h.renderer.paragraph = point => {
      const row = original(point);
      return row && point.paragraph === 5 ? { ...row, previousMergeParagraph: direction === "none" ? null : 3, nextMergeParagraph: 7 } : row;
    };
    dispatch(h.input, "keydown", { key: direction === "forward" ? "End" : "Home" });
    dispatch(h.input, "keydown", { key: direction === "forward" ? "Delete" : "Backspace" });
    if (direction === "none") assert.equal(h.requests.length, 0);
    else {
      const request = h.requests.at(-1);
      assert.equal(request.kind, "merge");
      assert.equal(request.paragraph, direction === "forward" ? 5 : 3);
      assert.equal(request.rightParagraph, direction === "forward" ? 7 : 5);
    }
  });
});
test("Canvas size hint follows current caret intent without editing the document", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = h.native.save().bytes;
  h.renderer.characterPropertyTextAvailable = () => true;
  h.renderer.characterSize = () => 1234;
  assert.equal(h.controller.selectedCharacterSize(), 1234);
  assert.equal(h.controller.setCharacterProperties({ size: 1700 }), true);
  assert.equal(h.controller.selectedCharacterSize(), 1700);
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.controller.selectedCharacterSize(), 1234);
  h.setBusy(true); assert.equal(h.controller.selectedCharacterSize(), null);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.native.save().bytes, original);
});
test("Canvas single paragraph history refuses invalid restored text boundaries", async t => {
  for (const kind of ["short", "surrogate", "clipped", "missing"]) await t.test(kind, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.renderer.selectionRanges = () => null;
    h.native.enableHistory();
    const original = h.native.save().bytes;
    h.controller.message({ kind: "enable", historyAvailable: true, historyRevision: h.native.historyRevision(), historyRevisions: h.native.historyRevisions() });
    dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
    assert.equal(h.controller.toggleCharacterProperty("bold"), true); h.ack();
    const paragraph = h.renderer.paragraph;
    h.renderer.paragraph = point => {
      const row = paragraph(point);
      if (!row || point.paragraph !== 5) return row;
      if (kind === "missing") return null;
      return { ...row, ...(kind === "clipped" ? { clipped: true } : { text: kind === "short" ? "" : "😀" }) };
    };
    assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
    assert.equal(h.canvas.dataset.selection, "");
    assert.equal(h.input.disabled, true);
    assert.match(h.note.textContent, /원래 선택 위치/);
    assert.deepEqual(h.native.save().bytes, original);
  });
});
test("Canvas single paragraph format history restores selection without multi paragraph ownership", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.selectionRanges = () => null;
  h.native.enableHistory();
  h.controller.message({ kind: "enable", historyAvailable: true, historyRevision: h.native.historyRevision(), historyRevisions: h.native.historyRevisions() });
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.controller.toggleCharacterProperty("bold"), true); h.ack();
  assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.selection, "0:1");
  assert.equal(h.controller.history("redo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.selection, "0:1");
});
test("Canvas toolbar focus transfer preserves document selection without native edits", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = h.native.save().bytes;
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  const selected = h.controller.selectedRange();
  assert.deepEqual(selected, { section: 0, paragraph: 5, startUnit: 0, endUnit: 1 });
  h.input.blur();
  assert.deepEqual(h.controller.selectedRange(), selected);
  assert.equal(h.canvas.dataset.selection, "0:1");
  h.input.focus();
  assert.deepEqual(h.controller.selectedRange(), selected);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.native.save().bytes, original);
});
test("Canvas structural acknowledgement retains repeated-area instance through split and merge", async t => {
  const h = await harness(t);
  const baseLayout = h.renderer.layout;
  h.renderer.layout = () => ({ ...baseLayout(), rows: baseLayout().rows.map(row => ({ ...row, pageArea: "header", pageOrdinal: 1 })) });
  let selection;
  h.renderer.select = value => { selection = value; };
  h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true });
  const caret = caretGeometry(h.renderer.layout(), { ...h.paragraph, unit: 1, pageArea: "header", pageOrdinal: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 9, clientX: caret.x, clientY: caret.y });
  dispatch(h.canvas, "pointerup", { pointerId: 9 });
  assert.equal(selection.focus.pageOrdinal, 1);
  dispatch(h.input, "keydown", { key: "Enter" }); h.ack();
  assert.equal(selection.focus.pageArea, "header"); assert.equal(selection.focus.pageOrdinal, 1);
  dispatch(h.input, "keydown", { key: "Backspace" }); h.ack();
  assert.equal(selection.focus.pageArea, "header"); assert.equal(selection.focus.pageOrdinal, 1);
});
test("Canvas word movement crosses only adjacent paragraphs of the same owner", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  dispatch(h.input, "keydown", { key: "ArrowRight", ctrlKey: true });
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  dispatch(h.input, "keydown", { key: "ArrowLeft", ctrlKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:4");
  rows[1].selectionOwner = "foreign";
  dispatch(h.input, "keydown", { key: "ArrowRight", ctrlKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:4");
  assert.equal(h.requests.length, 0);
});
test("Canvas macOS Cmd arrows collapse multi paragraph selection then follow line edges", async t => {
  for (const [key, unit] of [["ArrowLeft", 0], ["ArrowRight", 4]]) await t.test(key, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5, "MacIntel");
    const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
    h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
    const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
    dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 2, clientX: end.x, clientY: end.y, shiftKey: true });
    dispatch(h.canvas, "pointerup", { pointerId: 2 });
    dispatch(h.input, "keydown", { key, metaKey: true });
    assert.equal(h.canvas.dataset.caret, `0:6:${unit}`);
    assert.equal(h.canvas.dataset.selection, `${unit}:${unit}`);
    assert.equal(h.input.value, rows[1].text);
    assert.equal(h.requests.length, 0);
  });
});
test("Canvas macOS Option word movement and Cmd line edges share geometry", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5, "MacIntel");
  dispatch(h.input, "keydown", { key: "ArrowRight", altKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:3");
  dispatch(h.input, "keydown", { key: "ArrowLeft", metaKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  dispatch(h.input, "keydown", { key: "ArrowRight", metaKey: true, shiftKey: true });
  assert.equal(h.canvas.dataset.selection, "0:4");
  assert.equal(h.requests.length, 0);
});
test("Canvas Ctrl arrows move by words and Shift extends without native edits", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const original = h.native.save().bytes;
  dispatch(h.input, "keydown", { key: "ArrowRight", ctrlKey: true, shiftKey: true });
  assert.equal(h.canvas.dataset.selection, "0:3");
  dispatch(h.input, "keydown", { key: "ArrowLeft", ctrlKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  dispatch(h.input, "keydown", { key: "ArrowRight", ctrlKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:3");
  dispatch(h.input, "keydown", { key: "ArrowLeft", ctrlKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.native.save().bytes, original);
});
test("Canvas single paragraph multiline paste preserves empty lines suffix and one undo", async t => {
  for (const kind of ["paste", "beforeinput", "menu"]) await t.test(kind, async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges([h.paragraph], a, f, undefined, { includeEmpty: true });
  h.renderer.paragraphReplacementAvailable = () => true;
  h.native.enableHistory();
  const original = h.native.save().bytes;
  h.input.setSelectionRange(1, 3);
  if (kind === "menu") {
    dispatch(h.input, "select");
    assert.equal(await h.controller.pasteSelection({ clipboard: { readText: async () => "첫😀\r\n\r\n둘" } }), true);
  } else {
    const event = kind === "paste" ? dispatch(h.input, "paste", { clipboardData: { getData: () => "첫😀\r\n\r\n둘" } }) :
      dispatch(h.input, "beforeinput", { inputType: "insertFromPaste", data: "첫😀\r\n\r\n둘" });
    assert.equal(event.defaultPrevented, true);
  }
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0].ranges, [{ section: 0, paragraph: 5, startUnit: 1, endUnit: 3 }]);
  h.ack();
  assert.equal(h.input.value, "둘6");
  assert.equal(h.canvas.dataset.caret, "0:7:1");
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  const streams = inspect(original).streams, expected = sectionTexts(streams), rows = expected.get(0);
  expected.set(0, [...rows.slice(0, 5), ...["문첫😀", "", "둘6"].map(text => Buffer.from(text + "\r", "utf16le")), ...rows.slice(6)]);
  verifySaved(streams, inspect(saved).streams, expected);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.redo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
  });
});
test("Canvas revision metadata restores multiline selection with native history", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges([h.paragraph], a, f, undefined, { includeEmpty: true });
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(Array.from({ length: 20 }, (_, paragraph) => h.renderer.paragraph({ section: 0, paragraph })).filter(Boolean), a, f, undefined, { includeEmpty: true });
  h.renderer.paragraphReplacementAvailable = () => true;
  h.native.enableHistory(); h.controller.message({ kind: "enable", historyAvailable: true, historyRevision: h.native.historyRevision() });
  dispatch(h.input, "paste", { clipboardData: { getData: () => "첫\n\n끝" } });
  h.ack();
  assert.equal(h.canvas.dataset.caret, "0:7:1");
  assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  assert.equal(h.controller.history("redo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.caret, "0:7:1");
  h.controller.message({ kind: "save", historyRevision: h.native.historyRevision() });
  h.controller.external({ kind: "character-properties", origin: "form" });
  h.native.setCharacterProperties({ section: 0, paragraph: 7, startUnit: 0, endUnit: 1, properties: { bold: true } });
  h.controller.message({ kind: "character-properties", origin: "form", historyRevision: h.native.historyRevision() });
  assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.caret, "0:7:1", "external form edit preserves the previous canvas selection");
  const revision = h.native.historyRevision();
  h.controller.external({ kind: "splice", origin: "form" });
  h.native.splice({ section: 0, paragraph: 7, startUnit: 0, endUnit: 0, text: "" });
  assert.equal(h.native.historyRevision(), revision);
  h.controller.message({ kind: "splice", origin: "form", historyRevision: revision });
  assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.caret, "0:5:0", "a form no-op must not overwrite the old restore selection");
});

test("Canvas native typing history restores the pre-insertion caret rather than the new DOM caret", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges([h.renderer.paragraph(a)], a, f, undefined, { includeEmpty: true });
  h.native.enableHistory(); h.controller.message({ kind: "enable", historyAvailable: true, historyRevision: h.native.historyRevision(), historyRevisions: h.native.historyRevisions() });
  h.type("한😀" + h.input.value); h.ack();
  assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  assert.equal(h.controller.history("redo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.caret, "0:5:7");
});

test("Canvas undo restores backward input selection even when replacement shares its first character", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges([h.renderer.paragraph(a)], a, f, undefined, { includeEmpty: true });
  h.native.enableHistory(); h.controller.message({ kind: "enable", historyAvailable: true, historyRevision: h.native.historyRevision(), historyRevisions: h.native.historyRevisions() });
  h.input.setSelectionRange(0, 2, "backward"); dispatch(h.input, "select");
  dispatch(h.input, "beforeinput", { inputType: "insertReplacementText", data: "문😀" });
  h.type("문😀" + h.input.value.slice(2)); h.ack();
  assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
  assert.equal(h.canvas.dataset.selection, "2:0");
  assert.equal(h.input.selectionDirection, "backward");
});

test("Canvas invalid reachable history metadata cannot throw or alter native document bytes", async t => {
  for (const historyRevisions of [[0, 0], [1], [0xffffffff], "0"]) await t.test(JSON.stringify(historyRevisions), async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    const original = h.native.save().bytes;
    h.native.enableHistory();
    assert.doesNotThrow(() => h.controller.message({ kind: "enable", historyAvailable: true, historyRevision: 0, historyRevisions }));
    assert.equal(h.canvas.dataset.caret, "");
    assert.equal(h.input.disabled, true);
    assert.equal(h.controller.canHistory(), true);
    assert.deepEqual(h.native.save().bytes, original);
    assert.match(h.note.textContent, /선택 정보/);
  });
});

test("Canvas unknown native revision does not retain a different original paragraph as the caret", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges([h.paragraph], a, f, undefined, { includeEmpty: true });
  h.renderer.paragraphReplacementAvailable = () => true;
  h.native.enableHistory(); h.controller.message({ kind: "enable", historyAvailable: true });
  const original = h.native.save().bytes;
  dispatch(h.input, "paste", { clipboardData: { getData: () => "첫\n\n끝" } });
  h.ack();
  assert.equal(h.canvas.dataset.caret, "0:7:1");
  assert.equal(h.controller.history("undo"), true); h.ackNativeHistory();
  assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.canvas.dataset.caret, "");
  assert.equal(h.input.disabled, true);
  assert.equal(h.controller.canHistory(), true);
  assert.match(h.note.textContent, /원래 선택 위치/);
});

test("Canvas multi paragraph composition commits once or cancels without editing", async t => {
  for (const mode of ["한😀", "", "\t", "reset", "reverse"]) await t.test(JSON.stringify(mode), async t => {
    const text = mode === "reverse" ? "한😀" : mode;
    const h = await harness(t, "parashape", p => p.paragraph === (mode === "reverse" ? 6 : 5));
    const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
    h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
    h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges(rows, a, f, undefined, { includeEmpty: true });
    h.renderer.paragraphReplacementAvailable = () => true;
    if (mode === "reverse") {
      h.input.setSelectionRange(1, 1);
      dispatch(h.input, "select");
    }
    const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: mode === "reverse" ? 5 : 6, unit: mode === "reverse" ? 0 : 1 });
    dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 7, clientX: end.x, clientY: end.y, shiftKey: true });
    dispatch(h.canvas, "pointerup", { pointerId: 7 });
    assert.equal(h.input.readOnly, false);
    const original = h.native.save().bytes;
    h.native.enableHistory();
    dispatch(h.input, "compositionstart");
    assert.equal(h.canvas.dataset.composing, "true");
    const event = dispatch(h.input, "beforeinput", { inputType: "insertCompositionText", isComposing: true, data: "ㅎ" });
    assert.equal(event.defaultPrevented, false);
    h.input.value = "ㅎ";
    dispatch(h.input, "input", { isComposing: true });
    const draftText = h.renderer.layout().rows.filter(row => row.kind === "text" && row.section === 0 && row.paragraph === 5).map(row => row.text).join("");
    assert.equal(draftText, "ㅎ");
    assert.equal(h.renderer.paragraph({ section: 0, paragraph: 5 }).text, rows[0].text);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.native.save().bytes, original);
    if (text === "reset") {
      h.controller.reset();
      dispatch(h.input, "compositionend", { data: "늦은 입력" });
      dispatch(h.input, "input");
      assert.equal(h.requests.length, 0);
      assert.equal(h.input.disabled, true);
      assert.deepEqual(h.native.save().bytes, original);
      return;
    }
    dispatch(h.input, "compositionend", { data: text });
    dispatch(h.input, "compositionend", { data: text });
    dispatch(h.input, "input");
    assert.equal(h.requests.length, text ? 1 : 0);
    if (!text) { assert.deepEqual(h.native.save().bytes, original); return; }
    assert.equal(h.requests[0].text, text);
    h.ack();
    if (text === "\t") {
      assert.deepEqual(h.native.save().bytes, original);
      assert.match(h.note.textContent, /교체 실패/);
      assert.equal(h.canvas.dataset.caret, "0:6:1");
    } else {
      assert.equal(h.input.value, "한😀단 7");
      assert.equal(h.canvas.dataset.caret, "0:5:3");
      const saved = h.native.save({ allowStaleLayout: true }).bytes;
      const streams = inspect(original).streams;
      const expected = sectionTexts(streams), originalRows = expected.get(0);
      expected.set(0, [...originalRows.slice(0, 5),
        Buffer.concat([Buffer.from(text, "utf16le"), originalRows[6].subarray(2)]),
        ...originalRows.slice(7)]);
      verifySaved(streams, inspect(saved).streams, expected);
      assert.equal(h.native.undo(), true);
      assert.deepEqual(h.native.save().bytes, original);
      assert.equal(h.native.redo(), true);
      assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
    }
  });
});
test("Canvas multi paragraph replacement deletion and paste acknowledge native text and caret", async t => {
  for (const operation of ["replace", "delete", "menu-delete", "paste", "multiline", "cut", "cut-key", "cut-denied", "cut-stale", "type", "refuse"]) await t.test(operation, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
    const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
    h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
    h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges(rows, a, f, undefined, { includeEmpty: true });
    h.renderer.selectionText = (a, f) => paragraphSelectionText(rows, a, f);
    const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 1 });
    const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 2 });
    dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 8, clientX: start.x, clientY: start.y });
    dispatch(h.canvas, "pointermove", { pointerId: 8, clientX: end.x, clientY: end.y });
    dispatch(h.canvas, "pointerup", { pointerId: 8 });
    const original = h.native.save({ allowStaleLayout: true }).bytes;
    let existingRedo;
    if (operation === "refuse") {
      h.native.enableHistory();
      h.native.splice({ section: 0, paragraph: 5, startUnit: 0, endUnit: 0, text: "기존" });
      existingRedo = h.native.save({ allowStaleLayout: true }).bytes;
      assert.equal(h.native.undo(), true);
    }
    if (operation.startsWith("cut-")) {
      const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
      let resolve;
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: text => {
        assert.equal(text, "단 6\n문단");
        if (operation === "cut-denied") return Promise.reject(new Error("denied"));
        if (operation === "cut-stale") return new Promise(done => { resolve = done; });
        return Promise.resolve();
      } } } });
      t.after(() => { if (previous) Object.defineProperty(globalThis, "navigator", previous); else delete globalThis.navigator; });
      dispatch(h.input, "keydown", { key: "x", metaKey: true });
      if (operation === "cut-stale") { dispatch(h.input, "keydown", { key: "ArrowRight" }); resolve(); }
      await Promise.resolve();
      if (operation !== "cut-key") {
        assert.equal(h.requests.length, 0);
        assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
        return;
      }
    }
    else if (operation === "delete") dispatch(h.input, "keydown", { key: "Backspace" });
    else if (operation === "menu-delete") assert.equal(h.controller.deleteSelection(), true);
    else if (operation === "type") dispatch(h.input, "keydown", { key: "😀" });
    else if (operation === "cut") dispatch(h.input, "cut", { clipboardData: { setData: (type, text) => { assert.equal(type, "text/plain"); assert.equal(text, "단 6\n문단"); } } });
    else if (operation === "paste") dispatch(h.input, "paste", { clipboardData: { getData: () => "한😀" } });
    else if (operation === "multiline") dispatch(h.input, "paste", { clipboardData: { getData: () => "한😀\r\n\r둘" } });
    else assert.equal(h.controller.replaceSelection(operation === "refuse" ? "\t" : "한😀"), true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].kind, "replace-paragraph-ranges");
    if (operation === "refuse") dispatch(h.input, "keydown", { key: "대" });
    h.ack();
    if (operation === "refuse") {
      assert.equal(h.requests.length, 1);
      assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
      assert.equal(h.canvas.dataset.caret, "0:6:2");
      assert.equal(h.input.readOnly, true);
      assert.equal(h.native.redo(), true);
      assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, existingRedo);
      assert.equal(h.native.undo(), true);
      assert.equal(h.controller.replaceSelection("한😀"), true);
      h.ack();
      assert.equal(h.input.value, "문한😀 7");
      assert.equal(h.canvas.dataset.caret, "0:5:4");
      assert.equal(h.native.undo(), true);
      assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
    } else {
      const deletion = ["delete", "menu-delete", "cut", "cut-key"].includes(operation);
      assert.equal(h.input.value, deletion ? "문 7" : operation === "multiline" ? "둘 7" : operation === "type" ? "문😀 7" : "문한😀 7");
      assert.equal(h.canvas.dataset.caret, deletion ? "0:5:1" : operation === "multiline" ? "0:7:1" : operation === "type" ? "0:5:3" : "0:5:4");
      assert.equal(h.input.readOnly, false);
    }
  });
});
test("Canvas multi paragraph Shift navigation preserves anchor and changes focus range", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 3, clientX: end.x, clientY: end.y, shiftKey: true });
  dispatch(h.canvas, "pointerup", { pointerId: 3 });
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.input.readOnly, true);
  assert.equal(h.canvas.dataset.caret, "0:6:2");
  assert.equal(h.controller.setCharacterProperties({ italic: true }), true);
  assert.deepEqual(h.requests[0].ranges.map(range => [range.paragraph, range.startUnit, range.endUnit]), [[5, 0, rows[0].text.length], [6, 0, 2]]);
  const caret = h.canvas.dataset.caret;
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, caret);
  h.ack();
  dispatch(h.input, "keydown", { key: "ArrowLeft", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:6:1");
  assert.equal(h.input.readOnly, true);
});

test("Canvas Shift arrows cross adjacent paragraph boundaries but refuse foreign ownership", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  assert.equal(h.input.readOnly, true);
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:6:1");
  dispatch(h.input, "keydown", { key: "ArrowLeft", shiftKey: true });
  dispatch(h.input, "keydown", { key: "ArrowLeft", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, `0:5:${rows[0].text.length}`);
  assert.equal(h.input.readOnly, false);
  rows[1].selectionOwner = "foreign";
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, `0:5:${rows[0].text.length}`);
});

test("Canvas retains desired x across short rows and resets it after horizontal movement", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6, 7].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  const layout = layoutContent({ paragraphs: rows.map((p, i) =>
    ({ ...p, text: i === 1 ? "x" : p.text })), limited: false }, 500, () => 10);
  h.renderer.layout = () => layout;
  const start = caretGeometry(layout, { section: 0, paragraph: 5, unit: 3 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 9, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointerup", { pointerId: 9 });
  dispatch(h.input, "keydown", { key: "ArrowDown", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:6:1");
  dispatch(h.input, "keyup", { key: "ArrowDown" });
  dispatch(h.input, "keydown", { key: "ArrowDown", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:7:3");
  dispatch(h.input, "keydown", { key: "ArrowLeft", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:7:2");
  dispatch(h.input, "keydown", { key: "ArrowUp", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:6:1");
  dispatch(h.input, "keydown", { key: "ArrowUp", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:2");
  assert.equal(h.requests.length, 0);
});

test("Canvas queues printable typing while multi paragraph replacement is pending", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges(rows, a, f, undefined, { includeEmpty: true });
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 2 });
  h.viewport.getBoundingClientRect = () => ({ top: 0, bottom: 10000 });
  dispatch(h.canvas, "pointermove", { pointerId: 1 });
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 9, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 9, clientX: end.x, clientY: end.y });
  dispatch(h.canvas, "pointerup", { pointerId: 9 });
  dispatch(h.input, "keydown", { key: "A" });
  dispatch(h.input, "keydown", { key: "😀" });
  dispatch(h.input, "keydown", { key: "B" });
  assert.equal(h.requests.length, 1);
  h.ack();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].text, "😀B");
  const beforeAppend = h.native.save({ allowStaleLayout: true }).bytes;
  h.ack();
  assert.equal(h.input.value, "문A😀B 7");
  assert.equal(h.canvas.dataset.caret, "0:5:5");
  verifyRaw(beforeAppend, h.native.save({ allowStaleLayout: true }).bytes, 0, 5, 2, 2, "😀B");
});

test("Canvas typing after ordinary paragraph navigation edits only the destination", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  const original = h.native.save().bytes;
  h.native.enableHistory();
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  dispatch(h.input, "keydown", { key: "ArrowRight" });
  const text = "한😀";
  h.input.value = text + rows[1].text;
  h.input.setSelectionRange(text.length, text.length);
  dispatch(h.input, "input");
  assert.deepEqual(h.requests[0], {
    kind: "splice", origin: "canvas", section: 0, paragraph: 6,
    startUnit: 0, endUnit: 0, text,
  });
  dispatch(h.input, "keydown", { key: "ArrowUp" });
  assert.equal(h.requests.length, 1);
  assert.equal(h.canvas.dataset.caret, "0:6:3");
  h.ack();
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  verifyRaw(original, saved, 0, 6, 0, 0, text);
  assert.equal(h.canvas.dataset.caret, "0:6:3");
  const reopened = await createExperimentalHwp5Editor(wasm, saved);
  try {
    assert.deepEqual(reopened.copyText(0, 5), h.native.copyText(0, 5));
    assert.deepEqual(Buffer.from(reopened.copyText(0, 6)), Buffer.from(text + rows[1].text + "\r", "utf16le"));
  } finally { reopened.close(); }
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.redo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
});

test("Canvas ordinary arrows cross paragraphs without edits and refuse foreign owners", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  const original = h.native.save().bytes;
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  dispatch(h.input, "keydown", { key: "ArrowRight" });
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  assert.equal(h.input.value, rows[1].text);
  assert.equal(h.input.readOnly, false);
  dispatch(h.input, "keyup", { key: "ArrowRight" });
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  dispatch(h.input, "keydown", { key: "ArrowLeft" });
  assert.equal(h.canvas.dataset.caret, `0:5:${rows[0].text.length}`);
  dispatch(h.input, "keydown", { key: "Home", ctrlKey: true });
  dispatch(h.input, "keydown", { key: "ArrowDown" });
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  dispatch(h.input, "keydown", { key: "ArrowUp" });
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  rows[1].selectionOwner = "foreign";
  dispatch(h.input, "keydown", { key: "ArrowDown" });
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  dispatch(h.input, "keydown", { key: "ArrowRight" });
  assert.equal(h.canvas.dataset.caret, `0:5:${rows[0].text.length}`);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.native.save().bytes, original);
});

test("Canvas Shift vertical navigation crosses paragraphs and returns without losing anchor", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  dispatch(h.input, "keydown", { key: "ArrowDown", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  assert.equal(h.input.readOnly, true);
  dispatch(h.input, "keydown", { key: "ArrowUp", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:0");
  assert.equal(h.input.readOnly, false);
  rows[1].selectionOwner = "foreign";
  dispatch(h.input, "keydown", { key: "ArrowDown", shiftKey: true });
  assert.equal(h.canvas.dataset.caret, "0:5:0");
});

test("Canvas keyboard boundary-only selection copies newline and deletes through one verified merge", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const before = Buffer.from(h.native.save().bytes);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges(rows, a, f, undefined, { includeEmpty: true });
  h.renderer.selectionText = (a, f) => paragraphSelectionText(rows, a, f);
  dispatch(h.input, "keydown", { key: "End", ctrlKey: true });
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  let copied;
  dispatch(h.input, "copy", { clipboardData: { setData: (kind, text) => { assert.equal(kind, "text/plain"); copied = text; } } });
  assert.equal(copied, "\n");
  h.renderer.paragraphReplacementAvailable = () => false;
  dispatch(h.input, "keydown", { key: "Backspace" });
  assert.equal(h.requests.length, 0);
  assert.equal(h.input.readOnly, true);
  assert.match(h.note.textContent, /WASM.*지원하지 않습니다/);
  assert.deepEqual(Buffer.from(h.native.save().bytes), before);
  h.renderer.paragraphReplacementAvailable = () => true;
  dispatch(h.input, "keydown", { key: "Backspace" });
  assert.deepEqual(h.requests[0].ranges.map(range => [range.paragraph, range.startUnit, range.endUnit]), [[5, rows[0].text.length, rows[0].text.length], [6, 0, 0]]);
  h.ack();
  assert.equal(h.input.value, rows[0].text + rows[1].text);
  assert.equal(h.canvas.dataset.caret, `0:5:${rows[0].text.length}`);
  verifyMerge(before, Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), 0, 5);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(Buffer.from(h.native.save().bytes), before);
  assert.equal(h.native.undo(), false);
});

test("Canvas Enter replaces multi paragraph selection with one newline transaction", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const original = Buffer.from(h.native.save().bytes);
  h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges(rows, a, f, undefined, { includeEmpty: true });
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 1 });
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 2 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 8, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 8, clientX: end.x, clientY: end.y });
  dispatch(h.canvas, "pointerup", { pointerId: 8 });
  dispatch(h.input, "keydown", { key: "Enter" });
  dispatch(h.input, "keydown", { key: "Enter", repeat: true });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].kind, "replace-paragraph-ranges");
  assert.equal(h.requests[0].text, "\n");
  h.ack();
  assert.equal(h.native.text(0, 5), "문\r");
  assert.equal(h.native.text(0, 6), " 7\r");
  assert.equal(h.input.value, " 7");
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  const changed = h.native.save({ allowStaleLayout: true }).bytes;
  assert.equal(h.native.undo(), true);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  assert.equal(h.native.undo(), false);
  assert.equal(h.native.redo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, changed);
});

test("Canvas horizontal arrows collapse forward and reverse selections to their ordered edges", async t => {
  for (const reverse of [false, true]) for (const key of ["ArrowLeft", "ArrowRight"]) await t.test(`${reverse ? "reverse" : "forward"} ${key}`, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
    const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
    h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
    const points = [{ section: 0, paragraph: 5, unit: 1 }, { section: 0, paragraph: 6, unit: 2 }];
    if (reverse) points.reverse();
    const [start, end] = points.map(point => caretGeometry(h.renderer.layout(), point));
    dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 8, clientX: start.x, clientY: start.y });
    dispatch(h.canvas, "pointermove", { pointerId: 8, clientX: end.x, clientY: end.y });
    dispatch(h.canvas, "pointerup", { pointerId: 8 });
    dispatch(h.input, "keydown", { key });
    const expected = key === "ArrowLeft" ? { paragraph: 5, unit: 1 } : { paragraph: 6, unit: 2 };
    assert.equal(h.canvas.dataset.caret, `0:${expected.paragraph}:${expected.unit}`);
    assert.equal(h.input.value, rows.find(row => row.paragraph === expected.paragraph).text);
    assert.equal(h.input.readOnly, false);
    assert.equal(h.requests.length, 0);
  });
});

test("Canvas multi paragraph beforeinput replaces selection without keydown and blocks duplicate requests", async t => {
  for (const inputType of ["insertText", "insertReplacementText", "insertFromPaste", "insertParagraph", "deleteContentBackward", "deleteContentForward"]) await t.test(inputType, async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
    const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
    h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
    h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges(rows, a, f, undefined, { includeEmpty: true });
    const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 1 });
    const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 2 });
    dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 8, clientX: start.x, clientY: start.y });
    dispatch(h.canvas, "pointermove", { pointerId: 8, clientX: end.x, clientY: end.y });
    dispatch(h.canvas, "pointerup", { pointerId: 8 });
    const event = dispatch(h.input, "beforeinput", { inputType, data: "한😀" });
    assert.equal(event.defaultPrevented, true);
    assert.equal(h.requests.length, 1);
    dispatch(h.input, "beforeinput", { inputType, data: "후속" });
    assert.equal(h.requests.length, 1);
    h.ack();
    if (inputType === "insertText") {
      assert.equal(h.requests.length, 2);
      assert.equal(h.requests[1].text, "후속");
      h.ack();
    }
    assert.equal(h.input.value, inputType === "insertParagraph" ? " 7" : inputType.startsWith("delete") ? "문 7" : inputType === "insertText" ? "문한😀후속 7" : "문한😀 7");
    assert.equal(h.input.readOnly, false);
  });
});

test("Canvas Shift click extends verified paragraph ownership and collapses at foreign ownership", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 3, clientX: end.x, clientY: end.y, shiftKey: true });
  dispatch(h.canvas, "pointerup", { pointerId: 3 });
  assert.equal(h.input.readOnly, true);
  assert.equal(h.controller.selectedRange(), null);
  assert.equal(h.controller.setCharacterProperties({ italic: true }), true);
  assert.deepEqual(h.requests[0].ranges.map(range => range.paragraph), [5, 6]);
  h.ack();
  h.selectTarget();
  rows[1].selectionOwner = "foreign";
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 4, clientX: end.x, clientY: end.y, shiftKey: true });
  dispatch(h.canvas, "pointerup", { pointerId: 4 });
  assert.equal(h.input.readOnly, false);
  assert.deepEqual(h.controller.selectedRange(), { section: 0, paragraph: 6, startUnit: 1, endUnit: 1 });
});
test("Canvas multiple paragraph fonts require batch support and undo as one transaction", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 });
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 2, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 2, clientX: end.x, clientY: end.y });
  dispatch(h.canvas, "pointerup", { pointerId: 2 });
  h.renderer.characterFontAvailable = () => true;
  assert.equal(h.controller.setCharacterFont("hangul", 0), false);
  h.renderer.characterFontRangesAvailable = () => true;
  const sourceId = h.native.characterRanges(0, 5)[0].charShapeId;
  const sourceFont = h.native.characterFontReferences().find(row => row.id === sourceId).fontIds[0];
  const fontId = h.native.fontFaces().find(row => row.language === "hangul" && row.id !== sourceFont).id;
  const original = h.native.save().bytes;
  assert.equal(h.controller.setCharacterFont("hangul", fontId), true);
  assert.equal(h.controller.setCharacterFont("hangul", fontId), false);
  assert.equal(h.requests.at(-1).kind, "character-font-ranges");
  h.ack();
  assert.equal(h.controller.selectedFontRanges().length, 2);
  for (const paragraph of [5, 6]) {
    const id = h.native.characterRanges(0, paragraph)[0].charShapeId;
    assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], fontId);
  }
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
});

test("Canvas multi paragraph drag dispatches one batch without applying text to only the first paragraph", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
  const first = h.renderer.paragraph({ section: 0, paragraph: 5 });
  const second = h.renderer.paragraph({ section: 0, paragraph: 6 });
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges([first, second], a, f);
  h.renderer.selectionText = (a, f) => paragraphSelectionText([first, second], a, f);
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 });
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 2, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 2, clientX: end.x, clientY: end.y });
  dispatch(h.canvas, "pointerup", { pointerId: 2 });
  assert.equal(h.input.readOnly, true);
  assert.equal(h.controller.selectedRange(), null);
  h.renderer.characterPropertyRangesAvailable = () => false;
  assert.equal(h.controller.selectedCharacterPropertyRanges(), null);
  const beforeRefusal = h.native.save().bytes;
  assert.equal(h.controller.setCharacterProperties({ size: 1700 }), false);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.native.save().bytes, beforeRefusal);
  h.renderer.characterPropertyRangesAvailable = () => true;
  assert.deepEqual(h.controller.selectedCharacterPropertyRanges(), [
    { section: 0, paragraph: 5, startUnit: 0, endUnit: first.text.length },
    { section: 0, paragraph: 6, startUnit: 0, endUnit: 1 },
  ]);
  h.setBusy(true); assert.equal(h.controller.selectedCharacterPropertyRanges(), null); h.setBusy(false);
  assert.equal(h.controller.selectedParagraphFormat(), null);
  const clipboard = new Map();
  const copied = dispatch(h.input, "copy", { clipboardData: { setData: (type, text) => clipboard.set(type, text) } });
  assert.equal(copied.defaultPrevented, true);
  assert.equal(clipboard.get("text/plain"), first.text + "\n" + second.text.slice(0, 1));
  const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const written = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async text => { written.push(text); } } } });
  t.after(() => { if (navigatorBefore) Object.defineProperty(globalThis, "navigator", navigatorBefore); else delete globalThis.navigator; });
  const copiedByKey = dispatch(h.input, "keydown", { key: "c", metaKey: true });
  assert.equal(copiedByKey.defaultPrevented, true);
  assert.deepEqual(written, [first.text + "\n" + second.text.slice(0, 1)]);
  await Promise.resolve();
  h.type(h.input.value + "blocked");
  assert.equal(h.requests.length, 0);
  h.native.enableHistory();
  h.controller.message({ kind: "enable", historyAvailable: true });
  const originalBytes = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  h.renderer.textColorRangesAvailable = () => false;
  assert.equal(h.controller.selectedTextColorRanges(), null);
  assert.equal(h.controller.setCharacterTextColor("#123456"), false);
  h.renderer.textColorRangesAvailable = () => true;
  assert.equal(h.controller.selectedTextColorRanges().length, 2);
  assert.equal(h.controller.setCharacterTextColor("#123456"), true);
  assert.equal(h.controller.setCharacterTextColor("#ffffff"), false);
  assert.equal(h.requests.at(-1).kind, "character-text-color-ranges");
  h.ack();
  for (const paragraph of [5, 6]) {
    const id = h.native.characterRanges(0, paragraph).find(row => row.start === 0).charShapeId;
    assert.equal(h.native.characterTextColors().find(row => row.id === id).color, 0x123456);
  }
  assert.equal(h.controller.history("undo"), true);
  assert.equal(h.native.undo(), true);
  h.ackHistory(first.text);
  assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), originalBytes);
  h.requests.length = 0;
  h.renderer.characterUnderlineRangesAvailable = () => false;
  assert.equal(h.controller.toggleCharacterProperty("underline"), false);
  assert.equal(h.requests.length, 0);
  h.renderer.characterUnderlineRangesAvailable = () => true;
  h.renderer.selectionCharacterState = () => "mixed";
  assert.equal(h.controller.toggleCharacterProperty("underline"), true);
  assert.equal(h.requests.at(-1).kind, "character-underline-ranges");
  assert.equal(h.requests.at(-1).underlineKind, "bottom");
  assert.equal(h.controller.toggleCharacterProperty("underline"), false);
  h.ack();
  assert.equal(h.controller.history("undo"), true);
  assert.equal(h.native.undo(), true);
  h.ackHistory(first.text);
  assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), originalBytes);
  h.requests.length = 0;
  h.renderer.characterStrikeRangesAvailable = () => false;
  assert.equal(h.controller.toggleCharacterProperty("strike"), false);
  assert.equal(h.requests.length, 0);
  h.renderer.characterStrikeRangesAvailable = () => true;
  h.renderer.selectionCharacterState = () => "mixed";
  assert.equal(h.controller.toggleCharacterProperty("strike"), true);
  assert.equal(h.requests.at(-1).kind, "character-strike-ranges");
  assert.equal(h.requests.at(-1).enabled, true);
  assert.equal(h.controller.toggleCharacterProperty("strike"), false);
  h.ack();
  for (const paragraph of [5, 6]) {
    const id = h.native.characterRanges(0, paragraph).find(row => row.start === 0).charShapeId;
    assert.equal(h.native.characterStrikes().find(row => row.id === id).enabled, true);
  }
  assert.equal(h.controller.history("undo"), true);
  assert.equal(h.native.undo(), true);
  h.ackHistory(first.text);
  assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), originalBytes);
  h.requests.length = 0;
  assert.equal(h.controller.setCharacterProperties({ bold: true }), true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].kind, "character-properties-ranges");
  assert.deepEqual(h.requests[0].ranges.map(row => row.paragraph), [5, 6]);
  h.ack();
  assert.equal(h.controller.history("undo"), true);
  assert.equal(h.native.undo(), true);
  h.ackHistory(first.text);
  assert.equal(h.canvas.dataset.caret, "0:6:1");
  assert.equal(h.input.readOnly, true);
  assert.equal(h.controller.history("redo"), true);
  assert.equal(h.native.redo(), true);
  h.ackHistory(first.text);
  assert.equal(h.canvas.dataset.caret, "0:6:1");
  assert.equal(h.controller.selectedRange(), null);
});
test("Canvas selectable protected text blocks typing composition and structure but allows formatting", async t => {
  const h = await harness(t);
  h.paragraph.editable = false; h.paragraph.selectable = true;
  h.selectTarget();
  h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true, historyAvailable: true });
  assert.equal(h.input.readOnly, true);
  const before = h.input.value;
  h.type(before + "blocked");
  assert.equal(h.input.value, before);
  dispatch(h.input, "compositionstart");
  assert.equal(h.canvas.dataset.composing, "false");
  dispatch(h.input, "keydown", { key: "Enter" });
  h.input.setSelectionRange(0, 0);
  dispatch(h.input, "keydown", { key: "Backspace" });
  assert.equal(h.requests.length, 0);
  h.input.setSelectionRange(0, 1);
  assert.equal(h.controller.formatSelection(1), true);
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].kind, "format");
});
test("Canvas protected selection survives rejected formatting and keeps native bytes unchanged", async t => {
  const h = await harness(t);
  const original = h.native.save({ allowStaleLayout: true }).bytes;
  h.paragraph.editable = false; h.paragraph.selectable = true;
  h.selectTarget();
  h.input.setSelectionRange(0, 1);
  assert.equal(h.controller.formatSelection(0xffffffff), true);
  assert.equal(h.controller.formatSelection(1), false, "pending request blocks overlap");
  h.type(h.input.value + "blocked during format");
  assert.equal(h.requests.length, 1);
  h.ack();
  assert(h.note.textContent.includes("InvalidResourceReference"));
  assert.equal(h.input.readOnly, true);
  assert.equal(h.controller.settled(), true);
  assert.deepEqual(h.controller.selectedRange(), { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 });
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
  assert.equal(h.controller.formatSelection(1), true, "refusal permits another format request");
});
test("Canvas formatting after a retained tab preserves its complete payload and rejects protected ranges", async t => {
  const h = await harness(t, "software", p => p.paragraph === 33 && p.editable);
  h.native.enableHistory();
  const before = h.native.copyText(0, 33);
  const originalZip = h.native.save({ allowStaleLayout: true }).bytes;
  const original = inspect(originalZip);
  h.input.setSelectionRange(1, 3);
  assert.equal(h.controller.formatSelection(1), true); h.ack();
  assert.equal(h.note.textContent, "변경 적용 · 재조판 필요");
  assert.deepEqual(h.native.copyText(0, 33), before);
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  const edited = inspect(saved);
  const beforeRecords = paragraphRecords(original.sections[0].bytes, 33).direct;
  const afterRecords = paragraphRecords(edited.sections[0].bytes, 33).direct;
  for (const tag of [67, 71, 72, 73]) {
    assert.deepEqual(afterRecords.filter(r => r.tag === tag).map(r => r.payload), beforeRecords.filter(r => r.tag === tag).map(r => r.payload));
  }
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, originalZip);
  for (const [startUnit, endUnit, error] of [[1, 8, "SplitControlToken"], [0, 8, "UnsupportedControlDeletion"], [10, 9, "InvalidTextPosition"]]) {
    assert.throws(() => h.native.setCharacterFormat({ section: 0, paragraph: 33, startUnit, endUnit, charShapeId: 1 }), { message: error });
    assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, originalZip);
    assert.equal(h.native.redo(), true);
    assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
    assert.equal(h.native.undo(), true);
  }
});

test("Canvas rejected protected deletion restores the original caret and selection direction", async t => {
  for (const [start, end, direction, inputType] of [[0, 0, "forward", "deleteContentForward"], [1, 1, "forward", "deleteContentBackward"], [0, 1, "backward", "deleteContentForward"]]) await t.test(`${inputType}/${start}/${end}/${direction}`, async t => {
    const h = await harness(t, "software", p => p.paragraph === 33 && p.editable);
    const source = h.native.save({ allowStaleLayout: true }).bytes;
    h.input.setSelectionRange(start, end, direction);
    dispatch(h.input, "beforeinput", { inputType });
    h.type(h.input.value.slice(1));
    h.ack();
    assert(h.note.textContent.includes("UnsupportedControlDeletion"));
    assert.equal(h.input.selectionStart, start);
    assert.equal(h.input.selectionEnd, end);
    assert.equal(h.input.selectionDirection, direction);
    assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, source);
  });
});

test("Canvas formatting outside a retained shape anchor preserves anchor bytes and rejects crossing it", async t => {
  const h = await harness(t, "software", p => p.paragraph === 44 && p.editable);
  const control = h.native.copyText(0, 44).subarray(0, 16);
  h.type("\ufffc텍스트" + h.input.value.slice(1)); h.ack();
  const raw = h.native.copyText(0, 44);
  h.input.setSelectionRange(1, 4);
  assert.equal(h.controller.formatSelection(1), true); h.ack();
  assert.equal(h.note.textContent, "변경 적용 · 재조판 필요");
  assert.deepEqual(h.native.copyText(0, 44), raw);
  assert.deepEqual(raw.subarray(0, 16), control);
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  h.input.setSelectionRange(0, 4);
  assert.equal(h.controller.formatSelection(1), true); h.ack();
  assert(h.note.textContent.includes("UnsupportedControlDeletion"));
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
});

test("Canvas selected formatting changes native style records without changing text and keeps history atomic", async t => {
  const h = await harness(t);
  h.native.enableHistory();
  const original = h.native.save({ allowStaleLayout: true }).bytes;
  const raw = h.native.copyText(h.paragraph.section, h.paragraph.paragraph);
  assert.equal(h.controller.formatSelection(1), false, "caret is not a text selection");
  h.input.setSelectionRange(0, 1);
  assert.equal(h.controller.formatSelection(1), true);
  assert.equal(h.controller.formatSelection(1), false, "pending format must not overlap");
  h.controller.message({ kind: "splice", origin: "canvas" });
  assert.equal(h.controller.settled(), false, "unrelated input reply cannot acknowledge formatting");
  h.ack();
  assert.deepEqual(h.native.copyText(h.paragraph.section, h.paragraph.paragraph), raw);
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  const section = inspect(saved).sections[h.paragraph.section];
  const shape = paragraphRecords(section.bytes, h.paragraph.paragraph).direct.find(record => record.tag === 68);
  assert(shape); assert.equal(shape.payload.readUInt32LE(0), 0); assert.equal(shape.payload.readUInt32LE(4), 1);
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
  assert.equal(h.native.redo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
  h.input.setSelectionRange(0, 1);
  assert.equal(h.controller.formatSelection(0xffffffff), true); h.ack();
  assert(h.note.textContent.includes("InvalidResourceReference"));
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
});

test("Canvas refused formatting preserves independent queued typing and dispatches it after refusal", async t => {
  const h = await harness(t);
  const original = h.input.value;
  h.input.setSelectionRange(0, 1);
  assert.equal(h.controller.formatSelection(0xffffffff), true);
  h.type(original + "빠른입력😀");
  assert.equal(h.requests.length, 1);
  h.ack();
  assert(h.note.textContent.includes("InvalidResourceReference"));
  assert.equal(h.input.value, original + "빠른입력😀");
  assert.equal(h.requests.at(-1).kind, "splice");
  h.ack();
  assert.equal(h.native.text(h.paragraph.section, h.paragraph.paragraph).slice(0, -1), original + "빠른입력😀");
  assert.equal(h.controller.settled(), true);
});

test("Canvas command range is a detached current selection and unavailable during drafts or reset", async t => {
  const h = await harness(t);
  h.input.setSelectionRange(0, 1, "backward");
  const range = h.controller.selectedRange();
  assert.deepEqual(range, { section: h.paragraph.section, paragraph: h.paragraph.paragraph, startUnit: 0, endUnit: 1 });
  range.startUnit = 99;
  assert.equal(h.controller.selectedRange().startUnit, 0);
  h.setBusy(true); assert.equal(h.controller.selectedRange(), null);
  h.setBusy(false);
  dispatch(h.input, "compositionstart"); assert.equal(h.controller.selectedRange(), null);
  h.controller.reset(); assert.equal(h.controller.selectedRange(), null);
});

function dispatch(node, type, values = {}) { const event = new Event(type, { cancelable: true }); Object.assign(event, values); node.dispatchEvent(event); return event; }
async function harness(t, name = "charshape", choose = p => p.editable && !p.sourceOffsets && p.text.length > 0, platform = "", { rangeRequests = null, splitRequests = null } = {}) {
  const bytes = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
  const native = await createExperimentalHwp5Editor(wasm, bytes), reader = await createHwp5Reader(wasm);
  let content;
  content = displayContent(reader.readText(bytes));
  const paragraph = content.paragraphs.find(choose); assert(paragraph);
  if (rangeRequests || splitRequests) { paragraph.editable = false; paragraph.selectable = true; }
  const documentBefore = globalThis.document, doc = { activeElement: null }; globalThis.document = doc;
  class Node extends EventTarget {
    style = {}; dataset = {}; value = ""; selectionStart = 0; selectionEnd = 0; selectionDirection = "forward"; attributes = new Map();
    setAttribute(key, value) { this.attributes.set(key, value); }
    setSelectionRange(start, end, direction = "forward") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
    focus() { doc.activeElement = this; dispatch(this, "focus"); }
    scrollIntoView() {}
    blur() { doc.activeElement = null; dispatch(this, "blur"); }
    getBoundingClientRect() { return { top: 0, left: 0, bottom: 300 }; }
    setPointerCapture() {} hasPointerCapture() { return false; } releasePointerCapture() {}
  }
  const canvas = new Node(), input = new Node(), viewport = new Node(), note = { textContent: "" };
  viewport.scrollTop = 0; viewport.clientHeight = 300; viewport.clientWidth = 440;
  let layout, draft = null, busy = false;
  const reflow = () => { layout = layoutContent({ ...content, paragraphs: content.paragraphs.map(p => draft && p.section === draft.section && p.paragraph === draft.paragraph ? { ...p, text: draft.text } : p) }, 400, () => 10); };
  let geometryListener = () => {};
  const renderer = { layout: () => layout, paragraph: point => content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph), characterPropertyRangesAvailable: () => true, preview(value) { draft = value; reflow(); }, select() {}, onGeometry(callback) { geometryListener = callback; }, notifyGeometry() { geometryListener(); } };
  renderer.characterToggle = (point, start, end, property) => characterTogglePatch(
    { characterPropertiesAvailable: true, characterShapes: native.characterShapes(), characterUnderlineAvailable: true, characterUnderlines: native.characterUnderlines(), ...(property === "strike" ? { characterStrikeAvailable: true, characterStrikes: native.characterStrikes() } : {}) },
    { ...renderer.paragraph(point), characterRanges: native.characterRanges(point.section, point.paragraph) }, start, end, property);
  renderer.characterState = (point, start, end, property) => characterSelectionState(
    { characterPropertiesAvailable: true, characterShapes: native.characterShapes(), characterUnderlineAvailable: true, characterUnderlines: native.characterUnderlines(), ...(property === "strike" ? { characterStrikeAvailable: true, characterStrikes: native.characterStrikes() } : {}) },
    { ...renderer.paragraph(point), characterRanges: native.characterRanges(point.section, point.paragraph) }, start, end, property);
  const requests = [], queue = [];
  const controls = { ready: () => true, busy: () => busy, request(message) { if (busy) return false; busy = true; requests.push(message); queue.push(message); return true; } };
  const controller = createCanvasEditor({ canvas, input, viewport, renderer, controls, note, platform, ...(rangeRequests ? { queryEditRange: message => rangeRequests.push(message) } : {}), ...(splitRequests ? { querySplitRange: message => splitRequests.push(message) } : {}) }); controller.reset();
  t.after(() => { controller.close(); native.close(); reader.close(); if (documentBefore === undefined) delete globalThis.document; else globalThis.document = documentBefore; });
  const caret = caretGeometry(layout, { ...paragraph, unit: 0 }); assert(caret);
  dispatch(canvas, "pointerdown", { button: 0, pointerId: 1, clientX: caret.x, clientY: caret.y });
  dispatch(canvas, "pointerup", { pointerId: 1 });
  return {
    input, canvas, viewport, native, controller, note, requests, paragraph, renderer,
    ackNativeHistory(historyRevision) {
      const message = queue.shift(); assert(message); assert(["undo", "redo"].includes(message.kind));
      const changed = native[message.kind]();
      historyRevision ??= native.historyRevision();
      content = displayContent(reader.readText(native.save({ allowStaleLayout: true }).bytes));
      draft = null; reflow(); busy = false;
      controller.message({ kind: message.kind, origin: "canvas", changed, historyRevision, historyRevisions: native.historyRevisions() });
    },
    selectTarget() {
      const point = caretGeometry(layout, { ...paragraph, unit: 0 }); assert(point);
      dispatch(canvas, "pointerdown", { button: 0, pointerId: 1, clientX: point.x, clientY: point.y });
      dispatch(canvas, "pointerup", { pointerId: 1 });
    },
    setBusy(value) { busy = value; },
    ackHistory(text, error) {
      const message = queue.shift(); assert(message); assert(["undo", "redo"].includes(message.kind));
      if (!error) { content = { ...content, paragraphs: content.paragraphs.map(p => p === paragraph || (p.section === paragraph.section && p.paragraph === paragraph.paragraph) ? { ...p, text } : p) }; draft = null; reflow(); }
      busy = false; controller.message({ kind: message.kind, origin: "canvas", changed: true, error });
    },
    type(text) { input.value = text; input.setSelectionRange(text.length, text.length); dispatch(input, "input"); },
    ack({ clipped = false, historyRevision } = {}) {
      const message = queue.shift(); assert(message);
      let response = { kind: message.kind, origin: message.origin, historyRevision };
      try {
        if (message.kind === "split") native.splitParagraph(message);
        else if (message.kind === "merge") native.mergeParagraph(message);
        else if (message.kind === "format") native.setCharacterFormat(message);
        else if (message.kind === "character-properties") native.setCharacterProperties(message);
        else if (message.kind === "character-properties-ranges") native.setCharacterPropertiesRanges(message);
        else if (message.kind === "character-text-color-ranges") native.setCharacterTextColorRanges(message);
        else if (message.kind === "character-underline-ranges") native.setCharacterUnderlineRanges({ ranges: message.ranges, kind: message.underlineKind });
        else if (message.kind === "character-strike-ranges") native.setCharacterStrikeRanges({ ranges: message.ranges, enabled: message.enabled });
        else if (message.kind === "character-text-color") native.setCharacterTextColor(message);
        else if (message.kind === "character-shade") native.setCharacterShade(message);
        else if (message.kind === "character-effect") native.setCharacterEffect(message);
        else if (message.kind === "character-outline") native.setCharacterOutline({ ...message, kind: message.outlineKind });
        else if (message.kind === "character-outline-ranges") native.setCharacterOutlineRanges({ ranges: message.ranges, kind: message.outlineKind });
        else if (message.kind === "character-effect-ranges") native.setCharacterEffectRanges(message);
        else if (message.kind === "character-shade-ranges") native.setCharacterShadeRanges(message);
        else if (message.kind === "character-font") native.setCharacterFont(message);
        else if (message.kind === "character-font-name") native.setCharacterFontName(message);
        else if (message.kind === "character-font-name-ranges") native.setCharacterFontNameRanges(message);
        else if (message.kind === "splice-font-name") native.spliceWithFontName(message);
        else if (message.kind === "splice-character-properties") native.spliceWithCharacterProperties(message);
        else if (message.kind === "character-font-ranges") native.setCharacterFontRanges(message);
        else if (message.kind === "replace-paragraph-ranges") {
          if (Object.hasOwn(message, "name")) native.replaceParagraphRangesWithFontName(message);
          else native.replaceParagraphRanges(message);
        }
        else if (message.kind === "character-underline") native.setCharacterUnderline({ ...message, kind: message.underlineKind });
        else if (message.kind === "character-strike") native.setCharacterStrike(message);
        else if (message.kind === "character-underline-color") native.setCharacterUnderlineColor(message);
        else if (message.kind === "paragraph-margins") native.setParagraphMargins(message);
        else if (message.kind === "paragraph-spacing") native.setParagraphSpacing(message);
        else native.splice(message);
        if (["split", "merge", "replace-paragraph-ranges"].includes(message.kind) || content.paragraphs.find(p => p.section === message.section && p.paragraph === message.paragraph)?.sourceOffsets) {
          content = displayContent(reader.readText(native.save({ allowStaleLayout: true }).bytes));
        } else content = { ...content, paragraphs: content.paragraphs.map(p => {
          if (p.section !== message.section || p.paragraph !== message.paragraph) return p;
          const text = native.text(p.section, p.paragraph).slice(0, -1);
          return { ...p, text: clipped ? text.slice(0, 2) : text, editable: !clipped };
        }) }; draft = null; reflow();
      } catch (error) { response.error = error.message; }
      try { response.historyRevision ??= native.historyRevision(); } catch {}
      try { response.historyRevisions = native.historyRevisions(); } catch {}
      busy = false; controller.message(response);
    },
  };
}

test("Canvas margin command preserves text caret history and refuses overlapping or invalid requests", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.paragraph.paraShapeId = 16;
  h.paragraph.paragraphShape = { indent: 0 };
  h.native.enableHistory();
  const original = h.native.save({ allowStaleLayout: true }).bytes, text = h.input.value;
  h.input.setSelectionRange(1, 2);
  const snapshot = h.controller.selectedParagraphFormat();
  snapshot.paragraphShape.indent = 900;
  assert.equal(h.paragraph.paragraphShape.indent, 0);
  assert.equal(h.controller.setParagraphMargins({ indent: -720, before: 0 }), true);
  assert.equal(h.controller.setParagraphMargins({ left: 1000 }), false);
  h.controller.message({ kind: "paragraph-alignment", origin: "canvas" });
  assert.equal(h.controller.settled(), false);
  h.ack();
  assert.equal(h.input.value, text);
  assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 2);
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  assert.notDeepEqual(saved, original);
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
  assert.equal(h.controller.setParagraphMargins({ indent: 0.5 }), true); h.ack();
  assert.equal(h.controller.settled(), true);
  assert.equal(h.input.value, text);
  assert.equal(h.native.redo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
});

test("Canvas Ctrl and Cmd emphasis shortcuts use native properties and preserve selection history", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.setCharacterProperties({ section: 0, paragraph: 5, startUnit: 0, endUnit: 2, properties: { bold: false, italic: false } });
  h.native.enableHistory();
  const original = h.native.save({ allowStaleLayout: true }).bytes;
  h.input.setSelectionRange(0, 2);
  for (const [key, modifiers, property, expected] of [["b", { ctrlKey: true }, "bold", true], ["b", { metaKey: true }, "bold", false], ["i", { metaKey: true }, "italic", true], ["i", { ctrlKey: true }, "italic", false]]) {
    assert.equal(dispatch(h.input, "keydown", { key, ...modifiers }).defaultPrevented, true);
    assert.deepEqual(h.requests.at(-1).properties, { [property]: expected });
    const count = h.requests.length;
    dispatch(h.input, "keydown", { key, ...modifiers });
    assert.equal(h.requests.length, count, "pending format must block duplicate shortcut");
    h.ack();
    assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 2);
  }
  for (const modifiers of [{ ctrlKey: true, altKey: true }, { metaKey: true, shiftKey: true }, { ctrlKey: true, repeat: true }, { ctrlKey: true, isComposing: true }, { metaKey: true, keyCode: 229 }]) {
    const count = h.requests.length;
    dispatch(h.input, "keydown", { key: "b", ...modifiers });
    assert.equal(h.requests.length, count);
  }
  h.input.setSelectionRange(1, 1);
  const count = h.requests.length;
  dispatch(h.input, "keydown", { key: "b", ctrlKey: true });
  assert.equal(h.requests.length, count, "empty selection must not establish hidden typing style");
  for (let i = 0; i < 4; i++) assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
});

test("Canvas underline keyboard and direct commands preserve selected text and history", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const original = h.native.save({ allowStaleLayout: true }).bytes;
  h.input.setSelectionRange(0, 2);
  for (const [modifiers, kind] of [[{ ctrlKey: true }, "bottom"], [{ metaKey: true }, "none"]]) {
    assert.equal(dispatch(h.input, "keydown", { key: "u", ...modifiers }).defaultPrevented, true);
    assert.equal(h.requests.at(-1).kind, "character-underline");
    assert.equal(h.requests.at(-1).underlineKind, kind);
    const count = h.requests.length;
    dispatch(h.input, "keydown", { key: "u", ...modifiers });
    assert.equal(h.requests.length, count);
    h.ack();
    assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 2);
    const id = h.native.characterRanges(0, 5)[0].charShapeId;
    assert.equal(h.native.characterUnderlines().find(row => row.id === id).kind, kind);
  }
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  assert.equal(h.native.undo(), true);
  assert.equal(h.controller.setCharacterUnderline("center"), true);
  h.ack();
  assert.match(h.note.textContent, /UnsupportedCharacterUnderlineKind/);
  assert.equal(h.native.redo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
  for (const modifiers of [{ ctrlKey: true, repeat: true }, { metaKey: true, isComposing: true }, { ctrlKey: true, altKey: true }, { ctrlKey: true, shiftKey: true }]) {
    const count = h.requests.length;
    dispatch(h.input, "keydown", { key: "u", ...modifiers });
    assert.equal(h.requests.length, count);
  }
  h.input.setSelectionRange(1, 1);
  assert.equal(h.controller.setCharacterUnderline("bottom"), false);
  assert.equal(h.native.undo(), true); assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
});

test("Canvas font request gates old ABI and retains selection through native history", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.input.setSelectionRange(0, 2);
  assert.equal(h.controller.setCharacterFont("hangul", 0), false);
  h.renderer.characterFontAvailable = () => true;
  const sourceId = h.native.characterRanges(0, 5)[0].charShapeId;
  const sourceFont = h.native.characterFontReferences().find(row => row.id === sourceId).fontIds[0];
  const target = h.native.fontFaces().find(row => row.language === "hangul" && row.id !== sourceFont);
  const original = h.native.save().bytes;
  assert.equal(h.controller.setCharacterFont("hangul", target.id), true);
  assert.equal(h.controller.setCharacterFont("hangul", target.id), false);
  h.ack();
  assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 2);
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], target.id);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
});

test("Canvas named font batch gates capability and restores selection after rejection", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
  const rows = [5, 6].map(paragraph => h.renderer.paragraph({ section: 0, paragraph }));
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges(rows, a, f);
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 });
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 2, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 2, clientX: end.x, clientY: end.y });
  dispatch(h.canvas, "pointerup", { pointerId: 2 });
  h.renderer.characterFontNameAvailable = () => true;
  assert.equal(h.controller.setCharacterFontName("hangul", "Batch Font"), false);
  h.renderer.characterFontNameRangesAvailable = () => true;
  const original = h.native.save().bytes;
  assert.equal(h.controller.setCharacterFontName("hangul", ""), true);
  h.ack();
  assert.equal(h.controller.selectedFontNameRanges().length, 2);
  assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.controller.setCharacterFontName("hangul", "Batch Font"), true);
  assert.equal(h.controller.setCharacterFontName("hangul", "Duplicate"), false);
  assert.equal(h.requests.at(-1).kind, "character-font-name-ranges");
  h.ack();
  assert.equal(h.controller.selectedFontNameRanges().length, 2);
  const face = h.native.fontFaces().find(row => row.language === "hangul" && row.name === "Batch Font");
  assert(face);
  for (const paragraph of [5, 6]) {
    const id = h.native.characterRanges(0, paragraph)[0].charShapeId;
    assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], face.id);
  }
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.undo(), false);
});

test("Canvas named typing font follows multiline replacement and refuses missing capability", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges([h.paragraph], a, f, undefined, { includeEmpty: true });
  h.renderer.paragraphReplacementAvailable = () => true;
  h.native.enableHistory();
  h.renderer.namedFontTextAvailable = () => true;
  assert.equal(h.controller.setCharacterFontName("hangul", "Paste Typing Font"), true);
  const save = () => h.native.save({ allowStaleLayout: true }).bytes;
  const original = save();
  assert.equal(h.controller.replaceSelection("한😀\n\n끝"), false);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(save(), original);
  h.renderer.namedFontReplacementAvailable = () => true;
  assert.equal(h.controller.replaceSelection("한😀\n\n끝"), true);
  h.requests.at(-1).ranges[0].paragraph = 999999;
  h.ack();
  assert.match(h.note.textContent, /교체 실패/);
  assert.deepEqual(save(), original);
  assert.equal(h.controller.replaceSelection("한😀\n\n끝"), true);
  assert.equal(h.requests.at(-1).name, "Paste Typing Font");
  h.ack();
  const pasted = save();
  assert.equal(h.canvas.dataset.caret, "0:7:1");
  h.type(h.input.value.slice(0, 1) + "한" + h.input.value.slice(1));
  assert.equal(h.requests.at(-1).kind, "splice-font-name");
  assert.equal(h.requests.at(-1).paragraph, 7);
  h.ack();
  assert.equal(h.native.undo(), true);
  assert.deepEqual(save(), pasted);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(save(), original);
  assert.equal(h.native.undo(), false);
});

test("Canvas typing properties follow multiline replacement and queued text without losing font", async t => {
  for (const named of [false, true]) await t.test(String(named), async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.renderer.replacementRanges = (a, f) => paragraphSelectionRanges([h.paragraph], a, f, undefined, { includeEmpty: true });
    h.renderer.paragraphReplacementAvailable = () => true;
    h.renderer.characterPropertyTextAvailable = () => true;
    h.renderer.namedFontTextAvailable = () => true;
    h.renderer.namedFontPropertyTextAvailable = () => true;
    h.renderer.namedFontReplacementAvailable = () => true;
    h.native.enableHistory();
    const save = () => h.native.save({ allowStaleLayout: true }).bytes;
    const original = save();
    assert.equal(h.controller.setCharacterProperties({ size: 1700, bold: true, italic: false }), true);
    if (named) assert.equal(h.controller.setCharacterFontName("hangul", "Canvas Paste Properties"), true);
    assert.equal(h.controller.replaceSelection("한😀\n\n끝"), false);
    assert.deepEqual(save(), original);
    h.renderer.characterPropertyReplacementAvailable = () => true;
    h.renderer.namedFontPropertyReplacementAvailable = () => true;
    assert.equal(h.controller.replaceSelection("한😀\n\n끝"), true);
    h.requests.at(-1).ranges[0].paragraph = 999999;
    h.ack();
    assert.match(h.note.textContent, /교체 실패/);
    assert.deepEqual(save(), original);
    assert.equal(h.controller.replaceSelection("한😀\n\n끝"), true);
    dispatch(h.input, "beforeinput", { inputType: "insertText", data: "한" });
    h.ack();
    const pasted = save();
    assert.equal(h.requests.at(-1).kind, named ? "splice-font-name" : "splice-character-properties");
    assert.equal(h.requests.at(-1).paragraph, 7);
    assert.deepEqual(h.requests.at(-1).properties, { size: 1700, bold: true, italic: false });
    h.ack();
    for (const [paragraph, unit] of [[5, 0], [7, 0], [7, 1]]) {
      const id = h.native.characterRanges(0, paragraph).find(row => row.start <= unit && row.end > unit).charShapeId;
      const shape = h.native.characterShapes().find(row => row.id === id);
      assert.equal(shape.height, 1700); assert.equal(shape.bold, true); assert.equal(shape.italic, false);
      if (named) {
        const face = h.native.fontFaces().find(row => row.name === "Canvas Paste Properties");
        assert(face); assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], face.id);
      }
    }
    assert.equal(h.native.undo(), true); assert.deepEqual(save(), pasted);
    assert.equal(h.native.undo(), true); assert.deepEqual(save(), original);
    assert.equal(h.native.undo(), false);
  });
});

test("Canvas named typing font follows successful Enter into the new paragraph", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true, historyAvailable: true });
  h.renderer.namedFontTextAvailable = () => true;
  const save = () => h.native.save({ allowStaleLayout: true }).bytes;
  const original = save();
  assert.equal(h.controller.setCharacterFontName("hangul", "Enter Typing Font"), true);
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(h.requests.at(-1).kind, "split");
  h.ack();
  const split = save();
  assert.equal(h.canvas.dataset.caret, "0:6:0");
  h.type("한😀" + h.input.value);
  assert.equal(h.requests.at(-1).kind, "splice-font-name");
  assert.equal(h.requests.at(-1).paragraph, 6);
  assert.equal(h.requests.at(-1).name, "Enter Typing Font");
  h.ack();
  const face = h.native.fontFaces().find(row => row.name === "Enter Typing Font");
  assert(face);
  const id = h.native.characterRanges(0, 6)[0].charShapeId;
  assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], face.id);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(save(), split);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(save(), original);
});

test("Canvas refused Enter retains the original named typing font without edits", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.controller.message({ kind: "enable", structureAvailable: true });
  h.renderer.namedFontTextAvailable = () => true;
  const original = h.native.save().bytes;
  assert.equal(h.controller.setCharacterFontName("hangul", "Retained Typing Font"), true);
  dispatch(h.input, "keydown", { key: "Enter" });
  h.requests.at(-1).paragraph = 999999;
  h.ack();
  assert.deepEqual(h.native.save().bytes, original);
  assert.match(h.note.textContent, /실패/);
  h.type("한" + h.input.value);
  assert.equal(h.requests.at(-1).kind, "splice-font-name");
  assert.equal(h.requests.at(-1).paragraph, 5);
  assert.equal(h.requests.at(-1).name, "Retained Typing Font");
  h.ack();
  assert(h.native.fontFaces().some(row => row.name === "Retained Typing Font"));
});

test("Canvas named font composition sends only the final text and one transaction", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.renderer.namedFontTextAvailable = () => true;
  const original = h.native.save().bytes, before = h.input.value;
  assert.equal(h.controller.setCharacterFontName("hangul", "Composition Typing Font"), true);
  dispatch(h.input, "compositionstart");
  h.type("ㅎ" + before); h.type("한😀" + before);
  assert.equal(h.requests.length, 0);
  dispatch(h.input, "compositionend");
  dispatch(h.input, "input", { inputType: "insertFromComposition" });
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].kind, "splice-font-name");
  assert.equal(h.requests[0].text, "한😀");
  h.ack();
  assert(h.native.fontFaces().some(row => row.name === "Composition Typing Font"));
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.undo(), false);
});

test("Canvas caret font selection waits for input and commits font with text once", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const original = h.native.save().bytes;
  assert.equal(h.controller.setCharacterFontName("hangul", "Typing Canvas Font"), false);
  h.renderer.namedFontTextAvailable = () => true;
  assert.equal(h.controller.setCharacterFontName("hangul", ""), false);
  assert.equal(h.controller.setCharacterFontName("hangul", "Typing Canvas Font"), true);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.native.save().bytes, original);
  h.type("한😀" + h.paragraph.text);
  assert.equal(h.requests[0].kind, "splice-font-name");
  assert.equal(h.controller.setCharacterFontName("hangul", "Other"), false);
  h.ack();
  const face = h.native.fontFaces().find(row => row.name === "Typing Canvas Font");
  assert.equal(h.requests.length, 1, JSON.stringify(h.requests));
  assert(face);
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], face.id);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.undo(), false);
  h.controller.reset();
  const point = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 1, clientX: point.x + 1, clientY: point.y - h.viewport.scrollTop + point.height / 2 });
  dispatch(h.canvas, "pointerup", { pointerId: 1 });
  h.type("새" + h.input.value);
  assert.equal(h.requests.length, 2, JSON.stringify({ note: h.note.textContent, dataset: h.canvas.dataset, value: h.input.value }));
  assert.equal(h.requests.at(-1).kind, "splice");
});

test("Canvas caret properties and named font commit only on input in one native transaction", async t => {
  for (const named of [false, true]) await t.test(String(named), async t => {
    const h = await harness(t, "parashape", p => p.paragraph === 5);
    h.native.enableHistory();
    const original = h.native.save().bytes;
    assert.equal(h.controller.setCharacterProperties({ bold: true }), false);
    h.renderer.characterPropertyTextAvailable = () => true;
    h.renderer.namedFontTextAvailable = () => true;
    h.renderer.namedFontPropertyTextAvailable = () => true;
    const properties = { size: 1700, bold: true, italic: false };
    assert.equal(h.controller.setCharacterProperties(properties), true);
    properties.bold = false;
    assert.equal(h.controller.setCharacterProperties({ size: -1 }), false);
    assert.equal(h.controller.setCharacterProperties({ italic: true, size: null }), true);
    if (named) assert.equal(h.controller.setCharacterFontName("hangul", "Canvas Combined Font"), true);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.native.save().bytes, original);
    h.type("한😀" + h.paragraph.text);
    assert.equal(h.requests[0].kind, named ? "splice-font-name" : "splice-character-properties");
    assert.deepEqual(h.requests[0].properties, { size: 1700, bold: true, italic: true });
    h.ack();
    const id = h.native.characterRanges(0, 5)[0].charShapeId;
    const shape = h.native.characterShapes().find(row => row.id === id);
    assert.equal(shape.height, 1700);
    assert.equal(shape.bold, true);
    assert.equal(shape.italic, true);
    if (named) {
      const face = h.native.fontFaces().find(row => row.name === "Canvas Combined Font");
      assert(face);
      assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], face.id);
    }
    assert.equal(h.native.undo(), true);
    assert.equal(h.native.undo(), false);
    assert.deepEqual(h.native.save().bytes, original);
  });
});

test("Canvas typing properties gate combined capability and clear on native refusal", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.renderer.characterPropertyTextAvailable = () => true;
  h.renderer.namedFontTextAvailable = () => true;
  h.renderer.namedFontPropertyTextAvailable = () => false;
  assert.equal(h.controller.setCharacterProperties({ bold: true }), true);
  assert.equal(h.controller.setCharacterFontName("hangul", "Cannot Combine"), false);
  assert.equal(h.requests.length, 0);
  const original = h.native.save().bytes;
  h.type("\n" + h.paragraph.text);
  assert.equal(h.requests[0].kind, "splice-character-properties");
  h.ack();
  assert(h.note.textContent.includes("입력이 적용되지 않았습니다"));
  assert.deepEqual(h.native.save().bytes, original);
  h.type("새" + h.input.value);
  assert.equal(h.requests.at(-1).kind, "splice");
  h.ack();
  h.controller.reset();
  const point = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 1, clientX: point.x + 1, clientY: point.y - h.viewport.scrollTop + point.height / 2 });
  dispatch(h.canvas, "pointerup", { pointerId: 1 });
  assert.equal(h.controller.setCharacterFontName("hangul", "Font First"), true);
  assert.equal(h.controller.setCharacterProperties({ italic: true }), false);
});

test("Canvas named font creates native resource and preserves selected text", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.input.setSelectionRange(0, 2);
  assert.equal(h.controller.setCharacterFontName("hangul", "Canvas New Font"), false);
  h.renderer.characterFontNameAvailable = () => true;
  const original = h.native.save().bytes;
  assert.equal(h.controller.setCharacterFontName("hangul", "Canvas New Font"), true);
  assert.equal(h.controller.setCharacterFontName("hangul", "Canvas New Font"), false);
  h.ack();
  assert.equal(h.input.selectionStart, 0);
  assert.equal(h.input.selectionEnd, 2);
  const face = h.native.fontFaces().find(row => row.language === "hangul" && row.name === "Canvas New Font");
  assert(face);
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.equal(h.native.characterFontReferences().find(row => row.id === id).fontIds[0], face.id);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save().bytes, original);
});

test("Canvas strike toggle uses current native state and preserves selection and history", async t => {
  const h = await harness(t, "strikethrough", p => p.paragraph === 1);
  h.native.enableHistory();
  h.controller.message({ kind: "enable", historyAvailable: true, historyRevision: h.native.historyRevision(), historyRevisions: h.native.historyRevisions() });
  const original = h.native.save({ allowStaleLayout: true }).bytes;
  assert.equal(h.controller.selectedCharacterPropertyState("strike"), null);
  assert.equal(h.controller.toggleCharacterProperty("strike"), false);
  dispatch(h.input, "keydown", { key: "ArrowRight", shiftKey: true });
  assert.equal(h.controller.selectedCharacterPropertyState("strike"), true);
  assert.equal(h.controller.toggleCharacterProperty("strike"), true);
  assert.equal(h.requests.at(-1).enabled, false);
  assert.equal(h.controller.toggleCharacterProperty("strike"), false);
  h.controller.message({ kind: "character-underline", origin: "canvas" });
  assert.equal(h.controller.settled(), false);
  h.ack();
  assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 1);
  assert.equal(h.controller.selectedCharacterPropertyState("strike"), false);
  const stateReader = h.renderer.characterState;
  h.renderer.characterState = () => null;
  const requestCount = h.requests.length;
  assert.equal(h.controller.toggleCharacterProperty("strike"), false);
  assert.equal(h.requests.length, requestCount);
  h.renderer.characterState = stateReader;
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  assert.equal(h.controller.history("undo"), true);
  assert.equal(h.controller.toggleCharacterProperty("strike"), false);
  h.ackNativeHistory();
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
  assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 1);
  assert.equal(h.controller.selectedCharacterPropertyState("strike"), true);
  assert.equal(h.controller.history("redo"), true); h.ackNativeHistory();
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
  assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 1);
  assert.equal(h.controller.selectedCharacterPropertyState("strike"), false);
});

test("Canvas caret current fonts read scalar source without issuing edits", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  const calls = [];
  h.renderer.characterFontIds = (point, start, end, language) => { calls.push({ point, start, end, language }); return [0]; };
  h.input.setSelectionRange(0, 0);
  assert.deepEqual(h.controller.selectedCharacterFontIds("hangul"), [0]);
  assert.equal(calls.at(-1).start, 0); assert.equal(calls.at(-1).end, 1);
  assert.equal(calls.at(-1).language, "hangul"); assert.equal(h.requests.length, 0);
  h.setBusy(true); assert.equal(h.controller.selectedCharacterFontIds("hangul"), null); h.setBusy(false);
  h.input.setSelectionRange(0, 2);
  assert.deepEqual(h.controller.selectedCharacterFontIds("latin"), [0]);
  assert.equal(calls.at(-1).end, 2);
});

test("Canvas multiple paragraph outline gates independent batch capability and restores anchors", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
  const first = h.renderer.paragraph({ section: 0, paragraph: 5 }), second = h.renderer.paragraph({ section: 0, paragraph: 6 });
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges([first, second], a, f);
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 }), end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 2, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 2, clientX: end.x, clientY: end.y }); dispatch(h.canvas, "pointerup", { pointerId: 2 });
  h.native.enableHistory(); const original = h.native.save().bytes;
  h.renderer.characterOutlineAvailable = () => false;
  assert.equal(h.controller.setCharacterOutline("solid"), false);
  h.renderer.characterOutlineRangesAvailable = () => true; h.renderer.characterOutlineState = () => "mixed";
  assert.equal(h.controller.selectedOutlineRanges().length, 2);
  assert.equal(h.controller.setCharacterOutline("solid"), true); assert.equal(h.requests.at(-1).kind, "character-outline-ranges");
  assert.equal(h.controller.setCharacterOutline("none"), false);
  h.ack(); assert.equal(h.controller.selectedOutlineRanges().length, 2);
  for (const paragraph of [5, 6]) assert.equal(h.native.characterOutlines().find(row => row.id === h.native.characterRanges(0, paragraph)[0].charShapeId).state, "solid");
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save().bytes, original); assert.equal(h.native.undo(), false);
});

test("Canvas multiple paragraph effects preserve anchors and one history transaction", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
  const first = h.renderer.paragraph({ section: 0, paragraph: 5 }), second = h.renderer.paragraph({ section: 0, paragraph: 6 });
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges([first, second], a, f);
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 });
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 2, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 2, clientX: end.x, clientY: end.y });
  dispatch(h.canvas, "pointerup", { pointerId: 2 });
  h.native.enableHistory(); const original = h.native.save().bytes;
  h.renderer.characterEffectAvailable = () => true;
  assert.equal(h.controller.setCharacterEffect("superscript", true), false);
  h.renderer.characterEffectRangesAvailable = () => true;
  h.renderer.characterEffectState = () => "mixed";
  assert.equal(h.controller.selectedCharacterEffect("superscript"), "mixed");
  assert.equal(h.controller.setCharacterEffect("superscript", true), true);
  assert.equal(h.requests.at(-1).kind, "character-effect-ranges");
  assert.equal(h.controller.setCharacterEffect("superscript", false), false);
  h.ack(); assert.equal(h.controller.selectedCharacterEffect("superscript"), "mixed");
  for (const paragraph of [5, 6]) {
    const id = h.native.characterRanges(0, paragraph)[0].charShapeId;
    assert.equal(h.native.characterEffects().find(row => row.id === id).superscript, true);
  }
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.undo(), false);
  const ranges = h.requests.at(-1).ranges;
  h.native.setCharacterEffectRanges({ ranges, effect: "subscript", enabled: true });
  const seeded = h.native.save({ allowStaleLayout: true }).bytes;
  assert.equal(h.controller.setCharacterEffect("superscript", true, true), false);
  h.renderer.characterEffectRangesExclusiveAvailable = () => true;
  assert.equal(h.controller.setCharacterEffect("superscript", true, true), true);
  assert.equal(h.requests.at(-1).exclusive, true); h.ack();
  for (const paragraph of [5, 6]) {
    const id = h.native.characterRanges(0, paragraph)[0].charShapeId, row = h.native.characterEffects().find(row => row.id === id);
    assert.equal(row.superscript, true); assert.equal(row.subscript, false);
  }
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, seeded);
});

test("Canvas multiple paragraph shade uses independent capability and one history transaction", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.viewport.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 10000 });
  const first = h.renderer.paragraph({ section: 0, paragraph: 5 }), second = h.renderer.paragraph({ section: 0, paragraph: 6 });
  h.renderer.selectionRanges = (a, f) => paragraphSelectionRanges([first, second], a, f);
  const start = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 5, unit: 0 });
  const end = caretGeometry(h.renderer.layout(), { section: 0, paragraph: 6, unit: 1 });
  dispatch(h.canvas, "pointerdown", { button: 0, pointerId: 2, clientX: start.x, clientY: start.y });
  dispatch(h.canvas, "pointermove", { pointerId: 2, clientX: end.x, clientY: end.y });
  dispatch(h.canvas, "pointerup", { pointerId: 2 });
  h.native.enableHistory();
  const original = h.native.save().bytes;
  h.renderer.characterShadeAvailable = () => true;
  h.renderer.textColorRangesAvailable = () => false;
  assert.equal(h.controller.setCharacterShade("#ffff00"), false);
  h.renderer.characterShadeRangesAvailable = () => true;
  assert.equal(h.controller.selectedShadeRanges().length, 2);
  assert.equal(h.controller.setCharacterShade("#ffff00"), true);
  assert.equal(h.requests.at(-1).kind, "character-shade-ranges");
  assert.equal(h.controller.setCharacterShade(null), false);
  h.ack(); assert.equal(h.controller.selectedShadeRanges().length, 2);
  for (const paragraph of [5, 6]) {
    const id = h.native.characterRanges(0, paragraph)[0].charShapeId;
    assert.deepEqual(h.native.characterShades().find(row => row.id === id), { id, state: "color", color: 0xffff00 });
  }
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.undo(), false);
});

test("Canvas outline applies explicit none solid and preserves pending selection and history", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory(); h.input.setSelectionRange(0, 2);
  assert.equal(h.controller.setCharacterOutline("solid"), false);
  h.renderer.characterOutlineAvailable = () => true; h.renderer.characterOutline = () => "none";
  assert.equal(h.controller.selectedCharacterOutline(), "none");
  assert.equal(h.controller.setCharacterOutline("DASH"), false);
  const original = h.native.save().bytes, text = h.input.value;
  assert.equal(h.controller.setCharacterOutline("solid"), true);
  assert.equal(h.controller.setCharacterOutline("none"), false);
  assert.equal(h.controller.selectedCharacterOutline(), null);
  h.controller.message({ kind: "character-effect", origin: "canvas" }); assert.equal(h.controller.settled(), false);
  h.ack(); assert.equal(h.input.value, text); assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 2);
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.equal(h.native.characterOutlines().find(row => row.id === id).state, "solid");
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save().bytes, original); assert.equal(h.native.redo(), true);
  assert.equal(h.controller.setCharacterOutline("none"), true); h.ack();
  assert.equal(h.native.characterOutlines().find(row => row.id === h.native.characterRanges(0, 5)[0].charShapeId).state, "none");
  h.input.setSelectionRange(0, 0); assert.equal(h.controller.setCharacterOutline("solid"), false);
});

test("Canvas exclusive effects use one paired native edit and separate capability", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory(); h.input.setSelectionRange(0, 1);
  const position = { section: 0, paragraph: 5, startUnit: 0, endUnit: 1 };
  for (const effect of ["emboss", "engrave"]) h.native.setCharacterEffect({ ...position, effect, enabled: true });
  const before = h.native.save({ allowStaleLayout: true }).bytes;
  h.renderer.characterEffectAvailable = () => true;
  assert.equal(h.controller.setCharacterEffect("emboss", true, true), false);
  h.renderer.characterEffectExclusiveAvailable = () => true;
  assert.equal(h.controller.setCharacterEffect("emboss", true, 1), false);
  assert.equal(h.controller.setCharacterEffect("emboss", true, true), true);
  assert.equal(h.requests.at(-1).exclusive, true); h.ack();
  const id = h.native.characterRanges(0, 5)[0].charShapeId, current = h.native.characterEffects().find(row => row.id === id);
  assert.equal(current.emboss, true); assert.equal(current.engrave, false);
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, before);
});

test("Canvas effect applies native history and preserves selection with capability and pending guards", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory(); h.input.setSelectionRange(0, 2);
  assert.equal(h.controller.setCharacterEffect("emboss", true), false);
  h.renderer.characterEffectAvailable = () => true;
  h.renderer.characterEffect = () => false;
  assert.equal(h.controller.selectedCharacterEffect("emboss"), false);
  assert.equal(h.controller.setCharacterEffect("shadow", true), false);
  const original = h.native.save().bytes, text = h.input.value;
  assert.equal(h.controller.setCharacterEffect("emboss", true), true);
  assert.equal(h.controller.selectedCharacterEffect("emboss"), null);
  assert.equal(h.controller.setCharacterEffect("emboss", false), false);
  h.controller.message({ kind: "character-shade", origin: "canvas" }); assert.equal(h.controller.settled(), false);
  h.ack(); assert.equal(h.input.value, text); assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 2);
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.equal(h.native.characterEffects().find(row => row.id === id).emboss, true);
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.redo(), true);
  assert.equal(h.controller.setCharacterEffect("emboss", false), true); h.ack();
  assert.equal(h.native.characterEffects().find(row => row.id === h.native.characterRanges(0, 5)[0].charShapeId).emboss, false);
  h.input.setSelectionRange(0, 0); assert.equal(h.controller.setCharacterEffect("emboss", true), false);
});

test("Canvas shade preserves selection rejects overlap and applies explicit removal", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  h.input.setSelectionRange(0, 2);
  assert.equal(h.controller.setCharacterShade("#ffffff"), false);
  h.renderer.characterShadeAvailable = () => true;
  const hintCalls = [];
  h.renderer.characterShade = (point, start, end) => { hintCalls.push({ point, start, end }); return "#ffffff"; };
  assert.equal(h.controller.selectedCharacterShade(), "#ffffff");
  assert.equal(hintCalls.at(-1).start, 0); assert.equal(hintCalls.at(-1).end, 2);
  assert.equal(h.controller.setCharacterShade(undefined), false);
  const original = h.native.save().bytes, text = h.input.value;
  assert.equal(h.controller.setCharacterShade("#ffffff"), true);
  assert.equal(h.controller.selectedCharacterShade(), null);
  assert.equal(h.requests.at(-1).kind, "character-shade");
  assert.equal(h.controller.setCharacterShade(null), false);
  h.controller.message({ kind: "character-text-color", origin: "canvas" });
  assert.equal(h.controller.settled(), false);
  h.ack(); assert.equal(h.input.value, text);
  assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 2);
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.deepEqual(h.native.characterShades().find(row => row.id === id), { id, state: "color", color: 0xffffff });
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save().bytes, original);
  assert.equal(h.native.redo(), true);
  assert.equal(h.controller.setCharacterShade(null), true); h.ack();
  const removedId = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.equal(h.native.characterShades().find(row => row.id === removedId).state, "none");
  assert.equal(h.controller.setCharacterShade("#FFFFFFFF"), false);
});

test("Canvas underline color preserves selection and refuses overlapping commands without losing redo", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const original = h.native.save({ allowStaleLayout: true }).bytes, text = h.input.value;
  assert.equal(h.controller.setCharacterUnderlineColor("#123456"), false);
  h.input.setSelectionRange(0, 2);
  assert.equal(h.controller.setCharacterUnderlineColor("#123456"), true);
  assert.equal(h.requests.at(-1).kind, "character-underline-color");
  assert.equal(h.controller.setCharacterUnderlineColor("#ffffff"), false);
  h.controller.message({ kind: "character-underline", origin: "canvas" });
  assert.equal(h.controller.settled(), false);
  h.ack();
  assert.equal(h.input.value, text);
  assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, 2);
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  assert.equal(h.native.characterUnderlineStyles().find(row => row.id === id).raw_color, 0x563412);
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
  assert.equal(h.controller.setCharacterUnderlineColor("#123456\n"), true);
  h.ack();
  assert.match(h.note.textContent, /InvalidCharacterColor/);
  assert.equal(h.controller.settled(), true);
  assert.equal(h.native.redo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
});

test("Canvas character properties preserve selected text and native history after refusal", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.native.enableHistory();
  const original = h.native.save({ allowStaleLayout: true }).bytes, text = h.input.value;
  assert.equal(h.controller.setCharacterProperties({ bold: true }), false);
  h.input.setSelectionRange(0, 2);
  const properties = { size: 2400, bold: true };
  assert.equal(h.controller.setCharacterProperties(properties), true);
  properties.size = 1200;
  assert.equal(h.requests.at(-1).properties.size, 2400);
  assert.equal(h.controller.setCharacterProperties({ italic: true }), false);
  h.controller.message({ kind: "format", origin: "canvas" });
  assert.equal(h.controller.settled(), false);
  h.ack();
  assert.equal(h.input.value, text);
  assert.equal(h.input.selectionStart, 0);
  assert.equal(h.input.selectionEnd, 2);
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  const id = h.native.characterRanges(0, 5)[0].charShapeId;
  const shape = h.native.characterShapes()[id];
  assert.equal(shape.height, 2400);
  assert.equal(shape.bold, true);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
  assert.equal(h.controller.setCharacterProperties({ size: -1 }), true);
  h.ack();
  assert.equal(h.controller.settled(), true);
  assert.equal(h.input.value, text);
  assert.equal(h.native.redo(), true);
  assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
});

test("Canvas spacing request keeps caret text and restores native history after refusal", async t => {
  const h = await harness(t, "parashape", p => p.paragraph === 5);
  h.paragraph.paraShapeId = 16;
  h.native.enableHistory();
  const original = h.native.save({ allowStaleLayout: true }).bytes, text = h.input.value;
  h.input.setSelectionRange(1, 2);
  assert.equal(h.controller.setParagraphSpacing("PERCENT", 200), true);
  assert.equal(h.controller.setParagraphSpacing("FIXED", 720), false);
  h.controller.message({ kind: "paragraph-margins", origin: "canvas" });
  assert.equal(h.controller.settled(), false);
  h.ack(); assert.equal(h.input.value, text);
  assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 2);
  const saved = h.native.save({ allowStaleLayout: true }).bytes;
  const shape = h.native.paragraphShapes()[h.native.paragraphShapeId(0, 5)];
  assert.equal(shape.modernSpacing.value, 200);
  assert.equal(h.native.undo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, original);
  assert.equal(h.controller.setParagraphSpacing("FUTURE", 200), true); h.ack();
  assert.equal(h.controller.settled(), true); assert.equal(h.input.value, text);
  assert.equal(h.native.redo(), true); assert.deepEqual(h.native.save({ allowStaleLayout: true }).bytes, saved);
});

test("canvas boundary Backspace joins split paragraphs once and preserves join caret", async t => {
  const h = await harness(t);
  h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true });
  const before = h.input.value, count = h.native.paragraphCount(h.paragraph.section);
  h.input.setSelectionRange(1, 1);
  dispatch(h.input, "keydown", { key: "Enter" }); h.ack();
  assert.equal(dispatch(h.input, "keydown", { key: "Backspace" }).defaultPrevented, true);
  assert.equal(h.requests.at(-1).kind, "merge");
  const requests = h.requests.length;
  h.controller.message({ kind: "split", origin: "canvas" });
  assert.equal(h.controller.settled(), false, "unrelated structural acknowledgement must not release merge transaction");
  assert.equal(h.input.readOnly, true);
  dispatch(h.input, "beforeinput", { inputType: "deleteContentBackward" });
  assert.equal(h.requests.length, requests);
  h.ack();
  assert.equal(h.native.paragraphCount(h.paragraph.section), count);
  assert.equal(h.input.value, before);
  assert.equal(h.input.selectionStart, 1);
  assert.equal(h.canvas.dataset.caret, `${h.paragraph.section}:${h.paragraph.paragraph}:1`);
  assert.equal(h.controller.settled(), true);
});

test("canvas boundary Delete joins from left through beforeinput and does not merge selected text", async t => {
  const h = await harness(t);
  h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true });
  const before = h.input.value;
  h.input.setSelectionRange(1, 1);
  dispatch(h.input, "keydown", { key: "Enter" }); h.ack();
  h.selectTarget();
  h.input.setSelectionRange(0, 1);
  assert.equal(dispatch(h.input, "beforeinput", { inputType: "deleteContentForward" }).defaultPrevented, false);
  h.input.setSelectionRange(1, 1);
  assert.equal(dispatch(h.input, "beforeinput", { inputType: "deleteContentForward" }).defaultPrevented, true);
  h.ack();
  assert.equal(h.input.value, before);
  assert.equal(h.input.selectionStart, 1);
});

test("canvas cross-cell merge refusal preserves title caret and permits subsequent typing", async t => {
  const h = await harness(t, "software", p => p.section === 0 && p.paragraph === 2);
  h.controller.message({ kind: "enable", mergeAvailable: true });
  const before = h.input.value, source = h.native.save().bytes;
  h.input.setSelectionRange(before.length, before.length);
  dispatch(h.input, "keydown", { key: "Delete" });
  assert.equal(h.requests.at(-1).kind, "merge");
  h.ack();
  assert.equal(h.input.value, before);
  assert.equal(h.input.selectionStart, before.length);
  assert.equal(h.controller.settled(), true);
  assert.equal(h.input.readOnly, false);
  assert.match(h.note.textContent, /ParagraphOwnerMismatch/);
  assert.deepEqual(h.native.save().bytes, source);
  h.type(before + "후속"); h.ack();
  assert.equal(h.native.text(0, 2), before + "후속\r");
});

test("canvas chart label Enter and Backspace preserve formulas and verified cell ownership", async t => {
  const h = await harness(t, "chart", p => p.section === 0 && p.paragraph === 12);
  h.native.enableHistory();
  h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true });
  const original = Buffer.from(h.native.save().bytes), text = h.input.value;
  h.input.setSelectionRange(1, 1);
  dispatch(h.input, "keydown", { key: "Enter" });
  h.ack();
  assert.equal(h.input.value, text.slice(1));
  assert.equal(h.canvas.dataset.caret, "0:13:0");
  const split = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  verifySplit(original, split, 0, 12, 1);
  assert.equal(verifyChartFormulas(inspect(split).sections[0].bytes), 13);
  dispatch(h.input, "keydown", { key: "Backspace" });
  h.ack();
  assert.equal(h.input.value, text);
  assert.equal(h.canvas.dataset.caret, "0:12:1");
  const merged = Buffer.from(h.native.save({ allowStaleLayout: true }).bytes);
  verifyMerge(split, merged, 0, 12);
  assert.equal(verifyChartFormulas(inspect(merged).sections[0].bytes), 13);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(Buffer.from(h.native.save({ allowStaleLayout: true }).bytes), split);
  assert.equal(h.native.undo(), true);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
});

test("canvas chart numeric Enter refusal retains caret and permits numeric text correction", async t => {
  const h = await harness(t, "chart", p => p.section === 0 && p.paragraph === 19);
  h.controller.message({ kind: "enable", structureAvailable: true, mergeAvailable: true });
  const original = Buffer.from(h.native.save().bytes), text = h.input.value;
  h.input.setSelectionRange(1, 1);
  dispatch(h.input, "select");
  dispatch(h.input, "keydown", { key: "Enter" }); h.ack();
  assert.equal(h.input.value, text);
  assert.equal(h.canvas.dataset.caret, "0:19:1");
  assert.equal(h.input.readOnly, false);
  assert.equal(h.controller.settled(), true);
  assert.match(h.note.textContent, /UnsupportedStructuralControl/);
  assert.deepEqual(Buffer.from(h.native.save().bytes), original);
  h.type("0"); h.ack();
  assert.equal(h.native.text(0, 19), "0\r");
  assert.equal(verifyChartFormulas(inspect(h.native.save({ allowStaleLayout: true }).bytes).sections[0].bytes), 13);
});

test("canvas selection Enter replaces selected text in one native split request", async t => {
  const h = await harness(t);
  h.controller.message({ kind: "enable", structureAvailable: true });
  const before = h.input.value;
  h.input.setSelectionRange(1, 3);
  dispatch(h.input, "beforeinput", { inputType: "insertParagraph" });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].atUnit, 1);
  assert.equal(h.requests[0].endUnit, 3);
  h.ack();
  assert.equal(h.input.value, before.slice(3));
  assert.equal(h.input.selectionStart, 0);
});

test("canvas Enter chooses anchored mode only with explicit paragraph capability", async t => {
  const h = await harness(t);
  h.controller.message({ kind: "enable", historyAvailable: true, structureAvailable: true });
  h.renderer.paragraph(h.paragraph).anchoredSplitAvailable = true;
  dispatch(h.input, "keydown", { key: "Enter" });
  assert.equal(h.requests.at(-1).anchored, true);
});

test("canvas Enter splits actual paragraph, blocks duplicate requests and follows native right paragraph", async t => {
  const h = await harness(t);
  h.controller.message({ kind: "enable", historyAvailable: true, structureAvailable: true });
  h.input.setSelectionRange(1, 1);
  const before = h.input.value, count = h.native.paragraphCount(h.paragraph.section);
  assert.equal(dispatch(h.input, "keydown", { key: "Enter" }).defaultPrevented, true);
  assert.equal(h.requests.at(-1).kind, "split");
  assert.equal(h.requests.at(-1).anchored, undefined);
  assert.equal(h.requests.at(-1).atUnit, 1);
  assert.equal(h.controller.settled(), false);
  assert.equal(h.input.readOnly, false);
  const requests = h.requests.length;
  dispatch(h.input, "keydown", { key: "Enter" });
  dispatch(h.input, "beforeinput", { inputType: "insertParagraph" });
  assert.equal(h.requests.length, requests);
  h.ack();
  assert.equal(h.native.paragraphCount(h.paragraph.section), count + 1);
  assert.equal(h.input.value, before.slice(1));
  assert.equal(h.input.selectionStart, 0);
  assert.equal(h.canvas.dataset.caret, `${h.paragraph.section}:${h.paragraph.paragraph + 1}:0`);
  assert.equal(h.controller.settled(), true);
  h.type("후속" + h.input.value); h.ack();
  assert.ok(h.native.text(h.paragraph.section, h.paragraph.paragraph + 1).startsWith("후속"));
  dispatch(h.input, "compositionstart");
  const n = h.requests.length;
  dispatch(h.input, "keydown", { key: "Enter", isComposing: true });
  assert.equal(h.requests.length, n);
  dispatch(h.input, "compositionend");
});

test("canvas history consumes acknowledged projection and blocks overlapping drafts and composition", async t => {
  const h = await harness(t), before = h.input.value;
  assert.equal(h.controller.history("undo"), false);
  h.controller.message({ kind: "enable", historyAvailable: true });
  const key = dispatch(h.input, "keydown", { key: "z", metaKey: true });
  assert.equal(key.defaultPrevented, true);
  assert.equal(h.requests.at(-1).kind, "undo");
  assert.equal(h.input.readOnly, true); assert.equal(h.controller.settled(), false);
  assert.equal(dispatch(h.input, "beforeinput", { inputType: "insertText" }).defaultPrevented, true);
  assert.equal(h.controller.history("redo"), false);
  h.ackHistory("새😀");
  assert.equal(h.input.value, "새😀"); assert.equal(h.input.readOnly, false);
  assert.equal(h.controller.settled(), true);
  dispatch(h.input, "keydown", { key: "z", ctrlKey: true, shiftKey: true });
  assert.equal(h.requests.at(-1).kind, "redo");
  h.ackHistory(before);
  assert.equal(h.input.value, before);
  dispatch(h.input, "compositionstart");
  assert.equal(h.controller.history("undo"), false);
  dispatch(h.input, "compositionend"); await Promise.resolve();
  const event = dispatch(h.input, "beforeinput", { inputType: "historyUndo" });
  assert.equal(event.defaultPrevented, true);
  h.ackHistory(before, "HistoryFailure");
  assert.equal(h.input.value, before); assert.equal(h.input.readOnly, false);
  h.type("입력" + before);
  assert.equal(h.controller.history("undo"), false);
  h.ack();
  h.controller.external({ kind: "splice", origin: "form" });
  assert.equal(h.controller.canHistory(), true);
  assert.equal(h.controller.history("undo"), true);
  h.ackHistory(before);
  assert.equal(h.input.disabled, true);
  h.selectTarget();
  assert.equal(h.controller.history("undo"), true);
  h.ackHistory(before);
  assert.equal(h.controller.history("not-a-command"), false);
  h.controller.reset();
  assert.equal(h.controller.history("undo"), false);
});

test("canvas export gate rejects composition and pending drafts without resetting selection", async t => {
  const h = await harness(t), before = h.input.value;
  assert.equal(h.controller.settled(), true);
  dispatch(h.input, "compositionstart");
  assert.equal(h.controller.settled(), false);
  h.type("저장😀" + before);
  assert.equal(h.requests.length, 0);
  dispatch(h.input, "compositionend");
  await Promise.resolve();
  assert.equal(h.controller.settled(), false);
  h.ack();
  assert.equal(h.controller.settled(), true);
  const selection = [h.input.selectionStart, h.input.selectionEnd];
  h.controller.external({ kind: "save", origin: "download" });
  assert.equal(h.input.value, "저장😀" + before);
  assert.deepEqual([h.input.selectionStart, h.input.selectionEnd], selection);
  h.controller.message({ kind: "save", origin: "download", error: "SaveFailed" });
  assert.equal(h.controller.settled(), true);
  assert.equal(h.input.value, "저장😀" + before);
});

test("canvas queued typing resumes after failed save without exporting the draft", async t => {
  const h = await harness(t), before = h.input.value;
  h.setBusy(true);
  h.controller.external({ kind: "save", origin: "download" });
  h.type("대기😀" + before);
  assert.equal(h.requests.length, 0);
  assert.equal(h.controller.settled(), false);
  assert.equal(h.native.text(h.paragraph.section, h.paragraph.paragraph), before + "\r");
  h.setBusy(false);
  h.controller.message({ kind: "save", origin: "download", error: "LayoutReflowRequired" });
  assert.equal(h.requests.length, 1);
  h.ack();
  assert.equal(h.controller.settled(), true);
  assert.equal(h.native.text(h.paragraph.section, h.paragraph.paragraph), "대기😀" + before + "\r");
});

test("canvas input uses native text on five real fixtures and queues fast typing", async t => {
  for (const name of ["charshape", "parashape", "linespacing", "facename", "underline-styles"]) {
    await t.test(name, async t => {
      const h = await harness(t, name), before = h.input.value;
      h.type("한😀" + before); h.type("한😀x" + before);
      assert.equal(h.requests.length, 1); h.ack(); assert.equal(h.requests.length, 2); h.ack();
      assert.equal(h.native.text(h.paragraph.section, h.paragraph.paragraph), "한😀x" + before + "\r");
      assert.equal(h.input.value, "한😀x" + before);
    });
  }
});
test("canvas tab offsets map queued text edits to native source and reject control removal", async t => {
  const h = await harness(t, "software", p => p.paragraph === 33 && p.editable);
  const before = h.native.copyText(0, 33);
  assert.equal(h.input.value, "\t- ");
  h.input.setSelectionRange(1, 3);
  assert.deepEqual(h.controller.selectedRange(), { section: 0, paragraph: 33, startUnit: 8, endUnit: 10 });
  h.type("\t한😀"); h.type("\t한😀끝");
  assert.equal(h.controller.selectedRange(), null);
  assert.equal(h.requests[0].startUnit, 8); assert.equal(h.requests[0].endUnit, 10);
  h.ack(); assert.equal(h.requests[1].startUnit, 11); h.ack();
  assert.equal(h.input.value, "\t한😀끝");
  assert.deepEqual(h.native.copyText(0, 33).subarray(0, 16), before.subarray(0, 16));
  const committed = h.native.copyText(0, 33);
  h.type("한😀끝"); h.ack();
  assert(h.note.textContent.includes("UnsupportedControlDeletion"));
  assert.equal(h.input.value, "\t한😀끝"); assert.deepEqual(h.native.copyText(0, 33), committed);
});
test("canvas retains actual shape anchor through queued typing and refuses its deletion", async t => {
  const h = await harness(t, "software", p => p.paragraph === 44 && p.editable);
  const before = h.native.copyText(0, 44), original = h.input.value;
  assert.equal(original[0], "\ufffc");
  h.type("\ufffc한😀" + original.slice(1));
  h.type("\ufffc한😀끝" + original.slice(1));
  assert.equal(h.requests[0].startUnit, 8); h.ack(); h.ack();
  const committed = h.native.copyText(0, 44);
  assert.deepEqual(committed.subarray(0, 16), before.subarray(0, 16));
  const display = h.input.value;
  h.type(display.slice(1)); h.ack();
  assert(h.note.textContent.includes("UnsupportedControlDeletion"));
  assert.equal(h.input.value, display);
  assert.deepEqual(h.native.copyText(0, 44), committed);
});
test("canvas hyperlink label uses source offsets and preserves protected field ends", async t => {
  const h = await harness(t, "software", p => p.paragraph === 93 && p.editable);
  const before = h.native.copyText(0, 93);
  assert.equal(h.input.value, "«mozuAPI»");
  h.type("«한😀»"); h.type("«한😀끝»");
  assert.equal(h.requests[0].startUnit, 8); assert.equal(h.requests[0].endUnit, 15);
  h.ack();
  const firstSave = h.native.save({ allowStaleLayout: true }).bytes;
  verifyRaw(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/software.hwp"), firstSave, 0, 93, 8, 15, "한😀");
  h.ack();
  assert.equal(h.input.value, "«한😀끝»");
  const committed = h.native.copyText(0, 93);
  verifyRaw(firstSave, h.native.save({ allowStaleLayout: true }).bytes, 0, 93, 11, 11, "끝");
  assert.deepEqual(committed.subarray(0, 16), before.subarray(0, 16));
  assert.deepEqual(committed.subarray(24), before.subarray(30));
  h.type("«한😀끝"); h.ack();
  assert(h.note.textContent.includes("UnsupportedControlDeletion"));
  assert.equal(h.input.value, "«한😀끝»");
  assert.deepEqual(h.native.copyText(0, 93), committed);
});
test("composition commits once after final DOM value and never during intermediate input", async t => {
  const h = await harness(t), before = h.input.value;
  dispatch(h.input, "compositionstart"); h.type("가" + before); h.type("각" + before);
  assert.equal(h.requests.length, 0); assert.equal(h.canvas.dataset.composing, "true");
  dispatch(h.input, "compositionend"); dispatch(h.input, "input", { inputType: "insertFromComposition" });
  await Promise.resolve(); assert.equal(h.requests.length, 1); h.ack();
  assert.equal(h.native.text(0, 1), "각" + before + "\r");
  assert.equal(h.canvas.dataset.composing, "false");
});
test("canvas software application title edits its actual nested table paragraph", async t => {
  const h = await harness(t, "software", p => p.editable && p.text.includes("Software Wave"));
  assert.equal(h.paragraph.paragraph, 2); assert.match(h.paragraph.label, /중첩/);
  const before = h.input.value;
  h.type("한😀" + before); h.ack();
  assert.equal(h.input.value, "한😀" + before);
  assert.equal(h.native.text(0, 2), "한😀" + before + "\r");
  assert.equal(h.requests.length, 1); assert(!h.note.textContent.includes("실패"));
});
test("canvas edits actual direct drawing caption without changing its owner records", async t => {
  const h = await harness(t, "textbox", p => p.paragraph === 1 && p.editable);
  const before = h.input.value;
  h.type("한😀" + before); h.ack();
  assert.equal(h.input.value, "한😀" + before);
  verifyRaw(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/textbox.hwp"), h.native.save({ allowStaleLayout: true }).bytes, 0, 1, 0, 0, "한😀");
});
test("canvas edits the actual section master-page paragraph without flattening its records", async t => {
  const h = await harness(t, "table-bug", p => p.paragraph === 1 && p.editable);
  assert.equal(h.input.value, "");
  h.type("바탕😀"); h.ack();
  assert.equal(h.input.value, "바탕😀");
  verifyRaw(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp"), h.native.save({ allowStaleLayout: true }).bytes, 0, 1, 0, 0, "바탕😀");
});
test("canvas input materializes an originally empty table cell and handles queued typing", async t => {
  const h = await harness(t, "table", p => p.paragraph === 1 && p.editable);
  assert.equal(h.input.value, ""); assert.match(h.paragraph.label, /빈 문단/);
  h.type("한"); h.type("한😀");
  assert.equal(h.requests.length, 1); h.ack(); h.ack();
  assert.equal(h.native.text(0, 1), "한😀\r");
  assert.equal(h.input.value, "한😀");
  h.type(""); h.ack(); assert.equal(h.native.text(0, 1), "\r");
  h.type("재입력"); h.ack(); assert.equal(h.input.value, "재입력");
});
test("native rejected newline rolls draft back without another queued edit", async t => {
  const h = await harness(t), before = h.input.value;
  h.type("bad\n" + before); h.type("bad\nqueued" + before); h.ack();
  assert.equal(h.native.text(0, 1), before + "\r"); assert.equal(h.input.value, before);
  assert.equal(h.requests.length, 1); assert(h.note.textContent.includes("UnsupportedTextControl"));
});
test("reset cancels composition and late completion cannot target a new file", async t => {
  const h = await harness(t);
  dispatch(h.input, "compositionstart"); h.type("가" + h.input.value); h.controller.reset();
  dispatch(h.input, "compositionend"); dispatch(h.input, "input"); await Promise.resolve();
  assert.equal(h.requests.length, 0); assert(h.input.disabled); assert.equal(h.canvas.dataset.caret, "");
});
test("clipped acknowledgement stops editing instead of treating partial text as native source", async t => {
  const h = await harness(t), before = h.input.value;
  h.type("first" + h.input.value); h.type("queued" + h.input.value); h.ack({ clipped: true });
  assert.equal(h.requests.length, 1); assert(h.input.disabled); assert(h.note.textContent.includes("표시 한도"));
  assert.equal(h.native.text(0, 1), "first" + before + "\r");
});
test("explicit Ctrl or Meta A selects the current paragraph, which can become empty and accept input again", async t => {
  const h = await harness(t);
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
    const event = dispatch(h.input, "keydown", { key: "a", ...modifiers });
    assert(event.defaultPrevented); assert.equal(h.input.selectionStart, 0); assert.equal(h.input.selectionEnd, h.input.value.length);
  }
  h.type(""); h.ack(); assert.equal(h.native.text(0, 1), "\r");
  h.type("복원😀"); h.ack(); assert.equal(h.native.text(0, 1), "복원😀\r");
});
