import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDocumentTextCaret } from '../src/document-text-caret.ts';
function harness() {
  const state: any = {
      status: 'ready',
      content: { format: 'hwpx' },
      capabilities: { readOnly: true },
    },
    point: any = { section: 3, paragraph: 9001, unit: 2 };
  let epoch = 0,
    ready = true;
  const port = {
    state: () => state,
    ready: () => ready,
    selection: () => ({ anchor: point, focus: point }),
    selectionFence: () => {
      const captured = epoch;
      return () => captured === epoch;
    },
    paragraph: () => ({ text: 'abcd' }),
    geometry: () => true,
  };
  return {
    port,
    point,
    move() {
      epoch++;
    },
    unready() {
      ready = false;
    },
    get() {
      const result = captureDocumentTextCaret(port);
      assert.equal(result.status, 'captured');
      if (result.status !== 'captured') throw Error('capture expected');
      return result.capture;
    },
  };
}
test('readonly caret capture owns sparse coordinates rather than mutable adapter points', () => {
  const h = harness(),
    capture = h.get();
  h.point.unit = 3;
  assert.equal(capture.anchor.unit, 2);
  assert.equal(capture.current(), false);
  h.point.unit = 2;
  assert.equal(capture.current(), false);
});
test('input A to B to A expires capture even when the final coordinates and state are identical', () => {
  const h = harness(),
    capture = h.get();
  h.point.unit = 3;
  h.move();
  h.point.unit = 2;
  h.move();
  assert.equal(capture.current(), false);
});
test('pending cell keeps lossless observed identity without paragraph-zero admission', () => {
  const h = harness();
  delete h.point.paragraph;
  h.point.createdCell = { identity: '18446744073709551615', row: 17, column: 31 };
  const capture = h.get();
  assert.equal(capture.anchor.kind, 'created-cell');
  assert(!Object.hasOwn(capture.anchor, 'paragraph'));
  h.point.createdCell.row = 18;
  assert.equal(capture.current(), false);
  h.point.paragraph = 0;
  assert.equal(captureDocumentTextCaret(h.port).status, 'unavailable');
});
test('unsettled geometry or clipped source never falls back to a document-start caret', () => {
  const h = harness();
  h.unready();
  assert.equal(captureDocumentTextCaret(h.port).status, 'unavailable');
  const fresh = harness();
  fresh.port.paragraph = () => ({ text: 'abcd', clipped: true }) as any;
  assert.equal(captureDocumentTextCaret(fresh.port).status, 'unavailable');
});
