import { assertContentShape } from './hwp5-runtime-reply-shape.mjs';
import assert from 'node:assert/strict';
// Test-owned data only: never assign these clones to a runtime/cache or issue evidence.
export function cloneData(value) {
  if (value === null || typeof value !== 'object') return value;
  assert([Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(value)));
  const out = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const d = Object.getOwnPropertyDescriptor(value, key);
    assert(typeof key === 'string' && d && 'value' in d, 'ExpectedPlainDataSnapshot');
    Object.defineProperty(out, key, {
      value: cloneData(d.value),
      enumerable: d.enumerable,
      configurable: true,
      writable: true,
    });
  }
  return out;
}
export const row = (content, paragraph) => {
  const matches = content.paragraphs.filter((p) => p.section === 0 && p.paragraph === paragraph);
  assert.equal(matches.length, 1);
  return matches[0];
};
export function insertExpected(before, paragraph, at, text) {
  const expected = cloneData(before),
    p = row(expected, paragraph),
    old = p.text;
  assert(Number.isInteger(at) && at >= 0 && at <= old.length);
  const oldRanges = p.characterRanges;
  assert(Array.isArray(oldRanges) && oldRanges.length > 0);
  const shapes = Array.from({ length: old.length }, (_, unit) => {
    const r = oldRanges.find((r) => r.start <= unit && unit < r.end);
    assert(r, 'OriginalStyleCoverage');
    return r.charShapeId;
  });
  const insertedShape = oldRanges.findLast((r) => r.start <= at)?.charShapeId;
  assert(Number.isInteger(insertedShape));
  const nextShapes = [
    ...shapes.slice(0, at),
    ...Array(text.length).fill(insertedShape),
    ...shapes.slice(at),
  ];
  const ranges = [];
  for (let unit = 0; unit < nextShapes.length; unit++) {
    const id = nextShapes[unit],
      last = ranges.at(-1);
    if (last?.charShapeId === id) last.end = unit + 1;
    else ranges.push({ start: unit, end: unit + 1, charShapeId: id });
  }
  p.text = old.slice(0, at) + text + old.slice(at);
  // Preserve an explicitly observed terminal style marker; do not obtain expected ranges from the reply.
  const terminal = oldRanges.filter((r) => r.start === old.length && r.end === old.length);
  for (const r of terminal)
    ranges.push({ start: p.text.length, end: p.text.length, charShapeId: r.charShapeId });
  p.characterRanges = ranges;
  return expected;
}
// Test-owned revision plan. It never consumes a product response.
export function createHistoryPlan() {
  let revisions = [0],
    cursor = 0,
    next = 1;
  return {
    get revision() {
      return revisions[cursor];
    },
    move(kind) {
      if (kind === 'undo') {
        assert(cursor > 0);
        cursor--;
      } else if (kind === 'redo') {
        assert(cursor + 1 < revisions.length);
        cursor++;
      } else {
        assert.equal(kind, 'splice');
        revisions.splice(cursor + 1);
        revisions.push(next++);
        cursor++;
      }
      return revisions[cursor];
    },
  };
}
export function assertChartStamps(content, expectedRevision) {
  assert(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0);
  if (content.hwp5ChartDisplayAvailable !== true) {
    assert.equal(Object.hasOwn(content, 'hwp5ChartSourceEpoch'), false);
    assert.equal(Object.hasOwn(content, 'hwp5ChartHistoryRevision'), false);
    return;
  }
  assert.equal(
    content.hwp5ChartHistoryRevision,
    expectedRevision,
    'Independent chart history revision',
  );
  const epoch = content.hwp5ChartSourceEpoch;
  assert.equal(typeof epoch, 'string');
  assert.match(epoch, /^[1-9][0-9]*$/);
  assert(BigInt(epoch) <= 0xffffffffffffffffn);
  assert(content.paragraphs.length > 0);
  for (const p of content.paragraphs)
    assert.equal(p.currentReference?.epoch, epoch, 'Chart epoch agrees with Native references');
}
export function assertFullSnapshot(actual, expected, before, { revision, beforeRevision }) {
  // Validate temporal observations BEFORE excluding exactly two fields from comparison.
  assertChartStamps(actual, revision);
  assertChartStamps(before, beforeRevision);
  for (const v of [actual, expected, before]) assertContentShape(v, true);
  assert.equal(actual.format, 'hwp5');
  assert.equal(actual.limited, false);
  assert.equal(actual.paragraphs.length, 65);
  assert.equal(actual.window, undefined);
  assert.equal(actual.viewKind, undefined);
  const a = cloneData(actual),
    e = cloneData(expected),
    b = cloneData(before);
  for (const value of [a, e]) {
    delete value.hwp5ChartSourceEpoch;
    delete value.hwp5ChartHistoryRevision;
  }
  let epoch, oldEpoch;
  for (let i = 0; i < a.paragraphs.length; i++) {
    const ref = a.paragraphs[i].currentReference,
      oldRef = b.paragraphs[i].currentReference;
    assert(ref && oldRef);
    assert.equal(ref.kind, 'original');
    assert(/^[1-9][0-9]*$/.test(ref.epoch));
    epoch ??= ref.epoch;
    oldEpoch ??= oldRef.epoch;
    assert.equal(ref.epoch, epoch);
    assert.equal(oldRef.epoch, oldEpoch);
    const { epoch: _ae, ...identity } = ref,
      { epoch: _be, ...oldIdentity } = oldRef;
    assert.deepEqual(identity, oldIdentity, 'Native reference identity except epoch');
    delete a.paragraphs[i].currentReference.epoch;
    delete e.paragraphs[i].currentReference.epoch;
  }
  assert(
    BigInt(epoch) > BigInt(oldEpoch),
    'Native epoch must advance separately from display expectation',
  );
  assert.deepEqual(
    a,
    e,
    'complete before-derived DTO with manual text/ranges; epoch handled separately',
  );
}
