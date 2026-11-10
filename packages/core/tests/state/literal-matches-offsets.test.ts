import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiteralMatcher } from '../../src/state/literal-matches.ts';
import { sourceTextChange, sourceTextChanges } from '../../../../web/preview/text-offsets.mjs';

test('KMP nonoverlap corpus matches an independent literal oracle including Unicode and line controls', () => {
  const texts = [
    '',
    'aaaaa',
    'abababab',
    'abcabcab',
    '가😀가😀',
    'e\u0301e\u0301',
    'a\r\nb\na',
    '\ufffc a\t a',
  ];
  const queries = [
    'a',
    'aa',
    'aaa',
    'aba',
    'abc',
    '가',
    '😀',
    'e',
    '\u0301',
    '\r\n',
    '\t',
    '\ufffc',
    'missing',
  ];
  for (const text of texts)
    for (const query of queries) {
      const expected = [];
      for (let i = 0; i + query.length <= text.length;) {
        if (text.slice(i, i + query.length) === query) {
          expected.push(i);
          i += query.length;
        } else i++;
      }
      assert.deepEqual(
        [...createLiteralMatcher(query)(text)],
        expected,
        JSON.stringify({ text, query }),
      );
    }
});
test('adversarial repeated prefixes have measured linear comparison bounds at N/2N/4N', () => {
  const receipts = [];
  for (const n of [1024, 2048, 4096]) {
    const counts = { prefix: 0, scan: 0 },
      query = 'a'.repeat(63) + 'b';
    const scan = createLiteralMatcher(query, (phase) => counts[phase]++);
    assert.deepEqual([...scan('a'.repeat(n))], []);
    assert(counts.prefix <= 2 * query.length);
    assert(counts.scan <= 2 * n);
    receipts.push({ n, queryUnits: query.length, ...counts });
  }
  console.log(JSON.stringify({ scope: 'actual-KMP-comparisons-only', receipts }));
});
test('bulk monotone source mapping matches canonical single mapping outside protected anchors', () => {
  for (let n = 1; n <= 24; n++) {
    const offsets = [{ at: 0, source: 0 }];
    const changes = [];
    for (let i = 1; i <= n; i++) {
      offsets.push({ at: i * 4, source: i * 11 });
      changes.push({ section: 0, paragraph: 0, startUnit: i * 4, endUnit: i * 4 + 2 });
    }
    assert.deepEqual(
      sourceTextChanges(changes, offsets),
      changes.map((c) => sourceTextChange(c, offsets)),
    );
    assert.deepEqual(sourceTextChanges(changes, undefined), changes);
  }
});
test('offset validation and monotone advances stay O(A+K); no per-match reverse scan', () => {
  const receipts = [];
  for (const n of [32, 64, 128]) {
    const counts = { offset: 0, advance: 0, change: 0 };
    const offsets = Array.from({ length: n + 1 }, (_, i) => ({ at: i * 4, source: i * 11 }));
    Object.defineProperty(offsets, 'findLast', {
      value() {
        throw Error('ReverseScan');
      },
    });
    const changes = Array.from({ length: n }, (_, i) => ({ startUnit: i * 4, endUnit: i * 4 + 1 }));
    const result = sourceTextChanges(
      changes,
      offsets,
      (phase: keyof typeof counts) => counts[phase]++,
    );
    assert.equal(result.length, n);
    assert.equal(counts.offset, n + 1);
    assert.equal(counts.change, n);
    assert(counts.advance <= n);
    receipts.push({ n, ...counts });
  }
  console.log(JSON.stringify({ scope: 'actual-bulk-offset-work-only', receipts }));
});
test('bulk path refuses malformed, overlapping, out-of-order, anchor-crossing and overflow ranges', () => {
  for (const changes of [
    [{ startUnit: 1, endUnit: 0 }],
    [{ startUnit: -1, endUnit: 0 }],
    [
      { startUnit: 0, endUnit: 2 },
      { startUnit: 1, endUnit: 3 },
    ],
    [
      { startUnit: 1, endUnit: 2 },
      { startUnit: 0, endUnit: 1 },
    ],
    [{ startUnit: 0, endUnit: Number.MAX_SAFE_INTEGER }],
  ])
    assert.throws(() => sourceTextChanges(changes, undefined), /InvalidDisplayPosition/);
  for (const offsets of [
    [],
    [{ at: 1, source: 1 }],
    [
      { at: 0, source: 0 },
      { at: 1, source: 0 },
    ],
    [
      { at: 0, source: 0 },
      { at: 1, source: 0x100000000 },
    ],
  ])
    assert.throws(
      () => sourceTextChanges([{ startUnit: 0, endUnit: 1 }], offsets),
      /InvalidDisplayPosition/,
    );
  assert.throws(
    () =>
      sourceTextChanges(
        [{ startUnit: 0, endUnit: 2 }],
        [
          { at: 0, source: 0 },
          { at: 1, source: 8 },
        ],
      ),
    /ProtectedAnchorRange/,
  );
});
