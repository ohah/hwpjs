import assert from "node:assert/strict";
import { checkBody } from "./body.mjs";
import { sectionXml } from "./fixture-xml.mjs";
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const frame = (tag, level, b = Buffer.alloc(0)) =>
  Buffer.concat([
    word(tag | (level << 10) | ((b.length >= 4095 ? 4095 : b.length) << 20)),
    ...(b.length >= 4095 ? [word(b.length)] : []),
    b,
  ]);
const version = 0x05010001;
function nodes(bytes) {
  const out = [];
  for (let p = 0; p < bytes.length; ) {
    const bits = bytes.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(p);
      p += 4;
    }
    const level = (bits >>> 10) & 1023;
    let parent = out.length - 1;
    while (parent >= 0 && out[parent].level >= level) parent--;
    out.push({
      tag: bits & 1023,
      level,
      parent,
      raw: bytes.subarray(p, p + n),
    });
    p += n;
  }
  return out;
}
export function tablesActual(call, v, borders, bytes) {
  const records = nodes(bytes),
    expected = [],
    report = [0, 0, 0, 0];
  for (let i = 0; i < records.length; i++) {
    const n = records[i];
    if (n.tag !== 71 || n.raw.readUInt32LE() !== 0x74626c20) continue;
    report[0]++;
    const marker = records.findIndex((r) => r.parent === i && r.tag === 77);
    assert.ok(marker >= 0);
    const table = records[marker].raw;
    report[3] += table.readUInt16LE(20 + table.readUInt16LE(4) * 2);
    records.forEach((r, index) => {
      if (r.parent !== i || r.tag !== 72) return;
      const kind = index < marker ? 0 : 1;
      report[kind ? 1 : 2]++;
      const raw = r.raw.subarray(8);
      expected.push(word(index), word(kind), word(raw.length), raw);
    });
  }
  const out = call(17, Buffer.concat([word(v), word(borders), bytes]));
  assert.deepEqual(out, Buffer.concat([...report.map(word), ...expected]));
  return report;
}
export function tableEdges(call) {
  for (const [rows, zones] of [
    [65535, 0],
    [0, 65535],
  ]) {
    const large = Buffer.alloc(22 + rows * 2 + zones * 10);
    large.writeUInt16LE(rows, 4);
    large.writeUInt16LE(zones, 20 + rows * 2);
    checkBody(call, version, frame(77, 0, large));
    assert.throws(
      () =>
        call(
          8,
          Buffer.concat([word(version), frame(77, 0, large.subarray(0, -1))]),
        ),
      /UnexpectedEnd/,
    );
  }
  const t = Buffer.alloc(36);
  t.writeUInt16LE(2, 4);
  t.writeUInt16LE(3, 6);
  t.writeUInt16LE(1, 18);
  t.writeUInt16LE(2, 20);
  t.writeUInt16LE(1, 24); // one zone
  t.writeUInt16LE(1, 30);
  t.writeUInt16LE(2, 32);
  for (const [v, b] of [
    [0x050000ff, t.subarray(0, 24)],
    [0x05000100, t],
  ]) {
    for (let n = 0; n < b.length; n++)
      assert.throws(
        () => call(8, Buffer.concat([word(v), frame(77, 0, b.subarray(0, n))])),
        /UnexpectedEnd/,
      );
    checkBody(call, v, frame(77, 0, b));
    checkBody(
      call,
      v,
      frame(77, 0, Buffer.concat([b, Buffer.from([255, 0, 128])])),
    );
  }
  let rejected = 0;
  for (let p = 0; p < t.length; p++)
    for (let bit = 0; bit < 8; bit++) {
      const b = Buffer.from(t);
      b[p] ^= 1 << bit;
      const base = 22 + b.readUInt16LE(4) * 2;
      const valid =
        base <= b.length && base + b.readUInt16LE(base - 2) * 10 <= b.length;
      if (valid) checkBody(call, version, frame(77, 0, b));
      else {
        assert.throws(
          () => call(8, Buffer.concat([word(version), frame(77, 0, b)])),
          /UnexpectedEnd/,
        );
        rejected++;
      }
      checkBody(call, version, frame(77, 0, t));
    }
  const head = frame(66, 0, Buffer.alloc(24)),
    ctrl = frame(71, 1, word(0x74626c20));
  const small = Buffer.alloc(24);
  small.writeUInt16LE(1, 4);
  small.writeUInt16LE(1, 6);
  small.writeUInt16LE(1, 18);
  const cell = Buffer.alloc(34);
  cell.writeUInt16LE(1, 12);
  cell.writeUInt16LE(1, 14);
  const caption = Buffer.alloc(22);
  const run = (parts) =>
    call(17, Buffer.concat([word(version), word(1), ...parts]));
  const good = [
    head,
    ctrl,
    frame(72, 2, caption),
    frame(77, 2, small),
    frame(72, 2, cell),
  ];
  assert.deepEqual(
    Array.from({ length: 4 }, (_, i) => run(good).readUInt32LE(i * 4)),
    [1, 1, 1, 0],
  );
  assert.throws(() => run([head, ctrl]), /MissingTableRecord/);
  assert.throws(() => run([frame(77, 0, small)]), /OrphanTableRecord/);
  assert.throws(
    () => run([...good, frame(77, 2, small)]),
    /DuplicateTableRecord/,
  );
  assert.throws(() => run(good.slice(0, -1)), /TableCellCountMismatch/);
  for (const [offset, value] of [
    [8, 1],
    [10, 1],
    [12, 0],
    [14, 0],
    [12, 65535],
    [14, 65535],
  ]) {
    const b = Buffer.from(cell);
    b.writeUInt16LE(value, offset);
    assert.throws(
      () => run([...good.slice(0, -1), frame(72, 2, b)]),
      /InvalidCellSpan/,
    );
    run(good);
  }
  for (let n = 8; n < 34; n++)
    assert.throws(
      () => run([...good.slice(0, -1), frame(72, 2, cell.subarray(0, n))]),
      /UnexpectedEnd/,
    );
  for (let n = 8; n < 22; n++)
    assert.throws(
      () =>
        run([
          head,
          ctrl,
          frame(72, 2, caption.subarray(0, n)),
          ...good.slice(3),
        ]),
      /UnexpectedEnd/,
    );
  for (const offset of [4, 6]) {
    const b = Buffer.from(small);
    b.writeUInt16LE(0, offset);
    // A zero row count shifts the zone count; remaining bytes are preserved extra.
    assert.throws(
      () => run([head, ctrl, frame(77, 2, b), frame(72, 2, cell)]),
      /InvalidTableDimensions/,
    );
  }
  const badTable = Buffer.from(small);
  badTable.writeUInt16LE(2, 20);
  assert.throws(
    () => run([head, ctrl, frame(77, 2, badTable), frame(72, 2, cell)]),
    /InvalidResourceReference/,
  );
  const badCell = Buffer.from(cell);
  badCell.writeUInt16LE(2, 32);
  assert.throws(
    () => run([...good.slice(0, -1), frame(72, 2, badCell)]),
    /InvalidResourceReference/,
  );
  const zoned = Buffer.concat([small, Buffer.alloc(10)]);
  zoned.writeUInt16LE(1, 22);
  for (const offset of [24, 26, 28, 30]) {
    const b = Buffer.from(zoned);
    b.writeUInt16LE(1, offset);
    assert.throws(
      () => run([head, ctrl, frame(77, 2, b), frame(72, 2, cell)]),
      /InvalidTableZone/,
    );
  }
  zoned.writeUInt16LE(2, 32);
  assert.throws(
    () => run([head, ctrl, frame(77, 2, zoned), frame(72, 2, cell)]),
    /InvalidResourceReference/,
  );
  assert.throws(
    () => run([frame(71, 0, word(0x74626c20)), frame(77, 1, small)]),
    /OrphanTableControl/,
  );
  // Equal-sized tails must not decide caption/cell type.
  const longCaption = Buffer.alloc(47);
  const withUnknown = [
    head,
    ctrl,
    frame(72, 2, longCaption),
    frame(900, 2),
    frame(77, 2, small),
    frame(901, 2),
    frame(72, 2, cell),
  ];
  assert.deepEqual(
    Array.from({ length: 4 }, (_, i) => run(withUnknown).readUInt32LE(i * 4)),
    [1, 1, 1, 0],
  );
  // Nested table records belong to the nested control, not the outer marker scan.
  const nested = [
    ...good,
    frame(66, 2, Buffer.alloc(24)),
    frame(71, 3, word(0x74626c20)),
    frame(77, 4, small),
    frame(72, 4, cell),
  ];
  assert.deepEqual(
    Array.from({ length: 4 }, (_, i) => run(nested).readUInt32LE(i * 4)),
    [2, 2, 1, 0],
  );
  run(good);
  return { mutations: t.length * 8, rejected, recoveries: t.length * 8 };
}
export function tableZonePair(call, v, bytes, hwpx) {
  const xml = sectionXml(hwpx);
  const expected = [...xml.matchAll(/<hp:cellzone\b([^>]*)\/>/g)].flatMap((m) =>
    ["startRowAddr", "startColAddr", "endRowAddr", "endColAddr"].map((key) =>
      Number(m[1].match(new RegExp(`\\b${key}="(\\d+)"`))[1]),
    ),
  );
  const actual = [];
  for (const n of nodes(bytes).filter((r) => r.tag === 77)) {
    const out = call(18, Buffer.concat([word(v), n.raw]));
    for (let p = 0; p < out.length; p += 4) actual.push(out.readUInt32LE(p));
  }
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual, [0, 0, 2, 0]);
  return actual;
}
