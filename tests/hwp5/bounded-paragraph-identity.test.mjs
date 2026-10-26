import test from 'node:test';
import assert from 'node:assert/strict';
import { displayContent } from '../../web/preview/content.mjs';

test('text exhaustion retains bounded paragraph identity without editable phantom text', () => {
  const paragraph = (text) => ({
    text,
    textPresent: true,
    declaredUnits: text.length + 1,
    parentNodeIndex: null,
    tokens: [],
  });
  const source = {
    version: [5, 0, 0, 0],
    sections: [{ index: 0, paragraphs: [paragraph('abc'), paragraph('😀def'), paragraph('last')] }],
  };
  const content = displayContent(source, { maxUnits: 3, maxParagraphs: 3 });
  assert.equal(content.limited, true);
  assert.deepEqual(
    content.paragraphs.map((p) => [p.paragraph, p.text, p.editable, Boolean(p.clipped)]),
    [
      [0, 'abc', true, false],
      [1, '', false, true],
      [2, '', false, true],
    ],
  );
  assert.equal(content.totalParagraphs, 3);
  assert.equal(displayContent(source, { maxUnits: 0, maxParagraphs: 2 }).paragraphs.length, 2);
  assert.equal(displayContent(source, { maxUnits: 3, maxParagraphs: 0 }).paragraphs.length, 0);
  assert.deepEqual(
    source.sections[0].paragraphs.map((p) => p.text),
    ['abc', '😀def', 'last'],
  );
});
