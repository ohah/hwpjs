import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFloatingPicturePage } from '../../web/preview/picture-page-projection.mjs';

function fixture() {
  const picture = {
    state: 'located',
    section: 0,
    paragraph: 1,
    pictureNode: 7,
    anchorUnit: 0,
    geometry: {
      treatAsCharacter: false,
      widthRelative: 4,
      heightRelative: 2,
      width: 750,
      height: 750,
      horizontalOffset: 0,
      verticalOffset: 0,
    },
    position: { relations: [2, 3, 0, 0] },
  };
  const paragraphs = [{ section: 0, paragraph: 1, text: '\ufffcab' }];
  const column = { x: 20, y: 20, width: 100, height: 100 };
  const rows = [0, 1].map((i) => ({
    kind: 'text',
    section: 0,
    paragraph: 1,
    startUnit: i ? 2 : 0,
    endUnit: i ? 3 : 2,
    x: 20,
    y: i ? 150 : 30,
    width: 100,
    height: 20,
    pageOrdinal: i,
    columnOrdinal: 0,
    referenceBoxes: { column },
  }));
  return { picture, paragraphs, rows };
}

test('split paragraph start TOP LEFT anchor uses its actual page fragment and declared horizontal area', () => {
  const f = fixture(),
    before = structuredClone(f);
  const result = projectFloatingPicturePage(f.picture, f.paragraphs, f.rows);
  assert.equal(result.state, 'placed', result.error);
  assert.equal(result.pageOrdinal, 0);
  assert.deepEqual(result.rectangle, { x: 20, y: 30, width: 10, height: 10 });
  const wrapped = f.rows.map((row, i) => ({
    ...row,
    paragraphX: i ? 80 : 40,
    width: 20,
    flowParagraphBox: { x: 20, width: 100 },
  }));
  assert.deepEqual(
    projectFloatingPicturePage(f.picture, f.paragraphs, wrapped).rectangle,
    result.rectangle,
  );
  assert.deepEqual(f, before);
});

test('split paragraph projection retains refusal for unproven alignments holes and inconsistent columns', () => {
  for (const mutate of [
    (f) => (f.picture.position.relations[2] = 1),
    (f) => (f.picture.position.relations[3] = 2),
    (f) => (f.rows[1].transform = [1, 0, 0, 1, 0, 0]),
    (f) => delete f.rows[0].referenceBoxes,
    (f) => (f.rows[1].startUnit = 1),
    (f) => (f.rows[1].pageOrdinal = -1),
    (f) => {
      f.paragraphs[0].text = 'a\ufffcb';
      f.picture.anchorUnit = 1;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(projectFloatingPicturePage(f.picture, f.paragraphs, f.rows).state, 'unavailable');
  }
});
