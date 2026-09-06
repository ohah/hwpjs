import assert from "node:assert/strict";
const word = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const version = 0x05000307;
const frame = (tag, level, b = Buffer.alloc(0)) =>
  Buffer.concat([word(tag | (level << 10) | (b.length << 20)), b]);
const input = (v, counts, bytes) =>
  Buffer.concat([word(v), ...counts.map(word), bytes]);
export function treeActual(call, v, counts, bytes) {
  const records = [];
  for (let p = 0; p < bytes.length; ) {
    const bits = bytes.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    records.push({ level: (bits >>> 10) & 1023, tag: bits & 1023 });
    p += n;
    assert.ok(p <= bytes.length);
  }
  const expected = [];
  for (let i = 0; i < records.length; i++) {
    const level = records[i].level;
    let parent = i - 1;
    while (parent >= 0 && records[parent].level >= level) parent--;
    if (level) assert.ok(parent >= 0 && records[parent].level === level - 1);
    else assert.equal(parent, -1);
    let end = i + 1;
    while (end < records.length && records[end].level > level) end++;
    expected.push(word(parent), word(end));
  }
  const out = call(10, input(v, counts, bytes));
  assert.deepEqual(out.subarray(24), Buffer.concat(expected));
  return Array.from({ length: 6 }, (_, i) => out.readUInt32LE(i * 4));
}
export function treeEdges(call) {
  const counts = [1, 1, 1],
    h = Buffer.alloc(24);
  const good = Buffer.concat([
    frame(66, 0, h),
    frame(71, 1, Buffer.alloc(4)),
    frame(72, 2, Buffer.alloc(8)),
    frame(66, 2, h),
  ]);
  assert.deepEqual(treeActual(call, version, counts, good), [2, 0, 2, 1, 1, 0]);
  const inner = Buffer.from(h);
  inner.writeUInt32LE(1);
  const nested = Buffer.concat([
    frame(66, 0, h),
    frame(71, 1, Buffer.alloc(4)),
    frame(66, 2, inner),
    frame(67, 3, Buffer.from([13, 0])),
  ]);
  assert.deepEqual(
    treeActual(call, version, counts, nested),
    [2, 1, 1, 1, 0, 0],
  );
  for (const tag of [68, 69, 70]) {
    assert.throws(
      () =>
        call(
          10,
          input(
            version,
            counts,
            Buffer.concat([frame(66, 0, h), frame(tag, 1), frame(tag, 1)]),
          ),
        ),
      /DuplicateParagraphRecord/,
    );
  }
  for (const offset of [8, 10]) {
    const bad = Buffer.from(h);
    bad[offset] = 1;
    assert.throws(
      () => call(10, input(version, counts, frame(66, 0, bad))),
      /InvalidResourceReference/,
    );
  }
  assert.throws(
    () =>
      call(
        10,
        input(
          version,
          counts,
          Buffer.concat([frame(66, 0, inner), frame(67, 1)]),
        ),
      ),
    /ParagraphTextCountMismatch/,
  );
  const declared = Buffer.from(h);
  declared.writeUInt16LE(1, 12);
  assert.throws(
    () => call(10, input(version, counts, frame(66, 0, declared))),
    /ParagraphMetadataCountMismatch/,
  );
  for (const [bytes, error] of [
    [frame(1023, 1), /InvalidRecordHierarchy/],
    [Buffer.concat([frame(1023, 0), frame(1023, 2)]), /InvalidRecordHierarchy/],
    [frame(67, 0), /OrphanParagraphRecord/],
    [
      Buffer.concat([frame(66, 0, h), frame(67, 1), frame(67, 1)]),
      /DuplicateParagraphRecord/,
    ],
    [
      Buffer.concat([frame(66, 0, h), frame(1023, 1), frame(67, 2)]),
      /OrphanParagraphRecord/,
    ],
  ]) {
    assert.throws(() => call(10, input(version, counts, bytes)), error);
    treeActual(call, version, counts, good);
  }
  assert.throws(
    () => call(10, input(version, [0, 0, 0], good)),
    /InvalidResourceReference/,
  );
  assert.throws(
    () => call(10, input(version, counts, good), 3),
    /LimitExceeded/,
  );
  treeActual(call, version, counts, Buffer.alloc(0));
  treeActual(
    call,
    version,
    counts,
    Buffer.concat(Array.from({ length: 1024 }, (_, i) => frame(1023, i))),
  );
  let mutations = 0;
  const levels = [0, 1, 2, 2, 1, 0, 1, 0];
  for (let pos = 0; pos < levels.length; pos++)
    for (let bit = 0; bit < 10; bit++) {
      const changed = [...levels];
      changed[pos] ^= 1 << bit;
      const bytes = Buffer.concat(changed.map((l) => frame(1023, l)));
      const valid =
        changed[0] === 0 &&
        changed.every((l, i) => i === 0 || l <= changed[i - 1] + 1);
      if (valid) treeActual(call, version, counts, bytes);
      else
        assert.throws(
          () => call(10, input(version, counts, bytes)),
          /InvalidRecordHierarchy/,
        );
      treeActual(call, version, counts, good);
      mutations++;
    }
  return { mutations, recoveries: mutations };
}
