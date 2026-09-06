import assert from "node:assert/strict";
import { parameterActual } from "./parameters.mjs";
import { tableCellLists } from "./tables.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const frame = (tag, level, b) =>
  Buffer.concat([w(tag | (level << 10) | (b.length << 20)), b]);
const set = (items, id = 1) =>
  Buffer.concat([u(id), u(items.length), u(0), ...items]);
const item = (id, type, b = Buffer.alloc(0)) =>
  Buffer.concat([u(id), u(type), b]);
function countBins(bytes) {
  let count = 0;
  for (let p = 0; p < bytes.length; ) {
    const flags = bytes.readUInt32LE(p);
    p += 4;
    let n = flags >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    if ((flags & 1023) === 18) count++;
    p += n;
  }
  return count;
}
const run = (call, source, version, bins, bytes, limit) => {
  const out = call(
    23,
    Buffer.concat([Buffer.from([source]), w(version), w(bins), bytes]),
    limit,
  );
  assert.equal(out.length, 52);
  return Array.from({ length: 13 }, (_, i) => out.readUInt32LE(i * 4));
};
export function parameterSourceActual(call, v, doc, section = null) {
  const isBody = section !== null,
    bytes = section ?? doc;
  const stats = parameterActual(call, bytes, isBody ? 87 : 27),
    expected = Array(13).fill(0);
  expected[isBody ? 1 : 0] = stats[0];
  expected[3] = stats[0];
  expected[6] = stats[1];
  expected[7] = stats[6];
  if (isBody)
    for (const raw of tableCellLists(bytes)) {
      assert.notEqual(raw[38], 255); // Actual corpus has no marked field-name set yet.
      if (raw.length > 39 || (raw.length > 38 && raw[38] !== 0)) expected[10]++;
    }
  const actual = run(call, Number(isBody), v, countBins(doc), bytes);
  assert.deepEqual(actual, expected);
  return actual;
}
export function parameterSourceEdges(call) {
  const version = 0x05010001;
  const good = set([item(7, 0x8002, u(1))]);
  const read = (bytes, bins = 1, source = 0, limit) =>
    run(call, source, version, bins, bytes, limit);
  assert.deepEqual(
    read(frame(27, 0, good)),
    [1, 0, 0, 1, 0, 0, 2, 1, 0, 0, 0, 0, 0],
  );
  for (const id of [0, 2, 65535]) {
    const bad = set([item(7, 0x8002, u(id))]);
    assert.throws(() => read(frame(27, 0, bad)), /InvalidResourceReference/);
    read(frame(27, 0, good));
  }
  read(frame(27, 0, set([item(7, 0x8002, u(65535))])), 65535);
  const nested = set([
    item(
      1,
      0x8000,
      set([item(1, 0x8001, Buffer.concat([u(1), u(19), u(0x8002), u(2)]))]),
    ),
  ]);
  assert.throws(() => read(frame(27, 0, nested)), /InvalidResourceReference/);
  assert.equal(read(frame(27, 0, nested), 2)[7], 1);
  const unknown = set([item(7, 0x7777, Buffer.from([1, 2, 3]))]);
  const tail = Buffer.concat([set([]), Buffer.from([0, 255, 13])]);
  const mixed = Buffer.concat([
    frame(27, 0, unknown),
    frame(27, 0, good),
    frame(27, 0, tail),
  ]);
  assert.deepEqual(read(mixed), [
    3,
    0,
    0,
    2,
    1,
    unknown.length,
    3,
    1,
    0,
    0,
    0,
    1,
    3,
  ]);
  for (let n = 0; n < good.length; n++)
    assert.throws(
      () => read(frame(27, 0, good.subarray(0, n))),
      /UnexpectedEnd/,
    );
  assert.throws(() => read(frame(27, 0, good), 1, 0, 1), /ParameterNodeLimit/);
  // Nested ControlData payloads are inspected, ownership semantics are a separate gate.
  const control = Buffer.concat([
    frame(66, 0, Buffer.alloc(24)),
    frame(71, 1, w(123)),
    frame(87, 2, good),
  ]);
  assert.deepEqual(
    read(control, 1, 1),
    [0, 1, 0, 1, 0, 0, 2, 1, 0, 0, 0, 0, 0],
  );
  const table = Buffer.alloc(24);
  table.writeUInt16LE(1, 4);
  table.writeUInt16LE(1, 6);
  table.writeUInt16LE(1, 18);
  const cell = (extra) => {
    const base = Buffer.alloc(34);
    base.writeUInt16LE(1, 12);
    base.writeUInt16LE(1, 14);
    return frame(72, 2, Buffer.concat([base, extra]));
  };
  const head = [
    frame(66, 0, Buffer.alloc(24)),
    frame(71, 1, w(0x74626c20)),
    frame(77, 2, table),
  ];
  const name = set([item(0x4000, 1, u(0))], 0x21b);
  const marked = (ps) =>
    Buffer.concat([w(99), Buffer.from([255]), ps, Buffer.alloc(8)]);
  assert.deepEqual(
    read(Buffer.concat([...head, cell(marked(name))]), 1, 1),
    [0, 0, 1, 1, 0, 0, 2, 0, 1, 0, 0, 1, 8],
  );
  assert.equal(
    read(Buffer.concat([...head, cell(marked(set([])))]), 1, 1)[9],
    1,
  );
  assert.throws(
    () =>
      read(
        Buffer.concat([
          ...head,
          cell(marked(set([item(0x4000, 4, w(1))], 0x21b))),
        ]),
        1,
        1,
      ),
    /InvalidCellFieldType/,
  );
  assert.throws(
    () =>
      read(
        Buffer.concat([
          ...head,
          cell(
            marked(set([item(0x4000, 1, u(0)), item(0x4000, 1, u(0))], 0x21b)),
          ),
        ]),
        1,
        1,
      ),
    /DuplicateCellFieldName/,
  );
  assert.throws(
    () =>
      read(
        Buffer.concat([...head, cell(Buffer.from([0, 0, 0, 0, 255]))]),
        1,
        1,
      ),
    /UnexpectedEnd/,
  );
  for (const extra of [
    Buffer.concat([w(99), Buffer.alloc(9)]),
    Buffer.concat([w(99), Buffer.from([128])]),
  ])
    assert.equal(read(Buffer.concat([...head, cell(extra)]), 1, 1)[10], 1);
  const unknownCell = read(
    Buffer.concat([...head, cell(marked(unknown))]),
    1,
    1,
  );
  assert.equal(unknownCell[4], 1);
  assert.equal(unknownCell[5], unknown.length + 8);
  assert.equal(unknownCell[3], 0);
  read(mixed);
  assert.throws(
    () =>
      read(
        Buffer.concat([
          frame(27, 0, unknown),
          frame(27, 0, set([item(7, 0x8002, u(0))])),
        ]),
      ),
    /InvalidResourceReference/,
  );
  assert.throws(
    () =>
      read(
        Buffer.concat([
          frame(27, 0, unknown),
          frame(27, 0, good.subarray(0, -1)),
        ]),
      ),
    /UnexpectedEnd/,
  );
  assert.throws(() => read(Buffer.alloc(0), 1, 0, 0), /InvalidParameterLimit/);
  assert.throws(
    () =>
      read(
        Buffer.concat([
          ...head,
          cell(marked(set([item(7, 0x8002, u(2))], 0x21b))),
        ]),
        1,
        1,
      ),
    /InvalidResourceReference/,
  );
  for (let bit = 0; bit < 16; bit++) {
    assert.throws(
      () => read(frame(27, 0, set([item(7, 0x8002, u(1 ^ (1 << bit)))]))),
      /InvalidResourceReference/,
    );
    read(frame(27, 0, good));
  }
  return { invalidIds: 3, unsupportedPayloads: 1, trailingBytes: 3 };
}
