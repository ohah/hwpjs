import assert from "node:assert/strict";
const version = 0x05010001;
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const frame = (tag, b) =>
  Buffer.concat([word(tag | (tag === 17 ? 0 : 1024) | (b.length << 20)), b]);
function records(bytes) {
  let p = 0;
  const rows = [];
  while (p < bytes.length) {
    const offset = p,
      bits = bytes.readUInt32LE(p);
    p += 4;
    let size = bits >>> 20;
    if (size === 4095) {
      size = bytes.readUInt32LE(p);
      p += 4;
    }
    rows.push({ offset, tag: bits & 1023, b: bytes.subarray(p, p + size) });
    p += size;
  }
  assert.equal(p, bytes.length);
  return rows;
}
// Independent test oracle: direct payload offsets, no production ID resolver.
function oracle(v, bytes) {
  const rows = records(bytes),
    count = (tag) => rows.filter((r) => r.tag === tag).length;
  const maps = rows.filter((r) => r.tag === 17);
  assert.equal(maps.length, 1);
  const m = maps[0].b;
  assert.equal(m.readInt32LE(0), count(18));
  const fonts = Array.from({ length: 7 }, (_, i) => m.readInt32LE(4 + i * 4));
  assert.equal(
    fonts.reduce((a, b) => a + b, 0),
    count(19),
  );
  for (const [i, tag] of [
    [8, 20],
    [9, 21],
    [10, 22],
    [11, 23],
    [12, 24],
    [13, 25],
    [14, 26],
  ])
    assert.equal(m.readInt32LE(i * 4), count(tag));
  const out = [
    0, 0, 0, 0, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
  ];
  function check(r, field, slot, id, n, base = 0, absent = -1) {
    if (id === absent) return;
    out[0]++;
    if (id < base || id - base >= n) {
      out[1]++;
      if (out[4] === 0xffffffff)
        out.splice(4, 5, r.offset, r.tag, field, slot, id);
    }
  }
  for (const r of rows) {
    const b = r.b;
    switch (r.tag) {
      case 21:
        for (let i = 0; i < 7; i++)
          check(r, 0, i, b.readUInt16LE(i * 2), fonts[i]);
        if (v >= 0x05000201 && b.length > 68)
          check(r, 1, 0, b.readUInt16LE(68), count(20), 1, 0);
        break;
      case 23: {
        let p = 0;
        const level = (i) => {
          check(r, 2, i, b.readUInt32LE(p + 8), count(21), 0, 0xffffffff);
          p += 14 + b.readUInt16LE(p + 12) * 2;
        };
        for (let i = 0; i < 7; i++) level(i);
        p += 2;
        if (v >= 0x05000205 && p < b.length) p += 28;
        if (v >= 0x05010000 && p < b.length)
          for (let i = 7; i < 10; i++) level(i);
        break;
      }
      case 24:
        check(r, 3, 0, b.readUInt32LE(8), count(21), 0, 0xffffffff);
        if (b.length > 14) {
          const enabled = b.readInt32LE(14);
          if (enabled === 1) check(r, 4, 0, b.readUInt16LE(21), count(18), 1);
          else if (enabled !== 0) out[2]++;
        }
        break;
      case 20: {
        const flags = b.readUInt32LE(32);
        if (flags & 0xfffffff8) {
          out[2]++;
          break;
        }
        let p = 36;
        if (flags & 1) p += 12;
        if (flags & 4) {
          const n = b.readUInt32LE(p + 17);
          p += 21 + n * (n > 2 ? 8 : 4);
        }
        if (flags & 2) check(r, 5, 0, b.readUInt16LE(p + 4), count(18), 1);
        break;
      }
      case 25: {
        check(r, 6, 0, b.readUInt16LE(28), count(22));
        check(r, 7, 0, b.readUInt16LE(32), count(20), 1, 0);
        const kind = (b.readUInt32LE(0) >>> 23) & 3,
          id = b.readUInt16LE(30);
        if (kind === 1 && id === 0) out[2]++;
        else if (kind === 1 || kind === 2) check(r, 8, 0, id, count(23), 1);
        else if (kind === 3) check(r, 9, 0, id, count(24), 1);
        break;
      }
      case 26: {
        let p = 2 + b.readUInt16LE(0) * 2;
        p += 2 + b.readUInt16LE(p) * 2;
        const kind = b[p] & 7;
        if (kind === 0) {
          check(r, 10, 0, b[p + 1], count(26));
          check(r, 11, 0, b.readUInt16LE(p + 4), count(25));
        }
        if (kind === 0 || kind === 1)
          check(r, 12, 0, b.readUInt16LE(p + 6), count(21));
        else out[2]++;
        break;
      }
      default:
        if ((r.tag < 16 || r.tag > 26) && r.tag !== 30 && r.tag !== 31)
          out[3]++;
    }
  }
  return out;
}
export function referenceActual(call, v, bytes) {
  const expected = oracle(v, bytes),
    out = call(7, Buffer.concat([word(v), bytes]));
  assert.deepEqual(out, Buffer.concat(expected.map(word)));
  return expected.slice(0, 4);
}
function fixture() {
  const data = new Map();
  const map = Buffer.alloc(60);
  for (let i = 0; i < 15; i++) map.writeInt32LE(1, i * 4);
  data.set(17, [map]);
  data.set(18, [Buffer.from([2, 0, 255, 255])]);
  data.set(
    19,
    Array.from({ length: 7 }, () => Buffer.alloc(3)),
  );
  const border = Buffer.alloc(46);
  border.writeUInt32LE(2, 32);
  border[36] = 5;
  border.writeUInt16LE(1, 40);
  data.set(20, [border]);
  data.set(21, [Buffer.alloc(74)]);
  data.set(22, [Buffer.alloc(8)]);
  data.set(23, [Buffer.alloc(182)]);
  const bullet = Buffer.alloc(25);
  bullet.writeUInt32LE(1, 14);
  bullet.writeUInt16LE(1, 21);
  data.set(24, [bullet]);
  const para = Buffer.alloc(58);
  para.writeUInt32LE(2 << 23);
  para.writeUInt16LE(1, 30);
  para.writeUInt16LE(1, 32);
  data.set(25, [para]);
  data.set(26, [Buffer.alloc(12)]);
  return data;
}
const encode = (data) =>
  Buffer.concat(
    [...data].flatMap(([tag, rows]) => rows.map((b) => frame(tag, b))),
  );
