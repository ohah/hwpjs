import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { createDocumentTextIndex } from '../../src/state/document-text-search.ts';
import {
  documentTextAnchorRequest,
  documentTextAnchorObservation,
} from '../../src/state/document-text-anchor.ts';
const state = (patch: any = {}) =>
  new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 4,
    nativeHistoryRevision: 7,
    status: 'ready',
    content: { format: 'hwpx', paragraphs: [{ section: 0, paragraph: 41, text: 'a😀z' }] },
    ...patch,
  });
const native = (revision: any = 7) => ({
  schemaVersion: 1,
  scope: 'native-document-text',
  complete: true,
  format: 'hwpx',
  binding: { session: 's1', revision },
  coverage: { totalParagraphs: 1, sections: [{ section: 0, paragraphCount: 1 }] },
  rows: [{ ordinal: 0, section: 0, paragraph: 9001, ref: 'owner-ref', text: 'a\uFFFC😀z' }],
});
const point = () => ({
  kind: 'paragraph' as const,
  section: 0,
  paragraph: 41,
  unit: 3,
  beforeText: 'a😀z',
});
const reply = (revision: any = 7) => ({
  schemaVersion: 1,
  scope: 'native-document-text-anchor',
  coordinateSpace: 'native-read-inventory',
  executionAuthority: false,
  format: 'hwpx',
  binding: { session: 's1', revision },
  ref: 'owner-ref',
  startUnit: 4,
  endUnit: 4,
});
test('inverse anchor retains Native observed units and opaque ref, not display or inventory paragraph equality', () => {
  const s = state(),
    index = createDocumentTextIndex(s, native()),
    request = documentTextAnchorRequest(index, point(), s),
    result = documentTextAnchorObservation(index, request, reply(), s);
  assert.equal(request.target.kind, 'paragraph');
  assert.equal((request.target as any).paragraph, 41);
  assert.equal(result.ref, 'owner-ref');
  assert.equal(result.startUnit, 4);
  assert.equal(result.executionAuthority, false);
  assert(Object.isFrozen(result));
});
test('readonly typed pending cell has independent identity and never a paragraph-zero fallback', () => {
  const s = state({ nativeHistoryRevision: undefined, capabilities: { readOnly: true } }),
    index = createDocumentTextIndex(s, native(null));
  const p = {
    kind: 'created-cell' as const,
    section: 0,
    identity: '18446744073709551615',
    row: 17,
    column: 31,
    unit: 0,
    beforeText: '',
  };
  const req = documentTextAnchorRequest(index, p, s);
  assert(!Object.hasOwn(req.target, 'paragraph'));
  assert.equal((req.target as any).identity, p.identity);
  const result = documentTextAnchorObservation(
    index,
    req,
    { ...reply(null), startUnit: 0, endUnit: 0 },
    s,
  );
  assert.equal(result.binding.revision, null);
  assert.equal(result.executionAuthority, false);
});
test('foreign owner refs binding authority and split Native scalar results reject', () => {
  const s = state(),
    index = createDocumentTextIndex(s, native()),
    req = documentTextAnchorRequest(index, point(), s);
  for (const patch of [
    { ref: 'foreign' },
    { binding: { session: 's2', revision: 7 } },
    { executionAuthority: true },
    { format: 'hwp5' },
    { startUnit: 4, endUnit: 5 },
    { startUnit: 3, endUnit: 3 },
  ])
    assert.throws(() => documentTextAnchorObservation(index, req, { ...reply(), ...patch }, s));
  assert.throws(
    () => documentTextAnchorObservation(index, req, reply(), state({ stateVersion: 5 })),
    /StaleDocumentTextSnapshot/,
  );
  assert.throws(
    () => documentTextAnchorRequest({ ...index }, point(), s),
    /InvalidDocumentTextIndex/,
  );
});
test('invalid display scalar mixed address and noncanonical cell identity refuse before request publication', () => {
  const s = state(),
    index = createDocumentTextIndex(s, native());
  for (const p of [
    { ...point(), unit: 2 },
    { ...point(), unit: 0xffffffff },
    { ...point(), identity: '1' },
    {
      kind: 'created-cell',
      section: 0,
      identity: '18446744073709551616',
      row: 0,
      column: 0,
      unit: 0,
      beforeText: '',
    },
    {
      kind: 'created-cell',
      section: 0,
      identity: '1',
      row: 0,
      column: 0,
      paragraph: 0,
      unit: 0,
      beforeText: '',
    },
  ])
    assert.throws(() => documentTextAnchorRequest(index, p as any, s));
});
