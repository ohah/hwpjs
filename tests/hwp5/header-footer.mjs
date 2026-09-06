import assert from "node:assert/strict";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const frame = (tag, level, b) =>
  Buffer.concat([w((tag | (level << 10) | (b.length << 20)) >>> 0), b]);
const run = (call, b, mode = 1) =>
  call(31, Buffer.concat([w(0x05000107), Buffer.from([mode]), b]));
export function headerFooterActual(call, version, b) {
  let offset = 0;
  const stack = [],
    controls = [],
    areas = [];
  let owner = null,
    paragraphs = 0,
    extra = 0,
    reserved = 0;
  while (offset < b.length) {
    const x = b.readUInt32LE(offset);
    offset += 4;
    let len = x >>> 20;
    if (len === 4095) {
      len = b.readUInt32LE(offset);
      offset += 4;
    }
    const tag = x & 1023,
      level = (x >>> 10) & 1023,
      p = b.subarray(offset, offset + len);
    offset += len;
    stack.length = level;
    owner = stack[level - 1] ?? null;
    let here = null;
    if (tag === 71 && [0x68656164, 0x666f6f74].includes(p.readUInt32LE(0))) {
      here = p.readUInt32LE(0);
      const tail = p.subarray(8);
      controls.push(Buffer.concat([p.subarray(0, 8), w(tail.length), tail]));
      extra += tail.length;
      reserved += (p.readUInt32LE(4) & 3) === 3;
    }
    if (tag === 72 && owner !== null) {
      const a = p.subarray(8),
        tail = a.subarray(10);
      paragraphs += p.readUInt16LE(0);
      areas.push(Buffer.concat([a.subarray(0, 10), w(tail.length), tail]));
      extra += tail.length;
    }
    stack.push(here);
  }
  const stats = [controls.length, areas.length, paragraphs, reserved, extra];
  const out = call(31, Buffer.concat([w(version), Buffer.from([1]), b]));
  assert.deepEqual(
    out,
    Buffer.concat([...stats.map(w), ...controls, ...areas]),
  );
  return stats;
}
export function headerFooterEdges(call) {
  let rejected = 0;
  const attrs = Buffer.concat([w(0x80000003), Buffer.from([9])]);
  const area = Buffer.concat([
    w(0xffffffff),
    w(0x80000000),
    Buffer.from([0x81, 0xfe, 7]),
  ]);
  const build = (p = attrs, a = area, mode = 1, id = 0x68656164) =>
    Buffer.concat([
      frame(71, 0, Buffer.concat([w(id), p])),
      frame(72, 1, Buffer.concat([Buffer.alloc(mode === 1 ? 8 : 6), a])),
    ]);
  for (const mode of [0, 1]) {
    const good = build(attrs, area, mode),
      out = run(call, good, mode);
    assert.deepEqual(
      out,
      Buffer.concat([
        ...[1, 1, 0, 1, 2].map(w),
        w(0x68656164),
        attrs.subarray(0, 4),
        w(1),
        attrs.subarray(4),
        area.subarray(0, 10),
        w(1),
        area.subarray(10),
      ]),
    );
    for (let n = 0; n < 4; n++) {
      assert.throws(
        () => run(call, build(attrs.subarray(0, n), area, mode), mode),
        /UnexpectedEnd/,
      );
      rejected++;
      assert.deepEqual(run(call, good, mode), out);
    }
    for (let n = 0; n < 10; n++) {
      assert.throws(
        () => run(call, build(attrs, area.subarray(0, n), mode), mode),
        /UnexpectedEnd/,
      );
      rejected++;
      assert.deepEqual(run(call, good, mode), out);
    }
    assert.equal(
      run(call, build(attrs, area, mode, 0x666f6f74), mode).readUInt32LE(0),
      1,
    );
  }
  assert.throws(
    () => run(call, frame(71, 0, Buffer.concat([w(0x68656164), attrs]))),
    /MissingHeaderFooterList/,
  );
  rejected++;
  // A same-level list is not owned by this control.
  assert.throws(
    () =>
      run(
        call,
        Buffer.concat([
          frame(71, 0, Buffer.concat([w(0x68656164), attrs])),
          frame(72, 0, Buffer.alloc(18)),
        ]),
      ),
    /OrphanListHeader/,
  );
  rejected++;
  return { rejected };
}
