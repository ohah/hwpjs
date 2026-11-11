import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  documentBlockRange,
  paragraphSelectionText,
} from '../../web/preview/paragraph-selection.mjs';
import { wordSelectionRange } from '../../web/preview/text-input.mjs';

test('word selection uses UTF-16 coordinates without consuming adjacent spaces or punctuation', () => {
  const text = '😀 café, 한글';
  assert.deepEqual(wordSelectionRange(text, 5), [3, 7]);
  assert.deepEqual(wordSelectionRange(text, 7), [3, 7]);
  assert.deepEqual(wordSelectionRange(text, 10), [9, 11]);
  assert.equal(wordSelectionRange(text, 1), null);
  assert.equal(wordSelectionRange(text, 8), null);
});

test('document block keeps empty paragraphs and rejects incomplete or mixed-owner views', () => {
  const row = (paragraph, text) => ({
    section: 0,
    paragraph,
    text,
    selectionOwner: 'section:0:body',
  });
  const paragraphs = [row(0, 'first'), row(1, ''), row(2, '끝')];
  const point = { section: 0, paragraph: 1, unit: 0 };
  const content = { paragraphs, totalParagraphs: 3 };
  const range = documentBlockRange(content, point);
  assert.deepEqual(range, {
    anchor: { section: 0, paragraph: 0, unit: 0 },
    focus: { section: 0, paragraph: 2, unit: 1 },
  });
  assert.equal(paragraphSelectionText(paragraphs, range.anchor, range.focus), 'first\n\n끝');
  for (const override of [
    { limited: true },
    { window: {} },
    { totalParagraphs: 4 },
    { paragraphs: [paragraphs[0], { ...paragraphs[1], clipped: true }, paragraphs[2]] },
    { paragraphs: [paragraphs[0], { ...paragraphs[1], selectionOwner: 'other' }, paragraphs[2]] },
    { paragraphs: [paragraphs[0], paragraphs[1], { ...paragraphs[2], section: 1 }] },
  ])
    assert.equal(documentBlockRange({ ...content, ...override }, point), null);
});
