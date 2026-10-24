import test from "node:test";
import assert from "node:assert/strict";
import { nestedParagraphReference } from "../../web/preview/nested-paragraph-reference.mjs";
import { positionNestedFloatingTable } from "../../web/preview/nested-floating-table-position.mjs";

test("floating paragraph reference uses covered current rows rather than flow height", () => {
  const paragraph = { section: 0, paragraph: 3, text: "😀" };
  const row = { kind: "text", section: 0, paragraph: 3, startUnit: 0, endUnit: 2, text: "😀", x: 0, y: 0, width: 200, textHeight: 16, textTop: 0, height: 300 };
  const flow = { rows: [row], height: 351 };
  const origin = { x: 50, y: 200 };
  const before = structuredClone(flow);
  const reference = nestedParagraphReference(paragraph, flow, origin);
  assert.deepEqual(reference, { state: "referenced", rectangle: { section: 0, paragraph: 3, x: 50, y: 200, width: 200, height: 16 } });
  const table = { section: 0, tableNode: 2, parentTableNode: 1, parentListNode: 11, hostParagraph: 3, sourceGeometry: { geometry: { treat_as_character: false, width: 1500, height: 7500, width_relative: 4, height_relative: 2, horizontal_offset: 0, vertical_offset: 0 }, text_wrap: 2, vertical_relative: 2, horizontal_relative: 3, vertical_alignment: 2, horizontal_alignment: 0 } };
  const positioned = positionNestedFloatingTable(table, { section: 0, tableNode: 1, listNode: 11, x: 50, y: 100, width: 200, height: 351 }, reference.rectangle, { paper: { x: 0, y: 0, width: 600, height: 800 } });
  assert.equal(positioned.rectangle.y, 116);
  const centered = nestedParagraphReference(paragraph, { rows: [{ ...row, paragraphX: 99, paragraphReferenceX: 0 }] }, origin);
  assert.equal(centered.rectangle.x, 50, "glyph centering is not paragraph reference origin");
  for (const change of [{ text: "wrong" }, { endUnit: 1 }, { textHeight: NaN }, { transform: [1, 0, 0, 1, 0, 0] }]) assert.equal(nestedParagraphReference(paragraph, { rows: [{ ...row, ...change }] }, origin).state, "unavailable");
  assert.equal(nestedParagraphReference(paragraph, { rows: [row, row] }, origin).error, "IncompleteNestedParagraphReference");
  assert.deepEqual(flow, before);
});

test("explicit anchor page selects a fragment only after full paragraph coverage is proven", () => {
  const paragraph = { section: 0, paragraph: 3, text: "abcd" };
  const rows = [0, 1].map(pageOrdinal => ({ kind: "text", section: 0, paragraph: 3, pageOrdinal, columnOrdinal: 0,
    startUnit: pageOrdinal * 2, endUnit: pageOrdinal * 2 + 2, text: paragraph.text.slice(pageOrdinal * 2, pageOrdinal * 2 + 2),
    x: 20, y: pageOrdinal * 500, width: 100, textHeight: 16, textTop: 0, height: 20 }));
  const before = structuredClone(rows), origin = { x: 0, y: 0 };
  assert.equal(nestedParagraphReference(paragraph, { rows }, origin).error, "UnsupportedNestedParagraphReference");
  const selected = nestedParagraphReference(paragraph, { rows }, origin, { pageOrdinal: 1, columnOrdinal: 0 });
  assert.equal(selected.state, "referenced"); assert.equal(selected.rectangle.y, 500); assert.equal(selected.rectangle.height, 16);
  assert.equal(nestedParagraphReference(paragraph, { rows: rows.slice(1) }, origin, { pageOrdinal: 1, columnOrdinal: 0 }).error, "IncompleteNestedParagraphReference");
  assert.equal(nestedParagraphReference(paragraph, { rows }, origin, { pageOrdinal: 2, columnOrdinal: 0 }).state, "unavailable");
  assert.equal(nestedParagraphReference(paragraph, { rows }, origin, { pageOrdinal: 1, columnOrdinal: -1 }).state, "unavailable");
  assert.deepEqual(rows, before);
});

test('picture fragments retain the unaligned reference box for LEFT RIGHT CENTER and malformed widths',async()=>{
 const {alignPictureFragment}=await import('../../web/preview/picture-fragment-alignment.mjs');
 const paragraph={section:0,paragraph:3,text:'ab'};
 const fragment={x:19,y:0,width:200,text:'ab',startUnit:0,endUnit:2,textHeight:16,textTop:0,height:20,
  boundaries:[{unit:0,x:0},{unit:1,x:8},{unit:2,x:16}]};
 for(const alignment of [1,2,3]){
  const aligned=alignPictureFragment(fragment,{alignment},true);
  const row={...aligned,kind:'text',section:0,paragraph:3};
  const reference=nestedParagraphReference(paragraph,{rows:[row]},{x:100,y:200});
  assert.equal(reference.state,'referenced',reference.error);assert.equal(reference.rectangle.x,119);assert.equal(reference.rectangle.width,200);
  for(const width of [NaN,Infinity,0,-1])assert.equal(nestedParagraphReference(paragraph,{rows:[{...row,paragraphReferenceWidth:width}]},{x:0,y:0}).state,'unavailable');
 }
 assert.equal(fragment.x,19);assert.equal(fragment.width,200);
});
