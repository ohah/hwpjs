import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewEditPolicy } from '../../web/preview/preview-edit-policy.mjs';
test('whole-document Native reads and view refresh do not require an editing projection grant', () => {
  const p = createPreviewEditPolicy(
    { paragraphs: [] },
    { previewReadOnlyTables: [{ unknown: true }] },
  );
  assert.equal(p.active, true);
  for (const kind of [
    'document-text-snapshot',
    'document-text-selection',
    'document-text-anchor',
    'document-text-read-binding',
    'reveal-document-text',
    'refresh-document-text-view',
  ])
    assert.equal(p.allowsRequest({ kind }), true, kind);
  for (const kind of [
    'splice',
    'replace-document-text',
    'formatting-patch',
    'source-table-grid',
    'set-object-geometry',
  ])
    assert.equal(p.allowsRequest({ kind, section: 0, paragraph: 0 }), false, kind);
  assert.equal(p.allowsRange({ section: 0, paragraph: 0 }, { section: 0, paragraph: 0 }), false);
});
test('a forged read-like mutation name cannot inherit the independent read permission', () => {
  const p = createPreviewEditPolicy(
    { paragraphs: [] },
    { previewReadOnlyTables: [{ unknown: true }] },
  );
  for (const kind of [
    'document-text-snapshot-write',
    'document-text-selection-mutate',
    'refresh-document-text-view-and-enable',
  ])
    assert.equal(p.allowsRequest({ kind }), false);
});
