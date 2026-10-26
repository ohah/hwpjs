// Test-only projection: source-node identities may change across serialization.
import assert from 'node:assert/strict';

export function workerReopenProjection(content) {
  assert.equal(content.format, 'hwpx');
  assert.equal(content.limited, false);
  assert(Array.isArray(content.paragraphs));
  const paragraphs = content.paragraphs.map(({ section, paragraph, text }) => {
    assert(Number.isSafeInteger(section) && section >= 0);
    assert(Number.isSafeInteger(paragraph) && paragraph >= 0);
    assert.equal(typeof text, 'string');
    return { section, paragraph, text };
  });
  assert.equal(
    new Set(paragraphs.map((row) => `${row.section}:${row.paragraph}`)).size,
    paragraphs.length,
  );
  const objects = Object.fromEntries(
    ['tables', 'drawings', 'pictures', 'containers'].map((key) => {
      assert(Array.isArray(content[key]), `MissingObjectProjection:${key}`);
      return [key, content[key].length];
    }),
  );
  return { paragraphs, objects };
}
