import assert from "node:assert/strict";
const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const item = (id, type, body = Buffer.alloc(0)) =>
  Buffer.concat([u16(id), u16(type), body]);
const set = (items, mode = 0, id = 12) =>
  Buffer.concat([
    u16(id),
    u16(items.length),
    ...(mode === 0 ? [u16(0xabcd)] : []),
    ...items,
  ]);
const str = (b) => Buffer.concat([u16(b.length / 2), b]);
function oracle(b, mode) {
  let p = 0;
  const report = [0, 0, 0, 0, 0, 0, 0]; // nodes, sets, arrays, ints, strings, binary IDs, nulls
  const take = (n) => {
    if (n > b.length - p) throw Error("UnexpectedEnd");
    const start = p;
    p += n;
    return b.subarray(start, p);
  };
  const word = () => take(2).readUInt16LE();
  const count = () => {
    const n = word();
    if (n > 32767) throw Error("NegativeParameterCount");
    return n;
  };
  function value(type, depth) {
    if (depth > 32) throw Error("ParameterDepthLimit");
    report[0]++;
    if (type === 0) {
      report[6]++;
      if (mode) take(4);
    } else if (type === 1) {
      report[4]++;
      take(word() * 2);
    } else if (type >= 2 && type <= 9) {
      report[3]++;
      take(4);
    } else if (type === 0x8002) {
      report[5]++;
      take(2);
    } else if (type === 0x8000) {
      report[1]++;
      word();
      const n = count();
      if (!mode) word();
      for (let i = 0; i < n; i++) {
        word();
        value(word(), depth + 1);
      }
    } else if (type === 0x8001) {
      report[2]++;
      const n = count();
      if (n) word();
      for (let i = 0; i < n; i++) value(word(), depth + 1);
    } else throw Error("UnsupportedParameterType");
  }
  value(0x8000, 0);
  return { report, consumed: p };
}
function check(call, b, mode = 0) {
  let info;
  try {
    info = oracle(b, mode);
  } catch (e) {
    assert.throws(
      () => call(21, Buffer.concat([Buffer.from([mode]), b])),
      new RegExp(e.message),
    );
    return false;
  }
  assert.deepEqual(call(21, Buffer.concat([Buffer.from([mode]), b])), b);
  return info;
}
export function parameterActual(call, section, tag) {
  const report = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let p = 0; p < section.length; ) {
    const bits = section.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = section.readUInt32LE(p);
      p += 4;
    }
    const b = section.subarray(p, p + n);
    p += n;
    if ((bits & 1023) !== tag) continue;
    const info = check(call, b);
    assert.ok(info);
    assert.equal(info.consumed, b.length);
    report[0]++;
    info.report.forEach((v, i) => {
      report[i + 1] += v;
    });
  }
  return report;
}
export function parameterEdges(call) {
  let mutations = 0,
    rejected = 0;
  for (const mode of [0, 1]) {
    const items = [];
    for (let type = 0; type <= 9; type++)
      items.push(
        item(
          type,
          type,
          type === 0
            ? mode
              ? u32(0xabcdef01)
              : Buffer.alloc(0)
            : type === 1
              ? str(Buffer.from([0, 216, 0, 0, 255, 254]))
              : u32(0xff7f80ff),
        ),
      );
    items.push(item(20, 0x8000, set([], mode)));
    items.push(
      item(
        21,
        0x8001,
        Buffer.concat([
          u16(3),
          u16(0x7788),
          u16(0),
          ...(mode ? [u32(0xdeadbeef)] : []),
          u16(1),
          str(Buffer.from([65, 0])),
          u16(0x8000),
          set([], mode),
        ]),
      ),
    );
    items.push(item(22, 0x8002, u16(65535)));
    const b = set(items, mode);
    for (let n = 0; n < b.length; n++)
      assert.equal(check(call, b.subarray(0, n), mode), false);
    check(call, b, mode);
    check(call, Buffer.concat([b, Buffer.from([255, 0, 7])]), mode);
    check(call, set([item(8, 0x8001, u16(0))], mode), mode);
    for (let p = 0; p < b.length; p++)
      for (let bit = 0; bit < 8; bit++) {
        const changed = Buffer.from(b);
        changed[p] ^= 1 << bit;
        if (!check(call, changed, mode)) rejected++;
        check(call, b, mode);
        mutations++;
      }
  }
  const many = set([
    item(
      1,
      0x8001,
      Buffer.concat([u16(32767), u16(19), Buffer.alloc(32767 * 2)]),
    ),
  ]);
  check(call, many);
  const nestedArray = Buffer.concat([
    u16(1),
    u16(22),
    u16(0x8001),
    u16(1),
    u16(33),
    u16(1),
    str(Buffer.from([65, 0])),
  ]);
  check(call, set([item(9, 0x8001, nestedArray)]));
  const longest = set([item(1, 1, str(Buffer.alloc(65535 * 2, 255)))]);
  check(call, longest);
  let nested = set([]);
  for (let i = 0; i < 32; i++) nested = set([item(1, 0x8000, nested)]);
  check(call, nested);
  assert.equal(check(call, set([item(1, 0x8000, nested)])), false);
  assert.throws(
    () => call(21, Buffer.concat([Buffer.from([0]), set([item(1, 0)])]), 1),
    /ParameterNodeLimit/,
  );
  const fieldName = str(Buffer.from([0, 216, 0, 0, 65, 0]));
  const wrap = (ps) =>
    Buffer.concat([u32(123), Buffer.from([255]), ps, Buffer.alloc(8)]);
  const ps = set([item(17, 8, u32(42)), item(0x4000, 1, fieldName)], 0, 0x21b);
  const out = call(22, wrap(ps));
  assert.deepEqual(
    out,
    Buffer.concat([
      ...[1, 6, 1, 3, 8].map(u32),
      fieldName.subarray(2),
      Buffer.alloc(8),
    ]),
  );
  assert.throws(
    () => call(22, wrap(set([item(0x4000, 4, u32(1))], 0, 0x21b))),
    /InvalidCellFieldType/,
  );
  assert.throws(
    () =>
      call(
        22,
        wrap(
          set(
            [item(0x4000, 1, fieldName), item(0x4000, 1, fieldName)],
            0,
            0x21b,
          ),
        ),
      ),
    /DuplicateCellFieldName/,
  );
  const empty = call(22, wrap(set([item(0x4000, 1, u16(0))], 0, 0x21b)));
  assert.equal(empty.readUInt32LE(), 1);
  assert.equal(empty.readUInt32LE(4), 0);
  const unknown = call(22, wrap(set([item(0x4000, 1, fieldName)], 0, 0x777)));
  assert.equal(unknown.readUInt32LE(), 0);
  assert.equal(unknown.readUInt32LE(8), 0);
  const child = call(
    22,
    wrap(
      set(
        [item(1, 0x8000, set([item(0x4000, 1, fieldName)], 0, 0x21b))],
        0,
        0x21b,
      ),
    ),
  );
  assert.equal(child.readUInt32LE(), 0);
  assert.equal(call(22, Buffer.alloc(5)).length, 0);
  assert.throws(
    () => call(22, Buffer.from([0, 0, 0, 0, 255])),
    /UnexpectedEnd/,
  );
  call(22, wrap(ps));
  return {
    mutations,
    rejected,
    recoveries: mutations,
    maxArrayItems: 32767,
    maxStringUnits: 65535,
  };
}
