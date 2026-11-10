import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareIndependentTextRequest as prepare } from '../../js/independent-text-request.mjs';
const limits = { requestBytes: 16 * 1024 * 1024, requestDepth: 16, requestStructure: 262144 };
const data = () => ({
  schemaVersion: 1,
  binding: { session: 's1', revision: 7 },
  scope: 'selection',
  groups: [
    {
      ref: 't1-p1:0:2:r7:k0:b0',
      beforeUnits: 4,
      edits: [{ startUnit: 0, endUnit: 2, text: '', expectedOriginal: '😀' }],
    },
  ],
});

test('independent text transport owns deletion, Unicode and literal newline data without normalizing', () => {
  const input = data();
  input.groups[0].edits.push({
    startUnit: 3,
    endUnit: 3,
    text: '한\r\n\t\u0000',
    expectedOriginal: '',
  });
  const expected = JSON.stringify(input);
  const result = prepare(input, limits);
  assert.equal(new TextDecoder().decode(result.bytes), expected);
  input.groups[0].edits[0].text = 'CHANGED';
  input.binding.revision = 99;
  assert.equal(result.value.binding.revision, 7);
  assert.equal(result.value.groups[0].edits[0].text, '');
  assert.equal(new TextDecoder().decode(result.bytes), expected);
});

test('independent text transport checks exact UTF-8 and escaping byte boundaries', () => {
  for (const text of [
    '',
    'A',
    '한',
    '😀',
    'e\u0301',
    '"\\\n\r\t\b\f\u0000\u001f',
    '\u2028\u2029',
    '[/]}:{',
  ]) {
    const input = {
      text,
      number: -0,
      small: 1e-7,
      big: 1e30,
      nil: null,
      yes: true,
      no: false,
      list: [text],
    };
    const size = new TextEncoder().encode(JSON.stringify(input)).length;
    assert.equal(prepare(input, { ...limits, requestBytes: size }).bytes.length, size);
    assert.throws(() => prepare(input, { ...limits, requestBytes: size - 1 }), /LimitExceeded/);
  }
});

test('independent text transport rejects getters, serialization hooks and holes without invoking them', () => {
  let calls = 0;
  const accessor = Object.defineProperty({}, 'bad', {
    get() {
      calls++;
      return 'bad';
    },
  });
  assert.throws(() => prepare(accessor, limits), /AccessorPayloadUnsupported/);
  assert.equal(calls, 0);
  const hook = {
    toJSON() {
      calls++;
      return {};
    },
  };
  assert.throws(() => prepare(hook, limits), /InvalidTextTransactionDTO/);
  assert.equal(calls, 0);
  const sparse = [];
  sparse.length = 2;
  for (const array of [sparse, [undefined], Object.assign([], { extra: 1 })])
    assert.throws(() => prepare({ array }, limits), /InvalidTextTransactionDTO/);
  const hidden = Object.defineProperty({}, 'hidden', { value: 'retained', enumerable: false });
  assert.equal(prepare(hidden, limits).value.hidden, 'retained');
});

test('independent text transport rejects cycles, invalid primitives, symbols and lone surrogates', () => {
  const cycle = {};
  cycle.again = cycle;
  for (const value of [
    cycle,
    { value: 1n },
    { value: Infinity },
    { value: NaN },
    { value: new Date() },
    { [Symbol('bad')]: 1 },
    { text: '\ud800' },
    { text: '\udc00' },
  ])
    assert.throws(
      () => prepare(value, limits),
      /InvalidTextTransactionDTO|InvalidNumber|InvalidUnicodeEncoding/,
    );
  assert.throws(() => prepare([], limits), /InvalidTextTransactionDTO/);
  assert.throws(() => prepare(null, limits), /InvalidTextTransactionDTO/);
});

test('independent text transport bounds recursion, structure and shared-subtree expansion', () => {
  let input = { value: 1 };
  for (let i = 1; i < 16; i++) input = { next: input };
  prepare(input, limits);
  assert.throws(() => prepare({ next: input }, limits), /LimitExceeded/);
  assert.equal(
    new TextDecoder().decode(prepare({ a: 1 }, { ...limits, requestStructure: 3 }).bytes),
    '{"a":1}',
  );
  assert.throws(() => prepare({ a: 1 }, { ...limits, requestStructure: 2 }), /LimitExceeded/);
  const part = { text: 'duplicate' };
  assert.equal(
    new TextDecoder().decode(prepare({ a: part, b: part }, limits).bytes),
    '{"a":{"text":"duplicate"},"b":{"text":"duplicate"}}',
  );
  let shared = { text: 'x' };
  for (let i = 0; i < 14; i++) shared = { a: shared, b: shared };
  assert.throws(() => prepare(shared, { ...limits, requestBytes: 100 }), /LimitExceeded/);
});

test('independent text transport retains null-prototype keys safely and omits undefined object fields', () => {
  const input = JSON.parse('{"__proto__":{"text":"data"},"constructor":"value"}');
  input.missing = undefined;
  const encoded = prepare(input, limits);
  assert.equal(Object.getPrototypeOf(encoded.value), null);
  assert.equal(
    new TextDecoder().decode(encoded.bytes),
    '{"__proto__":{"text":"data"},"constructor":"value"}',
  );
  for (const broken of [null, {}, { ...limits, requestBytes: 0 }, { ...limits, requestDepth: 65 }])
    assert.throws(() => prepare(data(), broken), /InvalidTextTransactionLimits/);
});

test('independent text transport never runs inherited array serialization hooks', () => {
  const old = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
  let calls = 0;
  try {
    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value() {
        calls++;
        return 'hook';
      },
    });
    const encoded = prepare({ values: [1, 2] }, limits);
    assert.equal(new TextDecoder().decode(encoded.bytes), '{"values":[1,2]}');
    assert.equal(calls, 0);
  } finally {
    if (old) Object.defineProperty(Array.prototype, 'toJSON', old);
    else delete Array.prototype.toJSON;
  }
});

test('independent text exact byte budget agrees with standard JSON across deterministic scalar data', () => {
  const scalars = [
    'A',
    '\u0000',
    '\b',
    '\t',
    '\n',
    '\f',
    '\r',
    '"',
    '\\',
    '\u001f',
    '한',
    '😀',
    '\u0301',
    '\u2028',
    '\u2029',
  ];
  let seed = 42;
  for (let sample = 0; sample < 256; sample++) {
    let text = '';
    for (let i = 0; i < sample % 31; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      text += scalars[seed % scalars.length];
    }
    const input = { 3: text, 1: [text, null, sample / 7], text, nil: undefined };
    const expected = new TextEncoder().encode(JSON.stringify(input));
    assert.deepEqual(prepare(input, { ...limits, requestBytes: expected.length }).bytes, expected);
    assert.throws(
      () => prepare(input, { ...limits, requestBytes: expected.length - 1 }),
      /LimitExceeded/,
    );
  }
});
