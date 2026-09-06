import assert from "node:assert/strict";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { decodedDocumentInput, documentRecords } from "./documents.mjs";
import { previewActual } from "./preview.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const run = (call, bytes, limit = 64 * 1024 * 1024, records) =>
  call(25, Buffer.concat([w(limit), Buffer.from(bytes)]), records);
const words = (b) =>
  Array.from({ length: b.length / 4 }, (_, i) => b.readUInt32LE(i * 4));
export function containerActual(call, bytes, cfb, h, doc, sections) {
  const expected = call(24, decodedDocumentInput(h, doc, sections));
  const used = new Set([
    "/fileheader",
    "/docinfo",
    ...sections.map((s) => `/bodytext/section${s.index}`),
  ]);
  const stats = [0, 0, 0, 0, 0];
  for (const r of documentRecords(doc)) {
    if (r.tag !== 18) continue;
    stats[0]++;
    const b = doc.subarray(r.start, r.end),
      flags = b.readUInt16LE(0),
      type = flags & 15;
    if (type === 0) {
      stats[3]++;
      continue;
    }
    if (type > 2) {
      stats[4]++;
      continue;
    }
    const id = b.readUInt16LE(2),
      ext =
        type === 1
          ? b.subarray(6, 6 + 2 * b.readUInt16LE(4)).toString("utf16le")
          : "";
    const path = `/BinData/BIN${id.toString(16).padStart(4, "0")}${ext ? "." + ext : ""}`;
    const raw = Buffer.from(cfb.findExact(path).content),
      mode = (flags >>> 4) & 3;
    const plain =
      mode === 1 || (mode === 0 && h.readUInt32LE(36) & 1)
        ? inflateRawSync(raw)
        : raw;
    stats[1]++;
    stats[2] += plain.length;
    used.add(path.toLowerCase());
  }
  const nodes = cfb.document().nodes;
  const previewEntry = cfb.findExact("/PrvText");
  const previewBytes = previewEntry
    ? Buffer.from(previewEntry.content)
    : Buffer.alloc(0);
  const preview = previewEntry
    ? [1, ...previewActual(call, previewBytes)]
    : [0, 0, 0, 0, 0, 0];
  if (previewEntry) used.add("/prvtext");
  const path = (i) =>
    nodes[i].kind === 5 ? "" : `${path(nodes[i].parent)}/${nodes[i].name}`;
  const uninspected = nodes.filter(
    (n, i) => n.kind === 2 && !used.has(path(i).toLowerCase()),
  ).length;
  const total = expected.readUInt32LE(12) + stats[2] + previewBytes.length;
  const want = Buffer.concat([
    expected,
    ...preview.map(w),
    ...[...stats, total, uninspected].map(w),
  ]);
  assert.deepEqual(run(call, bytes, total, expected.readUInt32LE(16)), want);
  assert.throws(() => run(call, bytes, total - 1), /LimitExceeded/);
  return [1, stats[1], stats[2], uninspected, ...preview];
}
export function containerEdges(call, cfb) {
  const h = Buffer.alloc(256);
  h.write("HWP Document File");
  h.writeUInt32LE(0x05000107, 32);
  const frame = (tag, b, level = 0) =>
    Buffer.concat([w(tag | (level << 10) | (b.length << 20)), b]);
  const binary = (flags = 0x21, ext = Buffer.from("png", "utf16le")) =>
    Buffer.concat([u(flags), u(9), u(ext.length / 2), ext]);
  const map = Buffer.alloc(60);
  map.writeUInt32LE(1);
  const doc = (b) =>
    Buffer.concat([
      frame(16, Buffer.alloc(26)),
      frame(17, map),
      frame(18, b, 1),
    ]);
  const nodes = (header = h, item = binary(), payload = Buffer.from("abc")) => [
    { name: "Root Entry", kind: 5 },
    { name: "FileHeader", parent: 0, content: header },
    {
      name: "DocInfo",
      parent: 0,
      content: header[36] & 1 ? deflateRawSync(doc(item)) : doc(item),
    },
    { name: "BodyText", parent: 0, kind: 1 },
    { name: "BinData", parent: 0, kind: 1 },
    { name: "BIN0009.png", parent: 4, content: payload },
  ];
  const write = (n) => cfb.write({ nodes: n });
  const good = write(nodes()),
    output = run(call, good);
  let rejected = 0;
  const reject = (n, error) => {
    assert.throws(() => run(call, write(n)), error);
    assert.deepEqual(run(call, good), output);
    rejected++;
  };
  for (const index of [1, 2, 3, 5]) {
    const n = nodes();
    n[index].name = "Wrong";
    reject(n, /MissingHwpEntry/);
  }
  for (const index of [1, 2, 3, 5]) {
    const n = nodes();
    n[index].kind = index === 3 ? 2 : 1;
    n[index].content = Buffer.alloc(0);
    reject(n, /InvalidHwpEntryKind/);
  }
  const nested = nodes();
  nested[1].parent = 4;
  reject(nested, /MissingHwpEntry/);
  const rootBin = nodes();
  rootBin[5].parent = 0;
  reject(rootBin, /MissingHwpEntry/);
  for (const name of [
    "Section",
    "Section01",
    "Section-1",
    "Section65536",
    "Section99999999999999999999",
    "Sectionx",
  ]) {
    reject([...nodes(), { name, parent: 3 }], /InvalidSectionName/);
  }
  reject(
    [...nodes(), { name: "Section0", parent: 3, kind: 1 }],
    /InvalidHwpEntryKind/,
  );
  reject([...nodes(), { name: "Section0", parent: 3 }], /SectionCountMismatch/);
  for (const ext of ["/x", "\\x", "x:y", "\0", "a".repeat(24)])
    reject(
      nodes(h, binary(0x21, Buffer.from(ext, "utf16le"))),
      /InvalidBinDataExtension/,
    );
  reject(
    nodes(h, binary(0x21, Buffer.from([0, 0xd8]))),
    /InvalidBinDataExtension/,
  );
  const mixed = nodes();
  for (const i of [1, 2, 3, 4, 5]) mixed[i].name = mixed[i].name.toLowerCase();
  assert.deepEqual(run(call, write(mixed)), output);
  const total = 256 + doc(binary()).length + 3;
  assert.deepEqual(run(call, good, total), output);
  assert.throws(() => run(call, good, total - 1), /LimitExceeded/);
  for (const flag of [2, 4, 16, 256, 1024]) {
    const b = Buffer.from(h);
    b.writeUInt32LE(flag, 36);
    reject(
      nodes(b),
      /UnsupportedEncryption|UnsupportedDistribution|UnsupportedDrm/,
    );
  }
  for (const compressed of [0, 1])
    for (const mode of [0, 1, 2]) {
      const b = Buffer.from(h);
      b[36] = compressed;
      const raw = Buffer.from("abc"),
        payload =
          mode === 1 || (mode === 0 && compressed) ? deflateRawSync(raw) : raw;
      const out = words(
        run(call, write(nodes(b, binary(1 | (mode << 4)), payload)), total),
      );
      assert.deepEqual(out.slice(-7), [1, 1, 3, 0, 0, total, 0]);
    }
  reject(nodes(h, binary(0x31)), /UnsupportedCompression/);
  for (const size of [0, 4095, 4096, 4097]) {
    for (const packed of [false, true]) {
      const raw = Buffer.alloc(size, 97),
        item = binary(packed ? 0x11 : 0x21);
      const bytes = write(nodes(h, item, packed ? deflateRawSync(raw) : raw));
      const bound = 256 + doc(item).length + size;
      assert.equal(words(run(call, bytes, bound)).at(-2), bound);
      assert.throws(() => run(call, bytes, bound - 1), /LimitExceeded/);
    }
  }
  const storage = nodes(h, Buffer.concat([u(0x22), u(9)]));
  storage[5].name = "BIN0009";
  assert.deepEqual(
    words(run(call, write(storage))).slice(-7, -2),
    [1, 1, 3, 0, 0],
  );
  const repeated = nodes();
  repeated[2].content = Buffer.concat([doc(binary()), frame(18, binary(), 1)]);
  repeated[2].content.writeUInt32LE(2, 34);
  const repeatedTotal = 256 + repeated[2].content.length + 6;
  const repeatedBytes = write(repeated);
  assert.deepEqual(words(run(call, repeatedBytes, repeatedTotal)).slice(-7), [
    2,
    2,
    6,
    0,
    0,
    repeatedTotal,
    0,
  ]);
  assert.throws(
    () => run(call, repeatedBytes, repeatedTotal - 1),
    /LimitExceeded/,
  );
  const corruptedDoc = nodes(Buffer.from(h));
  corruptedDoc[1].content[36] = 1;
  corruptedDoc[2].content = Buffer.from([255]);
  reject(corruptedDoc, /Invalid|Unexpected|Deflate/);
  reject(
    nodes(h, binary(0x11), Buffer.from([255])),
    /Invalid|Unexpected|Deflate/,
  );
  const extra = [
    ...nodes(),
    { name: "Other", parent: 3, content: Buffer.from([1]) },
  ];
  assert.equal(words(run(call, write(extra))).at(-1), 1);
  const external = words(run(call, write(nodes(h, Buffer.alloc(6)))));
  assert.deepEqual(external.slice(-7, -2), [1, 0, 0, 1, 0]);
  assert.equal(external.at(-1), 1); // Unused BIN stream remains uninspected.
  const unknown = words(run(call, write(nodes(h, u(15)))));
  assert.deepEqual(unknown.slice(-7, -2), [1, 0, 0, 0, 1]);
  for (const raw of [
    Buffer.alloc(0),
    Buffer.from("\ufeffA\0😀\ud800", "utf16le"),
  ]) {
    const n = [...nodes(), { name: "PrvText", parent: 0, content: raw }];
    const out = words(run(call, write(n), total + raw.length));
    assert.deepEqual(out.slice(-13, -7), [1, ...previewActual(call, raw)]);
    assert.equal(out.at(-1), 0);
  }
  reject(
    [...nodes(), { name: "PrvText", parent: 0, content: Buffer.from([1]) }],
    /InvalidPreviewTextSize/,
  );
  reject(
    [...nodes(), { name: "PrvText", parent: 0, kind: 1 }],
    /InvalidHwpEntryKind/,
  );
  const nestedPreview = [
    ...nodes(),
    { name: "PrvText", parent: 4, content: Buffer.from([1]) },
  ];
  assert.deepEqual(
    words(run(call, write(nestedPreview))).slice(-13, -7),
    [0, 0, 0, 0, 0, 0],
  );
  assert.equal(words(run(call, write(nestedPreview))).at(-1), 1);
  return {
    rejected,
    recoveries: rejected,
    compressionPolicies: 6,
    binarySizeBoundaries: 8,
  };
}
