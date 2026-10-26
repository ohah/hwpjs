import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHwp5WindowSelection } from '../../web/preview/hwp5-window-selection.mjs';

function content() {
  return {
    totalParagraphs: 100,
    window: {
      requestedOffset: 50,
      requestedCount: 2,
      paragraphOffset: 50,
      paragraphCount: 2,
      contextCount: 1,
    },
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        windowOrdinal: 0,
        windowContext: true,
        editable: false,
        selectable: false,
        text: 'context',
      },
      {
        section: 1,
        paragraph: 0,
        windowOrdinal: 50,
        windowContext: false,
        editable: true,
        text: 'first',
      },
      {
        section: 1,
        paragraph: 1,
        windowOrdinal: 51,
        windowContext: false,
        editable: true,
        text: 'second',
      },
    ],
  };
}

test('window selection coverage retains sparse readonly context and does not mutate input', () => {
  const value = content(),
    before = structuredClone(value);
  assert.deepEqual(validateHwp5WindowSelection(value), {
    offset: 50,
    count: 2,
    contextCount: 1,
    completeDocument: false,
  });
  assert.deepEqual(value, before);
});

test('window selection rejects gaps clipped text writable context and forged bounds', () => {
  for (const mutate of [
    (value) => {
      value.paragraphs[0].editable = true;
    },
    (value) => {
      value.paragraphs[0].selectable = true;
    },
    (value) => {
      value.paragraphs[1].clipped = true;
    },
    (value) => {
      value.paragraphs[1].windowOrdinal = 49;
    },
    (value) => {
      value.paragraphs[2].windowOrdinal = 50;
    },
    (value) => {
      value.paragraphs[2].paragraph = 0;
    },
    (value) => {
      value.window.contextCount++;
    },
    (value) => {
      value.window.paragraphOffset = 0;
    },
    (value) => {
      value.window.requestedOffset = '50';
    },
    (value) => {
      value.readOnly = true;
    },
    (value) => {
      value.paragraphs.pop();
    },
  ]) {
    const value = content();
    mutate(value);
    assert.throws(() => validateHwp5WindowSelection(value), /InvalidHwp5WindowSelection/);
  }
});
