import assert from "node:assert/strict";
import { checkBody } from "./body.mjs";
const word = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const frame = (tag, b) =>
  Buffer.concat([word(tag | 1024 | (b.length << 20)), b]);
const version = 0x05010001;
const input = (v, shapes, header, records) =>
  Buffer.concat([
    word(v),
    word(shapes),
    word(header.length),
    header,
    ...records,
  ]);

// Independent test-only paragraph association. Product hierarchy assembly is separate.
export function metadataActual(call, v, bytes, shapes) {
  const parents = [],
    paragraphs = [];
  const totals = { paragraphs: 0, runs: 0, lines: 0, ranges: 0 };
  let p = 0;
  while (p < bytes.length) {
    const start = p,
      bits = bytes.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    const level = (bits >>> 10) & 1023,
      tag = bits & 1023;
    const payload = bytes.subarray(p, p + n);
    p += n;
    assert.ok(p <= bytes.length);
    parents.length = Math.min(parents.length, level + 1);
    parents[level] = undefined;
    if (tag === 66) {
      const h = { header: payload, records: [] };
      parents[level] = h;
      paragraphs.push(h);
    } else if (tag >= 68 && tag <= 70) {
      assert.ok(parents[level - 1], `orphan metadata at ${start}`);
      parents[level - 1].records.push(bytes.subarray(start, p));
      totals[["runs", "lines", "ranges"][tag - 68]] +=
        n / [8, 36, 12][tag - 68];
    }
  }
  for (const h of paragraphs) {
    assert.deepEqual(
      call(9, input(v, shapes, h.header, h.records)),
      Buffer.alloc(0),
    );
    totals.paragraphs++;
  }
  return totals;
}

export function metadataEdges(call) {
  let mutations = 0;
  for (const [tag, width] of [
    [68, 8],
    [69, 36],
    [70, 12],
  ]) {
    const original = Buffer.from(
      Array.from({ length: width * 2 }, (_, i) => (i * 73 + 129) & 255),
    );
    for (let n = 0; n <= original.length; n++) {
      const record = frame(tag, original.subarray(0, n));
      if (n % width)
        assert.throws(
          () => call(8, Buffer.concat([word(version), record])),
          /InvalidRecordArraySize/,
        );
      else checkBody(call, version, record);
    }
    for (let pos = 0; pos < original.length; pos++)
      for (let bit = 0; bit < 8; bit++) {
        const changed = Buffer.from(original);
        changed[pos] ^= 1 << bit;
        checkBody(call, version, frame(tag, changed));
        checkBody(call, version, frame(tag, original));
        mutations++;
      }
  }
  const h = Buffer.alloc(24);
  h.writeUInt32LE(10);
  h.writeUInt16LE(2, 12);
  h.writeUInt16LE(2, 14);
  h.writeUInt16LE(1, 16);
  const runs = Buffer.concat([word(0), word(0), word(5), word(1)]);
  const lines = Buffer.alloc(36, 255);
  lines.writeUInt32LE(0);
  const ranges = Buffer.concat([
    word(0),
    word(8),
    word(0xffffffff),
    word(2),
    word(10),
    word(0x80123456),
  ]);
  const records = () => [frame(68, runs), frame(69, lines), frame(70, ranges)];
  const good = () =>
    assert.deepEqual(call(9, input(version, 2, h, records())), Buffer.alloc(0));
  good();
  let boundaries = 0;
  for (const [buffer, offset, value, error] of [
    [runs, 0, 1, /InvalidCharRunPosition/],
    [runs, 8, 11, /InvalidCharRunPosition/],
    [runs, 12, 2, /InvalidResourceReference/],
    [runs, 12, 0xffffffff, /InvalidResourceReference/],
    [lines, 0, 11, /InvalidLinePosition/],
    [ranges, 12, 11, /InvalidRangePosition/],
    [ranges, 16, 11, /InvalidRangePosition/],
  ]) {
    const old = buffer.readUInt32LE(offset);
    buffer.writeUInt32LE(value, offset);
    assert.throws(() => call(9, input(version, 2, h, records())), error);
    buffer.writeUInt32LE(old, offset);
    good();
    boundaries++;
  }
  for (let i = 0; i < 3; i++) {
    assert.throws(
      () =>
        call(
          9,
          input(
            version,
            2,
            h,
            records().filter((_, j) => i !== j),
          ),
        ),
      /ParagraphMetadataCountMismatch/,
    );
    assert.throws(
      () => call(9, input(version, 2, h, [...records(), records()[i]])),
      /DuplicateMetadataRecord/,
    );
    good();
    boundaries += 2;
  }
  // Equal positions/endpoints are preserved; do not invent strict ordering or range kind rules.
  runs.writeUInt32LE(0, 8);
  ranges.writeUInt32LE(2, 16);
  good();
  const empty = input(version, 0, Buffer.alloc(24), []);
  assert.deepEqual(call(9, empty), Buffer.alloc(0));
  assert.throws(
    () => call(9, input(version, 2, h, records()), 2),
    /LimitExceeded/,
  );
  good();
  assert.equal(mutations, 896);
  return { mutations, recoveries: mutations, boundaries };
}
