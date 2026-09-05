import assert from "node:assert/strict";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { checkDocinfo } from "./docinfo.mjs";
const word = (n, size = 4) => {
  const b = Buffer.alloc(size);
  b.writeUIntLE(n >>> 0, 0, size);
  return b;
};
const string = (b) => Buffer.concat([word(b.length / 2, 2), b]);
const frame = (tag, b, level = 1) =>
  Buffer.concat([word((tag | (level << 10) | (b.length << 20)) >>> 0), b]);
const version = 0x05010001;
function records(bytes) {
  const result = [];
  let pos = 0;
  while (pos < bytes.length) {
    const bits = bytes.readUInt32LE(pos);
    pos += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = bytes.readUInt32LE(pos);
      pos += 4;
    }
    result.push({ tag: bits & 1023, payload: bytes.subarray(pos, pos + n) });
    pos += n;
  }
  return result;
}
export function resourceEdges(call) {
  const name = Buffer.from([0, 0xd8, 0, 0, 0xff, 0xfe]); // preserve malformed surrogate/NUL/BOM
  for (let mask = 0; mask < 8; mask++) {
    const fields = [Buffer.from([(mask << 5) | 31]), string(name)];
    if (mask & 4) fields.push(Buffer.from([255]), string(Buffer.alloc(0)));
    if (mask & 2) fields.push(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    if (mask & 1) fields.push(string(name));
    const bytes = Buffer.concat(fields);
    checkDocinfo(
      call,
      version,
      frame(19, Buffer.concat([bytes, Buffer.from([123])])),
    );
    for (let n = 0; n < bytes.length; n++)
      assert.throws(
        () =>
          call(
            4,
            Buffer.concat([word(version), frame(19, bytes.subarray(0, n))]),
          ),
        /UnexpectedEnd/,
      );
  }
  const variants = [
    Buffer.concat([word(0, 2), string(name), string(Buffer.alloc(0))]),
    Buffer.concat([word(1, 2), word(65535, 2), string(name)]),
    Buffer.concat([word(2, 2), word(1, 2)]),
  ];
  for (const b of variants) {
    checkDocinfo(
      call,
      version,
      frame(18, Buffer.concat([b, Buffer.from([123])])),
    );
    for (let n = 0; n < b.length; n++)
      assert.throws(
        () =>
          call(4, Buffer.concat([word(version), frame(18, b.subarray(0, n))])),
        /UnexpectedEnd/,
      );
  }
  for (let type = 3; type < 16; type++)
    checkDocinfo(call, version, frame(18, Buffer.from([type, 255, 1, 2, 3])));
  for (const [tag, b] of [
    [18, variants[2]],
    [19, Buffer.alloc(3)],
  ])
    assert.throws(
      () => call(4, Buffer.concat([word(version), frame(tag, b, 0)])),
      /InvalidDocInfoLevel/,
    );
  const mappings = Buffer.alloc(60);
  mappings.writeUInt32LE(1, 4);
  const table = Buffer.concat([
    frame(17, mappings, 0),
    frame(19, Buffer.alloc(3)),
  ]);
  assert.deepEqual(
    call(5, Buffer.concat([word(version), table])),
    Buffer.concat([word(0), word(1), word(1), Buffer.alloc(24)]),
  );
  for (const [value, error] of [
    [2, /ResourceCountMismatch/],
    [0xffffffff, /NegativeMappingCount/],
  ]) {
    const b = Buffer.from(table);
    b.writeUInt32LE(value, 8);
    assert.throws(() => call(5, Buffer.concat([word(version), b])), error);
  }
  assert.throws(() => call(5, word(version)), /MissingIdMappings/);
  assert.throws(
    () =>
      call(5, Buffer.concat([word(version), table, frame(17, mappings, 0)])),
    /DuplicateIdMappings/,
  );
  const plain = Buffer.from("binary payload"),
    packed = deflateRawSync(plain);
  for (const defaultCompressed of [0, 1])
    for (let mode = 0; mode < 4; mode++) {
      const hdr = Buffer.alloc(256);
      hdr.write("HWP Document File");
      hdr.writeUInt32LE(version, 32);
      hdr[36] = defaultCompressed;
      const item = Buffer.from([2 | (mode << 4), 0, 1, 0]);
      const b =
        mode === 1 || (mode === 0 && defaultCompressed) ? packed : plain;
      const wire = Buffer.concat([hdr, word(item.length), item, b]);
      if (mode === 3)
        assert.throws(
          () => call(6, wire, plain.length),
          /UnsupportedCompression/,
        );
      else {
        assert.deepEqual(call(6, wire, plain.length), plain);
        assert.throws(() => call(6, wire, plain.length - 1), /LimitExceeded/);
      }
    }
}
export function resourceActual(call, hdr, docinfo, cfb) {
  const parsed = records(docinfo),
    m = parsed.find((r) => r.tag === 17).payload;
  const bins = parsed.filter((r) => r.tag === 18),
    fonts = parsed.filter((r) => r.tag === 19);
  const expected = Buffer.concat([
    word(bins.length),
    word(fonts.length),
    m.subarray(4, 32),
  ]);
  const reportWire = Buffer.concat([hdr.subarray(32, 36), docinfo]);
  const totalFonts = Array.from({ length: 7 }, (_, i) =>
    m.readInt32LE(4 + i * 4),
  ).reduce((a, b) => a + b, 0);
  const mismatch =
    m.readInt32LE(0) !== bins.length || totalFonts !== fonts.length;
  if (mismatch)
    assert.throws(() => call(5, reportWire), /ResourceCountMismatch/);
  else assert.deepEqual(call(5, reportWire), expected);
  let decoded = 0;
  const missing = [];
  for (const { payload: p } of bins) {
    const flags = p.readUInt16LE(0),
      type = flags & 15;
    if (type !== 1 && type !== 2) continue;
    const id = p.readUInt16LE(2);
    const ext =
      type === 1
        ? p.subarray(6, 6 + p.readUInt16LE(4) * 2).toString("utf16le")
        : "";
    const path = `/BinData/BIN${id.toString(16).padStart(4, "0")}${ext ? "." + ext : ""}`;
    const entry = cfb.findExact(path);
    if (!entry) {
      missing.push(path);
      continue;
    }
    const content = Buffer.from(entry.content),
      mode = (flags >>> 4) & 3;
    const compressed = mode === 1 || (mode === 0 && hdr[36] & 1);
    const oracle = compressed ? inflateRawSync(content) : content;
    assert.deepEqual(
      call(6, Buffer.concat([hdr, word(p.length), p, content]), oracle.length),
      oracle,
    );
    decoded++;
  }
  return {
    binData: bins.length,
    faceNames: fonts.length,
    decoded,
    mismatch,
    missing,
  };
}
