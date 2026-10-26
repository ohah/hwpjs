import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingPageReference } from '../../web/preview/drawing-page-reference.mjs';

test('drawing paragraph frame follows its validated anchor page while requiring every source unit', () => {
  const drawing = {
    section: 0,
    drawingNode: 7,
    hostParagraph: 3,
    anchorUnit: 1,
    source: { position: { relations: [2, 3, 0, 0] } },
  };
  const paragraphs = [{ section: 0, paragraph: 3, text: '앞\ufffc끝' }];
  const rows = [0, 1].map((pageOrdinal) => ({
    kind: 'text',
    section: 0,
    paragraph: 3,
    startUnit: pageOrdinal,
    endUnit: pageOrdinal === 0 ? 1 : 3,
    text: pageOrdinal === 0 ? '앞' : '\ufffc끝',
    pageOrdinal,
    columnOrdinal: 0,
    x: 20,
    y: pageOrdinal * 500,
    width: 100,
    height: 20,
    textHeight: 16,
    textTop: 0,
  }));
  const before = structuredClone({ drawing, paragraphs, rows });
  const selected = drawingPageReference(drawing, paragraphs, rows);
  assert.equal(selected.state, 'selected', selected.error);
  assert.equal(selected.host.pageOrdinal, 1);
  assert.deepEqual(selected.boxes.paragraph, {
    section: 0,
    paragraph: 3,
    x: 20,
    y: 500,
    width: 100,
    height: 16,
  });
  assert.equal(
    drawingPageReference(drawing, paragraphs, rows.slice(1)).error,
    'MissingDrawingParagraphReference',
  );
  assert.equal(
    drawingPageReference(drawing, paragraphs, [rows[1], rows[1]]).error,
    'AmbiguousDrawingPageAnchor',
  );
  assert.equal(
    drawingPageReference(drawing, paragraphs, [
      rows[0],
      { ...rows[1], transform: [1, 0, 0, 1, 0, 0] },
    ]).error,
    'MissingDrawingParagraphReference',
  );
  assert.deepEqual({ drawing, paragraphs, rows }, before);
});
