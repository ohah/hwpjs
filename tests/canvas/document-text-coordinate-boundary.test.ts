import test from 'node:test';
import assert from 'node:assert/strict';
import { displayHwpxContent } from '../../web/preview/hwpx-content.mjs';
import { documentTextWindow } from '../../web/preview/document-text-window.mjs';
import { admitDocumentTextReadSelection } from '../../web/preview/document-text-read-selection.mjs';
import { captureDocumentTextCaret } from '../../packages/vanilla/src/document-text-caret.ts';
import { selectDocumentTextObservation } from '../../packages/vanilla/src/document-text-selection.ts';
// Controlled Native-current DTO, using the same physical event ordinal at every
// consumer. Native Session first+index is one-based; no Native execution claim.
function fixture(section: number, nativeParagraph: number) {
  const physical = [
    { section, paragraph: nativeParagraph },
    { section, paragraph: nativeParagraph + 1 },
  ];
  const projection = {
    paragraphCount: physical.length,
    events: physical.flatMap((p) => [
      { ...p, kind: 'paragraph_start' },
      { ...p, kind: 'content', value: '같은문자' },
      { ...p, kind: 'paragraph_end' },
    ]),
  };
  const content = displayHwpxContent(projection);
  const target = {
    kind: 'paragraph',
    section,
    paragraph: nativeParagraph,
    startUnit: 0,
    endUnit: 2,
  };
  const native = Object.freeze({
    schemaVersion: 1,
    scope: 'native-document-text-selection',
    coordinateSpace: 'native-current-text-observation',
    executionAuthority: false,
    format: 'hwpx',
    binding: { session: 's7', revision: null },
    readBinding: { epoch: '7', serial: '19' },
    ref: 'controlled-native-ref',
    beforeText: '같은문자',
    expectedOriginal: '같은',
    target,
  });
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
  };
  const state: any = {
    status: 'ready',
    stateVersion: 1,
    token,
    content,
    capabilities: { readOnly: true },
  };
  return {
    projection,
    content,
    native,
    state,
    observation: { native, stateVersion: 1, token } as any,
  };
}
for (const [section, ordinal] of [
  [0, 1],
  [0, 2],
  [3, 9001],
  [7, 42],
]) {
  test(`same readonly Native response maps section ${section} ordinal ${ordinal} to actual renderer row`, async () => {
    const f = fixture(section!, ordinal!),
      row = f.content.paragraphs[0];
    const before = JSON.stringify(f.native);
    assert.deepEqual(documentTextWindow({}, f.projection, 'hwpx', f.native), {
      offset: 0,
      count: 1,
    });
    const admitted = admitDocumentTextReadSelection(f.content, f.native);
    assert.equal(admitted.paragraphs[0].selectable, true);
    assert.equal(
      admitted.paragraphs[1].selectable,
      undefined,
      'same adjacent text is not owner evidence',
    );
    const point = { section: row.section, paragraph: row.paragraph, unit: 1 };
    const caret = captureDocumentTextCaret({
      state: () => f.state,
      ready: () => true,
      selection: () => ({ anchor: point, focus: point }),
      selectionFence: () => () => true,
      paragraph: (p) =>
        f.content.paragraphs.find(
          (r: any) => r.section === p.section && r.paragraph === p.paragraph,
        ),
      geometry: () => true,
    });
    assert.equal(caret.status, 'captured');
    if (caret.status !== 'captured') throw Error('expected actual display caret');
    assert.deepEqual(caret.capture.anchor, {
      kind: 'paragraph',
      section: section!,
      paragraph: ordinal!,
      unit: 1,
      beforeText: row.text,
    });
    let selection: any = null;
    const result = await selectDocumentTextObservation(f.observation, () => true, {
      state: () => f.state,
      ready: () => true,
      admit: (r) =>
        r.section === row.section && r.paragraph === row.paragraph && r.expectedText === row.text,
      select: (r) => {
        selection = {
          anchor: { section: r.section, paragraph: r.paragraph, unit: r.startUnit },
          focus: { section: r.section, paragraph: r.paragraph, unit: r.endUnit },
        };
        return true;
      },
      published: () => true,
      selection: () => selection,
      flush: async () => {},
    });
    assert(result);
    assert.equal(selection.anchor.paragraph, row.paragraph);
    assert.equal(
      JSON.stringify(f.native),
      before,
      'raw Native authority/target/stamp stays unchanged',
    );
  });
}
test('Native HX zero never resolves to the next paragraph even when text matches', () => {
  const f = fixture(0, 1),
    invalid = { ...f.native, target: { ...f.native.target, paragraph: 0 } };
  assert.throws(() => documentTextWindow({}, f.projection, 'hwpx', invalid));
  assert.throws(() => admitDocumentTextReadSelection(f.content, invalid));
});

// H5 and created cells do not share the HWPX paragraph offset.
test('HWP5 paragraph zero and typed cells keep their existing axes', async () => {
  const { nativeDocumentParagraph, displayDocumentParagraph } =
    await import('../../js/document-text-coordinates.mjs');
  for (const paragraph of [0, 1, 9000, 0xffffffff]) {
    assert.equal(nativeDocumentParagraph('hwp5', paragraph), paragraph);
    assert.equal(displayDocumentParagraph('hwp5', paragraph), paragraph);
  }
  assert.equal(displayDocumentParagraph('hwpx', 0), undefined);
  assert.equal(nativeDocumentParagraph('hwpx', 0xffffffff), undefined);
  for (const n of [-1, 0.1, NaN, Infinity, 0x100000000]) {
    assert.equal(displayDocumentParagraph('hwpx', n), undefined);
    assert.equal(nativeDocumentParagraph('hwp5', n), undefined);
  }
  assert.equal(nativeDocumentParagraph('unknown', 0), undefined);
  const f = fixture(0, 1),
    cell = {
      kind: 'created-cell',
      section: 0,
      identity: '18446744073709551615',
      row: 7,
      column: 9,
      startUnit: 0,
      endUnit: 2,
    };
  const observation = { ...f.observation, native: { ...f.native, target: cell } };
  let selected = false;
  const point = {
    section: 0,
    createdCell: { identity: cell.identity, row: cell.row, column: cell.column },
  };
  assert(
    await selectDocumentTextObservation(observation, () => true, {
      state: () => f.state,
      ready: () => true,
      admit: (r) =>
        r.paragraph === undefined &&
        r.createdCell?.identity === cell.identity &&
        r.createdCell.row === 7 &&
        r.createdCell.column === 9,
      select: () => (selected = true),
      published: () => true,
      selection: () =>
        selected ? { anchor: { ...point, unit: 0 }, focus: { ...point, unit: 2 } } : null,
      flush: async () => {},
    }),
  );
});
