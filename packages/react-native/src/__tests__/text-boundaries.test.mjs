import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextBoundaries } from '../canvas/text-boundaries.mjs';
import { boundaryCases } from './text-boundary-goldens.mjs';
const extras = [
  { name: 'CR', text: 'A\rB', cuts: [0, 1, 2, 3] },
  { name: 'LF', text: 'A\nB', cuts: [0, 1, 2, 3] },
  { name: 'CRCRLF', text: 'A\r\r\nB', cuts: [0, 1, 2, 4, 5] },
  { name: 'LFCR', text: '\n\r', cuts: [0, 1, 2] },
  { name: '연속CRLF', text: '\r\n\r\n', cuts: [0, 2, 4] },
  { name: 'emojiCRLF', text: '😀\r\n👩‍💻', cuts: [0, 2, 4, 9] },
];
for (const c of [...boundaryCases, ...extras])
  test(c.name, () => {
    const cuts = c.cuts.flatMap((n, i) =>
      i && c.text[n - 1] === '\n' && c.text[n - 2] === '\r' ? [n - 1, n] : [n],
    );
    let calls = 0;
    const port = createTextBoundaries({
      segmentText(text) {
        calls++;
        return cuts
          .slice(0, -1)
          .map((index, i) => ({ index, segment: text.slice(index, cuts[i + 1]) }));
      },
    });
    const actual = port.segments(c.text).map((x) => x.index);
    actual.push(c.text.length);
    assert.deepEqual(actual, c.cuts);
    assert.equal(calls, 1);
  });
test('잘못된UTF16은Native호출전거부', () => {
  let calls = 0;
  const port = createTextBoundaries({
    segmentText() {
      calls++;
      return [];
    },
  });
  for (const s of ['\ud800', '\udc00', 'A\ud800B'])
    assert.throws(() => port.segments(s), /InvalidUTF16/);
  assert.equal(calls, 0);
});
test('잘못된Native범위는보정전거부', () => {
  const port = createTextBoundaries({
    segmentText() {
      return [
        { index: 0, segment: '\r' },
        { index: 2, segment: '\n' },
      ];
    },
  });
  assert.throws(() => port.segments('\r\n'), /InvalidNativeTextBoundary/);
});
test('Native오류전파와dispose', () => {
  const e = Error('NativeOOM');
  const port = createTextBoundaries({
    segmentText() {
      throw e;
    },
  });
  assert.throws(
    () => port.segments('\r\n'),
    (x) => x === e,
  );
  port.dispose();
  assert.throws(() => port.segments('\r\n'), /DisposedTextBoundaries/);
});
for (const [name, text, parts] of [
  ['배열아님', 'A', { 0: { index: 0, segment: 'A' }, length: 1 }],
  ['null출력', 'A', null],
  [
    '과다행',
    'A',
    [
      { index: 0, segment: 'A' },
      { index: 1, segment: 'B' },
    ],
  ],
  ['빈입력과다', '', [{ index: 0, segment: 'A' }]],
  [
    'surrogate중간',
    '😀',
    [
      { index: 0, segment: '\ud83d' },
      { index: 1, segment: '\ude00' },
    ],
  ],
  ['null행', 'A', [null]],
  ['원시행', 'A', [false]],
])
  test(name, () => {
    const port = createTextBoundaries({
      segmentText() {
        return parts;
      },
    });
    assert.throws(() => port.segments(text), /InvalidNativeTextBoundary/);
  });
test('과다행은map호출전거부', () => {
  const parts = [{}, {}];
  parts.map = () => {
    throw Error('MapMustNotRun');
  };
  const port = createTextBoundaries({
    segmentText() {
      return parts;
    },
  });
  assert.throws(() => port.segments('A'), /InvalidNativeTextBoundary/);
});
test('빈입력0행정상', () => {
  const port = createTextBoundaries({
    segmentText() {
      return [];
    },
  });
  assert.deepEqual(port.segments(''), []);
});
test('surrogate전체와CRLF보정', () => {
  const port = createTextBoundaries({
    segmentText() {
      return [
        { index: 0, segment: '😀' },
        { index: 2, segment: '\r' },
        { index: 3, segment: '\n' },
      ];
    },
  });
  assert.deepEqual(
    port.segments('😀\r\n').map((x) => [x.index, x.segment]),
    [
      [0, '😀'],
      [2, '\r\n'],
    ],
  );
});

test('sparse행은명시오류', () => {
  const parts = [];
  parts.length = 2;
  parts[0] = { index: 0, segment: 'AB' };
  const port = createTextBoundaries({
    segmentText() {
      return parts;
    },
  });
  assert.throws(() => port.segments('AB'), /InvalidNativeTextBoundary/);
});

test('중간hole거부', () => {
  const parts = [];
  parts.length = 3;
  parts[0] = { index: 0, segment: 'A' };
  parts[2] = { index: 2, segment: 'B' };
  const port = createTextBoundaries({
    segmentText() {
      return parts;
    },
  });
  assert.throws(() => port.segments('A B'), /InvalidNativeTextBoundary/);
});
test('map override실행0', () => {
  const parts = [{ index: 0, segment: 'AB' }];
  parts.map = () => {
    throw Error('OverrideMustNotRun');
  };
  const port = createTextBoundaries({
    segmentText() {
      return parts;
    },
  });
  assert.deepEqual(
    port.segments('AB').map((x) => x.segment),
    ['AB'],
  );
});
