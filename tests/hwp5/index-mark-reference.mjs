import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync, deflateRawSync } from "node:zlib";
import { indexMarkActual } from "./index-mark.mjs";
import {
  documentRecords,
  documentActual,
  decodedDocumentInput,
} from "./documents.mjs";
import { containerActual } from "./containers.mjs";
import { checkBody } from "./body.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
export function indexMarkReference(call, cfb) {
  const path = new URL(
    "../../reference/rhwp/samples/HWP5-nopassword-123456.hwp",
    import.meta.url,
  );
  if (!existsSync(path)) return { skipped: "reference fixture unavailable" };
  const file = readFileSync(path);
  cfb.parse(file, { strict: true });
  const h = Buffer.from(cfb.findExact("/FileHeader").content),
    raw = Buffer.from(cfb.findExact("/BodyText/Section0").content);
  assert.equal(h.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024), 0);
  const b = h.readUInt32LE(36) & 1 ? inflateRawSync(raw) : raw;
  assert.deepEqual(call(3, Buffer.concat([h, raw]), b.length), b);
  const version = h.readUInt32LE(32),
    stats = indexMarkActual(call, version, b);
  assert.deepEqual(stats, [3, 11, 0, 6]);
  checkBody(call, version, b);
  const docRaw = Buffer.from(cfb.findExact("/DocInfo").content);
  const doc = h.readUInt32LE(36) & 1 ? inflateRawSync(docRaw) : docRaw;
  const sections = [{ index: 0, bytes: b }];
  const documentReport = documentActual(call, h, doc, sections);
  const containerReport = containerActual(call, file, cfb, h, doc, sections);
  const nodes = cfb.document().nodes;
  const body = nodes.findIndex((n) => n.name === "BodyText" && n.kind === 1);
  const section = nodes.findIndex(
    (n) => n.name === "Section0" && n.parent === body,
  );
  assert.ok(section >= 0);
  const full = (plain) => {
    const modified = nodes.map((n) => ({ ...n }));
    modified[section].content =
      h.readUInt32LE(36) & 1 ? deflateRawSync(plain) : plain;
    return call(
      25,
      Buffer.concat([
        w(64 * 1024 * 1024),
        Buffer.from(cfb.write({ nodes: modified })),
      ]),
    );
  };
  let rejected = 0;
  const input = (bytes) => Buffer.concat([w(version), bytes]);
  const good = call(34, input(b));
  for (const r of documentRecords(b)) {
    if (r.tag !== 71 || b.readUInt32LE(r.start) !== 0x6964786d) continue;
    // Remove the two opaque bytes AND one mandatory dummy byte.
    const short = Buffer.concat([b.subarray(0, r.end - 3), b.subarray(r.end)]);
    const bits = b.readUInt32LE(r.offset) & 0xfffff;
    short.writeUInt32LE((bits | ((r.end - r.start - 3) << 20)) >>> 0, r.offset);
    assert.throws(() => call(34, input(short)), /UnexpectedEnd/);
    rejected++;
    assert.throws(
      () =>
        call(24, decodedDocumentInput(h, doc, [{ index: 0, bytes: short }])),
      /UnexpectedEnd/,
    );
    rejected++;
    assert.throws(() => full(short), /UnexpectedEnd/);
    rejected++;
    assert.deepEqual(call(34, input(b)), good);
    // Opaque bytes are not required padding: trim just these bytes and still parse.
    const trimmed = Buffer.concat([
      b.subarray(0, r.end - 2),
      b.subarray(r.end),
    ]);
    trimmed.writeUInt32LE(
      (bits | ((r.end - r.start - 2) << 20)) >>> 0,
      r.offset,
    );
    assert.deepEqual(indexMarkActual(call, version, trimmed), [3, 11, 0, 4]);
    assert.doesNotThrow(() => full(trimmed));
  }
  return {
    controls: stats[0],
    firstUnits: stats[1],
    secondUnits: stats[2],
    extraBytes: stats[3],
    rejected,
    documentReport,
    containerReport,
  };
}