export function referenceEdges(call) {
  const data = fixture(),
    good = encode(data);
  assert.equal(referenceActual(call, version, good)[1], 0);
  const unknownFill = Buffer.from(good);
  const fillRecord = records(unknownFill).find((r) => r.tag === 20);
  fillRecord.b.writeUInt32LE(0x80000002, 32);
  assert.equal(referenceActual(call, version, unknownFill)[2], 1);
  let cases = 0;
  // Every active ID field: first/last/out-of-range/null/sentinel candidates.
  const fields = [
    ...Array.from({ length: 7 }, (_, i) => [21, i * 2, 2]),
    [21, 68, 2],
    ...Array.from({ length: 7 }, (_, i) => [23, i * 14 + 8, 4]),
    ...Array.from({ length: 3 }, (_, i) => [23, 128 + i * 14 + 8, 4]),
    [24, 8, 4],
    [24, 21, 2],
    [20, 40, 2],
    [25, 28, 2],
    [25, 30, 2],
    [25, 32, 2],
    [26, 5, 1],
    [26, 8, 2],
    [26, 10, 2],
  ];
  for (const [tag, offset, size] of fields) {
    const b = data.get(tag)[0],
      old = Buffer.from(b);
    for (const value of [
      0,
      1,
      2,
      size === 4 ? 0xffffffff : size === 2 ? 65535 : 255,
    ]) {
      b.writeUIntLE(value, offset, size);
      referenceActual(call, version, encode(data));
      cases++;
      old.copy(b);
      assert.equal(referenceActual(call, version, encode(data))[1], 0);
    }
  }
  for (let i = 0; i < 15; i++)
    for (const value of [-1, 0, 2]) {
      const broken = Buffer.from(good);
      broken.writeInt32LE(value, 4 + i * 4);
      assert.throws(
        () => call(7, Buffer.concat([word(version), broken])),
        value < 0 ? /NegativeMappingCount/ : /ResourceCountMismatch/,
      );
    }
  assert.throws(() => call(7, word(version)), /MissingIdMappings/);
  assert.throws(
    () =>
      call(7, Buffer.concat([word(version), good, frame(17, data.get(17)[0])])),
    /DuplicateIdMappings/,
  );
  assert.throws(
    () => call(7, Buffer.concat([word(version), good]), 1),
    /LimitExceeded/,
  );
  const para = data.get(25)[0];
  para.writeUInt32LE(1 << 23);
  para.writeUInt16LE(0, 30);
  assert.equal(referenceActual(call, version, encode(data))[2], 1);
  para.writeUInt32LE(0);
  para.writeUInt16LE(65535, 30);
  assert.equal(referenceActual(call, version, encode(data))[1], 0);
  const bullet = data.get(24)[0];
  bullet.writeUInt32LE(0, 14);
  bullet.writeUInt16LE(65535, 21);
  assert.equal(referenceActual(call, version, encode(data))[1], 0);
  bullet.writeUInt32LE(2, 14);
  assert.equal(referenceActual(call, version, encode(data))[2], 1);
  bullet.writeUInt32LE(0, 14);
  const style = data.get(26)[0];
  style[4] = 1;
  style[5] = 255;
  style.writeUInt16LE(65535, 8);
  assert.equal(referenceActual(call, version, encode(data))[1], 0);
  style[4] = 7;
  assert.equal(referenceActual(call, version, encode(data))[2], 1);
  assert.equal(
    referenceActual(
      call,
      version,
      Buffer.concat([good, frame(1023, Buffer.from([255]))]),
    )[3],
    1,
  );
  assert.deepEqual(
    referenceActual(
      call,
      version,
      Buffer.concat([good.subarray(64), good.subarray(0, 64)]),
    ),
    referenceActual(call, version, good),
  );
  return { idBoundaryCases: cases };
}
