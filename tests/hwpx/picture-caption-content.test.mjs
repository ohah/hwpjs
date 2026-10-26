import test from "node:test";
import assert from "node:assert/strict";
import { attachHwpxPictureCaptions } from "../../web/preview/hwpx-picture-captions.mjs";
import { decodeCaptionBindings } from "../../js/caption-bindings-wire.mjs";
import { decodeTableCaptionBindings } from "../../js/hwpx-table-caption-bindings.mjs";
import { layoutPageContent } from "../../web/preview/page-content-layout.mjs";

const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const caption = { caption_node: 7, list_node: 8 };
const row = { paragraph: 2, owner: { picture_node: 3, caption_node: 7, list_node: 8 } };
const content = () => ({
  paragraphs: [
    { section: 0, paragraph: 0, text: "\ufffc" },
    { section: 0, paragraph: 1, text: "설명" },
  ],
  pictures: [{ section: 0, pictureNode: 3 }],
});

test("picture and table caption binding wire share validation without mixing component IDs", () => {
  assert.deepEqual(
    decodeCaptionBindings(encode([row]), "picture_node", "InvalidPictureCaptionBindings"),
    [row],
  );
  assert.throws(() => decodeTableCaptionBindings(encode([row])), /InvalidTableCaptionBindings/);
  for (const value of [
    [row, row],
    [{ ...row, paragraph: 0 }],
    [{ ...row, owner: { ...row.owner, list_node: -1 } }],
    {},
  ]) {
    assert.throws(
      () => decodeCaptionBindings(encode(value), "picture_node", "InvalidPictureCaptionBindings"),
      /InvalidPictureCaptionBindings/,
    );
  }
  assert.throws(
    () => decodeCaptionBindings(encode([]), "unknown", "Failure"),
    /InvalidCaptionBindingOwnerField/,
  );
});

test("picture captions receive native source and paragraph ownership without creating fake drawings", () => {
  const c = content();
  attachHwpxPictureCaptions(
    { pictureCaptionBindings: () => [row], pictureCaption: () => caption },
    c,
    true,
  );
  assert.deepEqual(c.paragraphs[1].drawingCaption, { drawingNode: 3, captionNode: 7, listNode: 8 });
  assert.deepEqual(c.pictures[0].caption, caption);
  assert.deepEqual(c.pictureCaptionErrors, []);
  assert.equal(c.drawings, undefined);
  assert.equal(c.paragraphs[1].text, "설명");
});

test("unavailable caption ABI remains unknown and late ownership errors do not partially classify text", () => {
  const old = content();
  attachHwpxPictureCaptions({}, old, false);
  assert.equal(old.pictureCaptionAvailable, false);
  assert.equal(Object.hasOwn(old.pictures[0], "caption"), false);
  const c = content();
  attachHwpxPictureCaptions(
    {
      pictureCaptionBindings: () => [row, { ...row, paragraph: 99 }],
      pictureCaption: () => caption,
    },
    c,
    true,
  );
  assert.equal(c.pictureCaptionErrors[0].error, "PictureCaptionParagraphMismatch");
  assert.equal(c.paragraphs[1].drawingCaption, undefined);
  const mismatch = content();
  attachHwpxPictureCaptions(
    { pictureCaptionBindings: () => [row], pictureCaption: () => null },
    mismatch,
    true,
  );
  assert.equal(mismatch.pictureCaptionErrors[0].error, "PictureCaptionBindingMismatch");
  mismatch.pageSettings = [{}];
  assert.equal(layoutPageContent(mismatch, () => 8).error, "AmbiguousPictureCaptionContent");
  const duplicate = content();
  duplicate.paragraphs.push({ ...duplicate.paragraphs[1] });
  attachHwpxPictureCaptions({}, duplicate, true);
  assert.equal(duplicate.pictureCaptionErrors[0].error, "AmbiguousPictureCaptionParagraphs");
});

test("caption refresh is idempotent and old ABI clears only picture-owned derived roles", () => {
  const c = content(),
    editor = { pictureCaptionBindings: () => [row], pictureCaption: () => caption };
  c.paragraphs.push({
    section: 0,
    paragraph: 2,
    text: "도형",
    drawingCaption: { drawingNode: 99, captionNode: 100, listNode: 101 },
  });
  attachHwpxPictureCaptions(editor, c, true);
  const first = structuredClone(c);
  attachHwpxPictureCaptions(editor, c, true);
  assert.deepEqual(c, first);
  attachHwpxPictureCaptions({}, c, false);
  assert.equal(c.pictureCaptionAvailable, false);
  assert.deepEqual(c.pictureCaptionErrors, []);
  assert.equal(c.paragraphs[1].drawingCaption, undefined);
  assert.equal(Object.hasOwn(c.pictures[0], "caption"), false);
  assert.equal(c.paragraphs[2].drawingCaption.drawingNode, 99);
  attachHwpxPictureCaptions(editor, c, true);
  assert.deepEqual(c, first);
});

test("window omission is incomplete caption content rather than mismatched source ownership", () => {
  const c = content();
  c.window = { requestedOffset: 0, requestedCount: 1 };
  c.paragraphs.pop();
  const editor = { pictureCaptionBindings: () => [row], pictureCaption: () => caption };
  attachHwpxPictureCaptions(editor, c, true);
  assert.deepEqual(c.pictureCaptionErrors, []);
  assert.equal(c.pictures[0].captionPartial, true);
  c.pageSettings = [{}];
  assert.equal(layoutPageContent(c, () => 8).error, "IncompletePictureCaptionContent");
  c.paragraphs.push(content().paragraphs[1]);
  attachHwpxPictureCaptions(editor, c, true);
  assert.equal(c.pictures[0].captionPartial, undefined);
  assert.deepEqual(c.paragraphs[1].drawingCaption, { drawingNode: 3, captionNode: 7, listNode: 8 });
  const corrupt = content();
  attachHwpxPictureCaptions({ ...editor, pictureCaption: () => null }, corrupt, true);
  assert.equal(corrupt.pictureCaptionErrors[0].error, "PictureCaptionBindingMismatch");
});
