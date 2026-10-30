import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHwp5TextDelta,
  decodeHwp5TextWindow,
} from '../../../../js/hwp5-exclusive-text-delta.mjs';
import {
  exactDisplayValue,
  validateFullSnapshotTextDelta,
} from '../../src/internal/full-snapshot-text-delta.ts';

// 합성 wire/DTO의 순수 규칙 검사이며 Native 동작이나 권위 발급을 모킹하지 않습니다.
const wire = (r) => new TextEncoder().encode(JSON.stringify(r));
function receipt() {
  return {
    version: 1,
    exclusive: true,
    beforeEpoch: '1',
    epoch: '2',
    beforeRevision: 0,
    revision: 1,
    section: 0,
    paragraph: 1,
    sourceNode: 3,
    parentNode: null,
    startUnit: 1,
    removed: [],
    inserted: [88],
    totalUnits: 4,
    runs: [{ start_unit: 0, char_shape_id: 0 }],
  };
}
function windowBytes(text = 'aXb\r') {
  const out = new Uint8Array(48 + text.length * 2);
  out.set(new TextEncoder().encode('H5W1'));
  const v = new DataView(out.buffer);
  [1, 2, 0, 0, 3, 0xffffffff, text.length, 0, text.length, 1, text.length * 2].forEach((n, i) =>
    v.setUint32(4 + i * 4, n, true),
  );
  for (let i = 0; i < text.length; i++) v.setUint16(48 + i * 2, text.charCodeAt(i), true);
  return out;
}
function fixture() {
  const reference = (epoch, id) => ({ epoch, id, kind: 'original', scope: 'scope-1' });
  const row = (epoch, paragraph, text, id) => ({
    section: 0,
    paragraph,
    text,
    editable: true,
    currentReference: reference(epoch, id),
    characterRanges: [{ start: 0, end: text.length, charShapeId: 0 }],
  });
  const before = {
    format: 'hwp5',
    readOnly: false,
    limited: false,
    header: { width: 100 },
    paragraphs: [row('1', 1, 'ab', '3'), row('1', 2, 'other', '4')],
  };
  const next = {
    ...structuredClone(before),
    paragraphs: [row('2', 1, 'aXb', '3'), row('2', 2, 'other', '4')],
  };
  const packet = {
    receipt: receipt(),
    before: { epoch: '1', section: 0, sourceNode: 3, parentNode: null, totalUnits: 3 },
    window: decodeHwp5TextWindow(windowBytes()),
    reference: reference('2', '3'),
  };
  return { before, next, packet };
}
function valid(f) {
  return validateFullSnapshotTextDelta(Object.freeze(f.before), Object.freeze(f.next), f.packet);
}

test('정상 delta/window와 전체 snapshot', () => {
  assert.deepEqual(decodeHwp5TextDelta(wire(receipt())), receipt());
  assert.equal(decodeHwp5TextWindow(windowBytes()).text, 'aXb\r');
  assert.equal(valid(fixture()), true);
});
for (const [name, change] of [
  [
    'epoch overflow',
    (r) => {
      r.epoch = '18446744073709551616';
    },
  ],
  [
    'length overflow',
    (r) => {
      r.totalUnits = 4097;
    },
  ],
  [
    'uint sentinel',
    (r) => {
      r.section = 0xffffffff;
    },
  ],
  [
    'UTF16 unit overflow',
    (r) => {
      r.inserted = [65536];
    },
  ],
  [
    'insert length overflow',
    (r) => {
      r.inserted = Array(4097).fill(65);
    },
  ],
  [
    'runs empty',
    (r) => {
      r.runs = [];
    },
  ],
  [
    'runs duplicate',
    (r) => {
      r.runs.push({ start_unit: 0, char_shape_id: 1 });
    },
  ],
  [
    'runs first nonzero',
    (r) => {
      r.runs[0].start_unit = 1;
    },
  ],
  [
    'runs beyond text',
    (r) => {
      r.runs.push({ start_unit: 5, char_shape_id: 1 });
    },
  ],
  [
    'unknown field',
    (r) => {
      r.extra = true;
    },
  ],
])
  test(`decoder 거부: ${name}`, () => {
    const r = receipt();
    change(r);
    assert.throws(() => decodeHwp5TextDelta(wire(r)));
  });

for (const [name, change] of [
  ['payload length', (b) => b.slice(0, -1)],
  [
    'magic',
    (b) => {
      b[0] = 0;
      return b;
    },
  ],
  ['unpaired surrogate', () => windowBytes('\ud800')],
  [
    'window overflow',
    (b) => {
      new DataView(b.buffer).setUint32(36, 4097, true);
      return b;
    },
  ],
])
  test(`window 거부: ${name}`, () =>
    assert.throws(() => decodeHwp5TextWindow(change(windowBytes()))));

for (const [name, change] of [
  [
    'CR missing',
    (f) => {
      f.packet.window.text = 'aXb!';
    },
  ],
  [
    'embedded control',
    (f) => {
      f.next.paragraphs[0].text = 'a\nb';
      f.packet.window.text = 'a\nb\r';
    },
  ],
  [
    'native source mismatch',
    (f) => {
      f.packet.window.sourceNode = 99;
    },
  ],
  [
    'native epoch mismatch',
    (f) => {
      f.packet.before.epoch = '9';
    },
  ],
  [
    'context scope mismatch',
    (f) => {
      f.next.paragraphs[0].currentReference.scope = 'other';
    },
  ],
  [
    'reference mismatch',
    (f) => {
      f.packet.reference.id = '99';
    },
  ],
  [
    'whole header change',
    (f) => {
      f.next.header.width++;
    },
  ],
  [
    'nonowner text change',
    (f) => {
      f.next.paragraphs[1].text = 'changed';
    },
  ],
  [
    'owner geometry change',
    (f) => {
      f.next.paragraphs[0].width = 7;
    },
  ],
  [
    'runs mismatch',
    (f) => {
      f.next.paragraphs[0].characterRanges[0].charShapeId = 9;
    },
  ],
  [
    'readonly',
    (f) => {
      f.next.readOnly = true;
    },
  ],
  [
    'limited',
    (f) => {
      f.next.limited = true;
    },
  ],
  [
    'clipped',
    (f) => {
      f.next.paragraphs[0].clipped = true;
    },
  ],
])
  test(`snapshot 거부: ${name}`, () => {
    const f = fixture();
    change(f);
    assert.equal(valid(f), false);
  });

test('exact 비교는 accessor를 실행하지 않고 거부', () => {
  let calls = 0;
  const value = () =>
    Object.defineProperty({}, 'x', {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
  assert.equal(exactDisplayValue(value(), value()), false);
  assert.equal(calls, 0);
});
test('중첩 header accessor를 실행하지 않고 거부', () => {
  const f = fixture();
  let calls = 0;
  f.next.header = Object.defineProperty({}, 'width', {
    enumerable: true,
    get() {
      calls++;
      return 100;
    },
  });
  assert.equal(valid(f), false);
  assert.equal(calls, 0);
});
test('루트 header accessor도 실행하지 않고 거부', () => {
  const f = fixture();
  let calls = 0;
  Object.defineProperty(f.next, 'header', {
    enumerable: true,
    get() {
      calls++;
      return { width: 100 };
    },
  });
  const result = valid(f);
  assert.deepEqual({ result, calls }, { result: false, calls: 0 });
});
test('UTF16 서로게이트 쌍과 BOM은 window에서 보존', () => {
  const text = '\ufeff😀\r';
  const result = decodeHwp5TextWindow(windowBytes(text));
  assert.equal(result.text, text);
  assert.equal(result.totalUnits, 4);
});
