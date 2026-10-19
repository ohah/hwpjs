import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { drawingPictureScope } from "../../web/preview/drawing-picture-scope.mjs";
import { pictureTextMeasure } from "../../web/preview/picture-text-measurement.mjs";
import { layoutDrawingBodyContent } from "../../web/preview/drawing-body-content-layout.mjs";
import { paginateBodyRows } from "../../web/preview/page-row-flow.mjs";

function fixture() {
  const paragraphs = [{ section: 0, paragraph: 0, text: "\ufffc" },
    { section: 0, paragraph: 1, text: "\ufffc", drawingText: { drawingNode: 10, listNode: 11 } }];
  const picture = { state: "located", section: 0, paragraph: 1, pictureNode: 12, anchorUnit: 0, owner: { anchorNode: 12 },
    geometry: { treatAsCharacter: true, width: 1500, height: 2250, widthRelative: 4, heightRelative: 2 },
    crop: { clip: [0, 0, 1500, 2250] }, transform: { identity: true } };
  return { paragraphs, pictures: [picture, { ...picture, paragraph: 0, pictureNode: 20, owner: { anchorNode: 20 } }] };
}

test("drawing-local inline pictures are measured in their owner, not the filtered body", () => {
  const content = fixture(), before = structuredClone(content);
  const scope = drawingPictureScope(content, [content.paragraphs[0]]);
  assert.equal(scope.state, "scoped", scope.error);
  assert.deepEqual(scope.bodyPictures.map(p => p.pictureNode), [20]);
  assert.deepEqual([...scope.localIds], ["0:12"]);
  const measure = pictureTextMeasure(scope.inlineIndex, [], () => ({ width: 8, height: 20 }));
  assert.deepEqual(measure("\ufffc", content.paragraphs[1], 0, "text"), { width: 20, height: 30 });
  assert.deepEqual(measure("\ufffc", content.paragraphs[0], 0, "text"), { width: 8, height: 20 });
  assert.deepEqual(content, before);
});

test("drawing picture ownership rejects ambiguous, unsupported, and damaged local pictures", () => {
  for (const [mutate, error] of [
    [c => c.paragraphs.push({ ...c.paragraphs[1] }), "AmbiguousDrawingPictureOwner"],
    [c => c.pictures.push({ ...c.pictures[0] }), "AmbiguousDrawingPictureOwner"],
    [c => c.pictures[0].geometry.treatAsCharacter = false, "UnsupportedDrawingLocalFloatingPicture"],
    [c => c.pictures[0].caption = {}, "UnsupportedDrawingLocalPictureCaption"],
    [c => c.pictures[0].cropError = "InvalidCrop", "InvalidDrawingLocalPicture"],
    [c => c.pictures[0].anchorUnit = 1, "InvalidDrawingLocalPicture"],
  ]) {
    const content = fixture(); mutate(content);
    assert.equal(drawingPictureScope(content, [content.paragraphs[0]]).error, error);
  }
});

test("drawing body integration retains and measures a local inline picture without root projection", () => {
  const content = fixture(); content.pictures.pop();
  const setting = { width: 15000, height: 22500, orientation: "widely", gutter_type: "left_only", duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 } };
  content.pageSettings = [setting];
  content.paragraphFlows = [{ section: 0, paragraph: 0, top_level: true, single_column: true, page_break: false, column_break: false },
    { section: 0, paragraph: 1, top_level: false, host: "drawing", column_declaration: null }];
  content.drawings = [{ section: 0, drawingNode: 10, hostParagraph: 0, anchorUnit: 0, source: {
    geometry: { width: 1500, height: 7500, width_relative: 4, height_relative: 2, treat_as_character: false, horizontal_offset: 0, vertical_offset: 0 },
    rendering: { matrix: [1, 0, 0, 0, 1, 0], angle: 0, flip: [false, false], reverse: null },
    rendering_corners: [[0, 0], [1500, 0], [1500, 7500], [0, 7500]], group_context: null,
    position: { relations: [0, 0, 0, 0], flags: [false, false, true, false] },
    flow: { text_wrap: 3, z_order: 0 }, paint: { fill_node: null, shadow_type: 0 }, caption: null,
    text: { list_node: 11, text_direction: 0, line_wrap: 0, vertical_alignment: 0, margin_present: true, margins: [0, 0, 0, 0] },
  } }];
  const before = structuredClone(content);
  const result = layoutDrawingBodyContent(content, () => ({ width: 8, height: 20 }), 100, body => {
    assert.equal(body.paragraphs.length, 1);
    assert.deepEqual(body.pictures, []);
    assert.deepEqual(body.floatingDrawingAnchors, [{ section: 0, paragraph: 0, anchorUnit: 0, node: 10 }]);
    const rows = body.paragraphs.map(p => ({ ...p, kind: "text", startUnit: 0, endUnit: p.text.length, width: 200, height: 20 }));
    const page = paginateBodyRows(rows, setting, body.paragraphFlows);
    return { ...page, pages: page.pages.map(p => ({ ...p, section: 0 })) };
  });
  assert.equal(result.state, "paginated", result.error);
  const local = result.rows.find(row => row.paragraph === 1);
  assert.equal(local.text, "\ufffc"); assert.equal(local.textHeight, 30);
  assert.equal(local.boundaries.at(-1).x - local.boundaries[0].x, 20);
  assert.equal(result.flowPictures.length, 0);
  assert.deepEqual(content, before);
});

test("actual reference drawing picture ownership excludes nested inline pictures from the body", async t => {
  const files = ["reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx", "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx"];
  if (files.some(file => !existsSync(file))) { t.skip("reference fixtures unavailable"); return; }
  const priorSelf = globalThis.self, priorFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage: value => replies.push(value) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => { globalThis.self = priorSelf; globalThis.fetch = priorFetch; });
  await import(`../../web/preview/reader-worker.mjs?drawing-picture-scope=${Date.now()}`);
  for (const [index, file] of files.entries()) {
    await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: readFileSync(file) } });
    assert.equal(replies.length, 1);
    const reply = replies.shift(); assert.equal(reply.error, undefined);
    const content = reply.content, before = JSON.stringify(content);
    const body = content.paragraphs.filter(p => !p.drawingText && !p.drawingCaption);
    const scope = drawingPictureScope(content, body);
    assert.equal(scope.state, "scoped", scope.error);
    assert.deepEqual([...scope.localIds], index === 0 ? ["0:2187", "0:2211"] : ["0:615", "0:639"]);
    assert.equal(scope.inlineIndex.size, 2);
    assert.ok(scope.bodyPictures.every(p => body.some(owner => owner.section === p.section && owner.paragraph === p.paragraph)));
    assert.equal(JSON.stringify(content), before);
  }
});
