import test from 'node:test';
import assert from 'node:assert/strict';
import { admitDocumentTextReadSelection } from '../../web/preview/document-text-read-selection.mjs';
const observation = {
  scope: 'native-document-text-selection',
  executionAuthority: false,
  format: 'hwp5',
  beforeText: 'needle',
  target: { kind: 'paragraph', section: 0, paragraph: 41, startUnit: 0, endUnit: 6 },
};
test('read selection marks only the Native-resolved owner selectable without changing edit/history policy', () => {
  const target = {
      section: 0,
      paragraph: 41,
      text: 'needle',
      editable: false,
      selectionOwner: 'section:0:body',
    },
    other = { section: 0, paragraph: 2, text: 'other', editable: false };
  const cap = Object.freeze({ readOnly: true, historyAvailable: false });
  const content = {
    format: 'hwp5',
    readOnly: true,
    capabilities: cap,
    paragraphs: [other, target],
  };
  const next = admitDocumentTextReadSelection(content, observation);
  assert.equal(next.readOnly, true);
  assert.equal(next.capabilities, cap);
  assert.equal(next.paragraphs[1].editable, false);
  assert.equal(next.paragraphs[1].selectable, true);
  assert.equal(next.paragraphs[0], other);
  assert(!Object.hasOwn(target, 'selectable'));
});
test('stale text duplicate owner clipped content and authority injection do not issue read selection', () => {
  const row = {
    section: 0,
    paragraph: 41,
    text: 'needle',
    editable: false,
    selectionOwner: 'section:0:body',
  };
  for (const paragraphs of [
    [{ ...row, text: 'different' }],
    [row, row],
    [{ ...row, clipped: true }],
    [{ ...row, selectionOwner: null }],
  ])
    assert.throws(() =>
      admitDocumentTextReadSelection({ format: 'hwp5', paragraphs }, observation),
    );
  assert.throws(() =>
    admitDocumentTextReadSelection(
      { format: 'hwp5', paragraphs: [row] },
      { ...observation, executionAuthority: true },
    ),
  );
});
