import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutContent } from '../../web/preview/layout.mjs';

test('explicit paragraph format retains document font heights through a sectionless cell projection', () => {
  const paragraphs = [
    {
      section: 0,
      paragraph: 0,
      text: 'abc',
      paragraphShape: {
        spacingFormat: 'hwpx',
        legacySpacingKind: 0,
        legacySpacing: 145,
      },
    },
  ];
  const measure = () => ({ width: 10, height: (13 * 96) / 72 });
  const tagged = layoutContent({ format: 'hwpx', paragraphs }, 20, measure, 100, {
    documentBody: true,
  });
  const cell = layoutContent({ paragraphs }, 20, measure, 100, { documentBody: true });
  assert.deepEqual(cell.rows, tagged.rows);
  assert.equal(cell.height, tagged.height);
  assert.ok(cell.rows.every((row) => row.textHeight < 20));
  const prototype = layoutContent(
    { paragraphs: [{ ...paragraphs[0], paragraphShape: undefined }] },
    20,
    measure,
    100,
    { documentBody: true },
  );
  assert.ok(prototype.rows.every((row) => row.textHeight === 20));
});
