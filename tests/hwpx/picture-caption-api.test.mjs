import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

const wasmPath = process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm";
const wasm = readFileSync(wasmPath);
const exports = WebAssembly.Module.exports(new WebAssembly.Module(wasm));
const available = ["hwpx_edit_picture_caption", "hwpx_edit_picture_caption_bindings"].every(name => exports.some(e => e.name === name && e.kind === "function"));
const reference = "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx";

test("picture caption API reads real ownership without changing the package", { skip: !available || !existsSync(reference) }, async () => {
  const input = readFileSync(reference), editor = await createHwpxEditor(wasm);
  try {
    editor.open(input);
    const rows = editor.pictureCaptionBindings(0), target = rows.find(row => row.owner.picture_node === 350);
    assert.equal(target.paragraph, 32);
    assert.throws(() => editor.anchorText(0, target.paragraph), /UnsupportedStructuralFieldEdit/);
    const caption = editor.pictureCaption(0, 350);
    assert.equal(caption.caption_node, target.owner.caption_node);
    assert.equal(caption.list_node, target.owner.list_node);
    assert.equal(caption.width, 8504); assert.equal(caption.gap, 850); assert.equal(caption.last_width, 14004);
    assert.equal(caption.side, 3); assert.equal(caption.full_size, false);
    assert.deepEqual(editor.pictureCaptionBindings(0), rows);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.throws(() => editor.pictureCaption(0, 0), /InvalidPictureCaptionNode/);
    assert.throws(() => editor.pictureCaption(9999, 350), /InvalidSectionIndex/);
    assert.throws(() => editor.pictureCaptionBindings(9999), /InvalidSectionIndex/);
    assert.throws(() => editor.pictureCaption(0, -1));
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
});

test("actual Worker attaches picture caption source and separates it from ordinary body text", { skip: !available || !existsSync(reference) }, async t => {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: value => replies.push(value) };
  globalThis.fetch = async () => new Response(wasm);
  t.after(() => { globalThis.self = previousSelf; globalThis.fetch = previousFetch; });
  await import(`../../web/preview/reader-worker.mjs?picture-caption-api=${Date.now()}`);
  const input = readFileSync(reference), before = Buffer.from(input);
  await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: input } });
  assert.equal(replies.length, 1); const reply = replies.shift(); assert.equal(reply.error, undefined);
  assert.equal(reply.content.pictureCaptionAvailable, true);
  assert.deepEqual(reply.content.pictureCaptionErrors, []);
  const picture = reply.content.pictures.find(p => p.pictureNode === 350);
  const paragraph = reply.content.paragraphs.find(p => p.section === 0 && p.paragraph === 31);
  assert.deepEqual(paragraph.drawingCaption, { drawingNode: 350, captionNode: picture.caption.caption_node, listNode: picture.caption.list_node });
  assert.equal(paragraph.text, " < 열풍건초 생산 시스템 >");
  assert.ok(!reply.content.drawings.some(d => d.drawingNode === 350));
  assert.deepEqual(input, before);
  await self.onmessage({ data: { kind: "enable" } });
  assert.equal(replies.shift().error, undefined);
  await self.onmessage({ data: { kind: "query-edit-window", offset: 31, count: 1 } });
  assert.equal(replies.length, 1);
  const window = replies.shift();
  assert.equal(window.error, undefined, JSON.stringify(window));
  assert.deepEqual(window.content.pictureCaptionErrors, []);
  assert.ok(window.content.pictures.some(p => p.pictureNode === 350));
  assert.deepEqual(window.content.paragraphs.find(p => p.paragraph === 31).drawingCaption, paragraph.drawingCaption);
  await self.onmessage({ data: { kind: "save" } });
  const saved = replies.shift(); assert.equal(saved.error, undefined);
  assert.deepEqual(Buffer.from(saved.bytes), before);
  await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } });
});

test("old WASM explicitly refuses optional picture caption methods", async t => {
  const baseline = process.env.HWPJS_BASELINE_WASM ?? "zig-out/bin/hwpjs.wasm";
  if (!existsSync(baseline)) { t.skip("baseline WASM unavailable"); return; }
  const bytes = readFileSync(baseline), names = WebAssembly.Module.exports(new WebAssembly.Module(bytes));
  if (names.some(e => e.name === "hwpx_edit_picture_caption")) { t.skip("baseline already has the optional caption ABI"); return; }
  const editor = await createHwpxEditor(bytes);
  try {
    editor.open(readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table2.hwpx"));
    assert.throws(() => editor.pictureCaptionBindings(0), /HwpxPictureCaptionBindingsAbiUnavailable/);
    assert.throws(() => editor.pictureCaption(0, 350), /HwpxPictureCaptionAbiUnavailable/);
  } finally { editor.close(); }
});
