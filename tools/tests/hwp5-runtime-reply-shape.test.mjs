import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReplyShape, assertHistoryPacket } from './helpers/hwp5-runtime-reply-shape.mjs';
const meta = (kind) => ({
  kind,
  meta: { application: 'applied', changed: true },
  historyRevision: 1,
  historyRevisions: [0, 1],
  historyStats: { count: 2 },
});
const ranges = [{ start: 0, end: 1, charShapeId: 1 }];
const ref = {
  kind: 'original',
  scope: 'pure-shape',
  epoch: '2',
  id: '10',
  section: 0,
  row: 0,
  column: 0,
};
const content = {
  format: 'hwp5',
  paragraphs: [
    { section: 0, paragraph: 15, text: 'a', characterRanges: ranges, currentReference: ref },
  ],
  characterShapes: [{ id: 1 }],
};
test('shape negative: both missing/empty content or ranges must fail before equality', () => {
  assertReplyShape({ ...meta('query-window'), content }, 'query-window');
  for (const content of [
    undefined,
    {},
    { format: 'hwp5', paragraphs: [], characterShapes: [{ id: 1 }] },
  ])
    for (const side of ['a', 'b'])
      assert.throws(
        () => assertReplyShape({ ...meta('query-window'), content }, 'query-window'),
        /content|paragraphs/,
        side,
      );
  for (const characterRanges of [undefined, []])
    for (const side of ['a', 'b']) {
      const c = structuredClone(content);
      c.paragraphs[0].characterRanges = characterRanges;
      assert.throws(
        () => assertReplyShape({ ...meta('query-window'), content: c }, 'query-window'),
        /characterRanges/,
        side,
      );
    }
});
test('shape negative: both missing capabilities or binding must fail', () => {
  assertReplyShape(
    {
      ...meta('formatting-capabilities'),
      formattingCapabilities: { atomic: true, binding: { id: 1 } },
    },
    'formatting-capabilities',
  );
  for (const formattingCapabilities of [undefined, {}, { atomic: true }])
    for (const side of ['a', 'b'])
      assert.throws(
        () =>
          assertReplyShape(
            { ...meta('formatting-capabilities'), formattingCapabilities },
            'formatting-capabilities',
          ),
        undefined,
        side,
      );
});
test('shape negative: both missing/empty/non-CFB save bytes must fail', () => {
  const good = new Uint8Array(512);
  good.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  assertReplyShape({ ...meta('save'), bytes: good }, 'save');
  for (const bytes of [undefined, new Uint8Array(), new Uint8Array(512)])
    for (const side of ['a', 'b'])
      assert.throws(() => assertReplyShape({ ...meta('save'), bytes }, 'save'), /CFB/, side);
});
test('shape negative: history packet window/ranges/required metadata cannot both disappear', () => {
  const p = {
    ...meta('undo'),
    content: {
      viewKind: 'history-owner-window',
      version: 1,
      operation: 'undo',
      beforeRevision: 0,
      revision: 1,
      beforeEpoch: '1',
      epoch: '2',
      owner: { section: 0, paragraph: 15, sourceNode: 10, parentNode: null },
      window: {
        epoch: '2',
        section: 0,
        sourceNode: 10,
        parentNode: null,
        startUnit: 0,
        endUnit: 2,
        totalUnits: 2,
        text: 'a\r',
      },
      characterRanges: ranges,
      reference: ref,
    },
  };
  assertHistoryPacket(p, 'undo');
  for (const key of ['window', 'characterRanges', 'reference', 'epoch', 'beforeRevision'])
    for (const side of ['a', 'b']) {
      const bad = structuredClone(p);
      delete bad.content[key];
      assert.throws(() => assertHistoryPacket(bad, 'undo'), undefined, side + key);
    }
  for (const key of ['meta', 'historyRevision', 'historyRevisions', 'historyStats'])
    for (const side of ['a', 'b']) {
      const bad = structuredClone(p);
      delete bad[key];
      assert.throws(() => assertHistoryPacket(bad, 'undo'), undefined, side + key);
    }
});
