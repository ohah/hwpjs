import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHwpxPageSettings } from '../../web/preview/hwpx-page-content.mjs';

const flow = {
  paragraph: 1,
  source_node: 8,
  top_level: false,
  host: 'footnote',
  note_context: { note_node: 4, list_node: 6, kind: 'footnote' },
};

function projected(rows, sourceFlows) {
  const content = {
    format: 'hwpx',
    paragraphs: rows,
  };
  attachHwpxPageSettings({ paragraphFlow: () => sourceFlows }, content);
  return content.paragraphs;
}

function row(paragraph, patch = {}) {
  return { section: 0, paragraph, text: '주석 본문', selectionOwner: null, ...patch };
}

test('direct HWPX note bodies share an owner only within the same note list', () => {
  const end = {
    paragraph: 3,
    source_node: 24,
    top_level: false,
    host: 'endnote',
    note_context: { note_node: 20, list_node: 22, kind: 'endnote' },
  };
  const actual = projected(
    [row(0), row(1), row(2)],
    [flow, { ...flow, paragraph: 2, source_node: 9 }, end],
  );
  assert.deepEqual(
    actual.map((p) => p.selectionOwner),
    ['section:0:footnote:4:list:6', 'section:0:footnote:4:list:6', 'section:0:endnote:20:list:22'],
  );
  assert.equal(actual[0].editable, undefined);
});

test('unproven note coordinates cannot grant selection ownership', () => {
  for (const source of [
    [],
    [flow, flow],
    [{ ...flow, note_context: null }],
    [{ ...flow, host: 'body' }],
    [{ ...flow, top_level: true }],
    [{ ...flow, source_node: 5 }],
    [{ ...flow, note_context: { ...flow.note_context, kind: 'endnote' } }],
  ]) {
    assert.equal(projected([row(0)], source)[0].selectionOwner, null);
  }
});

test('a valid note flow cannot override clipped, table, drawing or existing owners', () => {
  for (const patch of [
    { clipped: true },
    { tableCell: {} },
    { tableCaption: {} },
    { drawingText: {} },
    { drawingCaption: {} },
    { createdCell: {} },
    { pageArea: {} },
    { selectionOwner: 'existing' },
  ]) {
    assert.equal(
      projected([row(0, patch)], [flow])[0].selectionOwner,
      patch.selectionOwner ?? null,
    );
  }
});
