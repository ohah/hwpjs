import test from "node:test";
import assert from "node:assert/strict";
import { layoutPageAreaInlinePictures } from "../../web/preview/page-area-inline-picture-layout.mjs";
import { inlinePictureIndex } from "../../web/preview/picture-inline.mjs";
import { inlinePictureRowPlacement } from "../../web/preview/inline-picture-row-placement.mjs";

function fixture() {
  return {
    paragraphs: [{ section: 0, paragraph: 3, text: "A\ufffcB" }],
    paragraphFlows: [
      {
        section: 0,
        paragraph: 3,
        host: "footer",
        page_area: {
          owner_node: 10,
          list_node: 11,
          apply: "both",
          width: 15000,
          height: 7500,
          vertical_alignment: "top",
        },
      },
    ],
    tables: [],
    drawings: [],
    lines: [],
    containers: [],
    pictures: [
      {
        section: 0,
        paragraph: 3,
        anchorUnit: 1,
        pictureNode: 12,
        state: "located",
        transform: { identity: true },
        geometry: {
          width: 1500,
          height: 2250,
          widthRelative: 4,
          heightRelative: 2,
          treatAsCharacter: true,
        },
        crop: { clip: [0, 1500, 0, 2250] },
      },
    ],
  };
}
const measure = () => ({ width: 8, height: 16 });
const page = (ordinal) => ({
  section: 0,
  ordinal,
  number: ordinal + 1,
  paper: { x: 0, y: ordinal * 500, width: 300, height: 450 },
  page: { x: 20, y: ordinal * 500 + 20, width: 240, height: 300 },
  footer: { x: 20, y: ordinal * 500 + 320, width: 240, height: 100 },
});

test("one source inline footer picture has distinct page-local placements without source mutation", () => {
  const area = fixture(),
    before = structuredClone(area),
    item = [...inlinePictureIndex(area).values()][0];
  const placements = [0, 1].map((ordinal) => {
    const layout = layoutPageAreaInlinePictures(area, page(ordinal), measure, 100);
    assert.equal(layout.state, "placed", layout.error);
    const row = layout.rows.find((row) => row.startUnit <= 1 && row.endUnit > 1);
    const placement = inlinePictureRowPlacement(item, row, layout.rows.indexOf(row));
    assert.equal(placement.state, "placed", placement.error);
    assert.equal(placement.pageOrdinal, ordinal);
    assert.ok(row.height >= item.height);
    return placement;
  });
  assert.equal(placements[1].origin.x, placements[0].origin.x);
  assert.equal(placements[1].origin.y - placements[0].origin.y, 500);
  assert.deepEqual(area, before);
});

test("unsupported or ambiguous inline footer sources are refused rather than silently omitted", () => {
  for (const change of [
    (area) => {
      area.pictures[0].geometry.treatAsCharacter = false;
    },
    (area) => {
      area.pictures.push(structuredClone(area.pictures[0]));
    },
    (area) => {
      area.pictures[0].crop.clip = [];
    },
    (area) => {
      area.pictures[0].caption = {};
    },
    (area) => {
      area.paragraphs[0].text = "ABC";
    },
  ]) {
    const area = fixture();
    change(area);
    assert.equal(layoutPageAreaInlinePictures(area, page(0), measure, 100).state, "unavailable");
  }
  assert.equal(layoutPageAreaInlinePictures(fixture(), page(0), measure, 0).state, "unavailable");
});

test("repeated footer measurement is order independent across revisited pages", () => {
  const area = fixture(),
    before = structuredClone(area);
  const snapshots = new Map();
  for (const ordinal of [0, 9, 1, 19, 9, 0, 19, 1]) {
    const layout = layoutPageAreaInlinePictures(area, page(ordinal), measure, 100);
    assert.equal(layout.state, "placed", layout.error);
    assert.ok(layout.rows.length > 0);
    assert.ok(layout.rows.every((row) => row.pageOrdinal === ordinal));
    if (snapshots.has(ordinal)) assert.deepEqual(layout, snapshots.get(ordinal));
    else snapshots.set(ordinal, structuredClone(layout));
  }
  assert.deepEqual(area, before);
});
