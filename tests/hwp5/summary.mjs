import assert from "node:assert/strict";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
export function summaryFixture(rows) {
  const header = Buffer.alloc(48);
  header.writeUInt16LE(0xfffe);
  Buffer.from("60b6a29f6110d411b4c6006097c09d8c", "hex").copy(header, 28);
  header.writeUInt32LE(1, 24);
  header.writeUInt32LE(48, 44);
  let offset = 8 + rows.length * 8;
  const table = [];
  for (const [id, b] of rows) {
    table.push(w(id), w(offset));
    offset += b.length;
  }
  return Buffer.concat([
    header,
    w(offset),
    w(rows.length),
    ...table,
    ...rows.map((r) => r[1]),
  ]);
}
export function summaryActual(call, b) {
  const start = b.readUInt32LE(44),
    size = b.readUInt32LE(start),
    count = b.readUInt32LE(start + 4);
  const stats = [
      count,
      0,
      0,
      0,
      0,
      0,
      b.length - start - size + (start - 48),
      0,
    ],
    parts = [];
  for (let i = 0; i < count; i++) {
    const id = b.readUInt32LE(start + 8 + i * 8),
      offset = b.readUInt32LE(start + 12 + i * 8);
    const end = i + 1 < count ? b.readUInt32LE(start + 20 + i * 8) : size;
    const raw = b.subarray(start + offset, start + end);
    if (i === 0) stats[6] += offset - 8 - count * 8;
    if (![0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 20, 21].includes(id))
      stats[7]++;
    if (id === 0) stats[4]++;
    else {
      const type = raw.readUInt32LE(0);
      let consumed = raw.length;
      if (type === 31) {
        stats[1]++;
        consumed = 8 + Math.ceil((raw.readUInt32LE(4) * 2) / 4) * 4;
      } else if (type === 64) {
        stats[2]++;
        consumed = 12;
      } else if (type === 3) {
        stats[3]++;
        consumed = 8;
      } else stats[5]++;
      stats[6] += raw.length - consumed;
    }
    parts.push(w(id), w(offset), w(raw.length), raw);
  }
  assert.deepEqual(
    call(27, b, count),
    Buffer.concat([...stats.map(w), ...parts]),
  );
  return stats;
}
export function summaryEdges(call) {
  const string = Buffer.concat([w(31), w(2), Buffer.from("A\0", "utf16le")]);
  const good = summaryFixture([
    [2, string],
    [14, Buffer.concat([w(3), w(0xffffffff)])],
    [12, Buffer.concat([w(64), Buffer.alloc(8, 255)])],
    [0, Buffer.from([1, 0, 0, 0, 1])],
  ]);
  let rejected = 0;
  const reject = (b, error) => {
    assert.throws(() => call(27, b), error);
    summaryActual(call, good);
    rejected++;
  };
  summaryActual(call, good);
  for (let n = 0; n < good.length; n++)
    reject(
      good.subarray(0, n),
      /UnexpectedEnd|InvalidSummaryOffset|InvalidSummarySize/,
    );
  for (const [at, value, error] of [
    [0, 0, /InvalidSummaryByteOrder/],
    [2, 2, /UnsupportedSummaryVersion/],
    [24, 2, /UnsupportedSummaryLayout/],
    [44, 0, /InvalidSummaryOffset/],
    [48, 7, /InvalidSummarySize/],
    [52, 0xffffffff, /LimitExceeded/],
    [60, 1, /InvalidSummaryOffset/],
    [68, 40, /InvalidSummaryOffset/],
    [68, 41, /InvalidSummaryOffset/],
    [64, 2, /DuplicateSummaryProperty/],
  ]) {
    const b = Buffer.from(good);
    if (at === 0 || at === 2) b.writeUInt16LE(value, at);
    else b.writeUInt32LE(value, at);
    reject(b, error);
  }
  const fmt = Buffer.from(good);
  fmt[28] ^= 1;
  reject(fmt, /UnsupportedSummaryFormat/);
  const huge = Buffer.from(good);
  huge.writeUInt32LE(0xffffffff, 92);
  reject(huge, /UnexpectedEnd/);
  const term = Buffer.from(good);
  term[98] = 1;
  reject(term, /InvalidSummaryTerminator/);
  reject(
    summaryFixture([[2, Buffer.concat([w(3), w(1)])]]),
    /InvalidSummaryPropertyType/,
  );
  reject(
    summaryFixture([
      [2, Buffer.concat([w(31), w(1), Buffer.from([0, 0, 1, 0])])],
    ]),
    /InvalidSummaryPadding/,
  );
  for (const raw of [
    Buffer.concat([w(31), w(0)]),
    Buffer.concat([w(31), w(1), Buffer.alloc(4)]),
  ])
    summaryActual(call, summaryFixture([[2, raw]]));
  summaryActual(
    call,
    summaryFixture([
      [999, Buffer.concat([w(3), w(5)])],
      [2, Buffer.concat([w(30), w(0)])],
    ]),
  );
  summaryActual(call, Buffer.concat([good, Buffer.from([1, 2, 3])]));
  assert.throws(() => call(27, good, 3), /LimitExceeded/);
  return { rejected, recoveries: rejected };
}
