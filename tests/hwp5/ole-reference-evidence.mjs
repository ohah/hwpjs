import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createCfbReader } from "../../js/cfb.mjs";
import { documentRecords, documentActual } from "./documents.mjs";
import { containerActual } from "./containers.mjs";
import { oleActual } from "./ole-validation.mjs";

// A counterexample to equating the OLE ID, DocInfo ordinal and physical storage ID.
// Inspect data only; do not activate OLE or execute chart content.
export async function oleReferenceEvidence(call, cfb) {
  const path = new URL("../../reference/rhwp/samples/chart/분산형/곡선이있는분산형.hwp", import.meta.url);
  if (!existsSync(path)) return { skipped: "reference fixture unavailable" };
  const file = readFileSync(path);
  cfb.parse(file, { strict: true });
  const h = Buffer.from(cfb.findExact("/FileHeader").content);
  assert.equal(h.readUInt32LE(32), 0x05010100);
  const flags = h.readUInt32LE(36);
  assert.equal(flags & (2 | 4 | 16 | 256 | 1024), 0);
  const decode = path => {
    const raw = Buffer.from(cfb.findExact(path).content);
    const plain = flags & 1 ? inflateRawSync(raw) : raw;
    assert.deepEqual(call(3, Buffer.concat([h, raw]), plain.length), plain);
    return plain;
  };
  const doc = decode("/DocInfo"), body = decode("/BodyText/Section0");
  const bins = documentRecords(doc).filter(r => r.tag === 18);
  assert.equal(bins.length, 1);
  const bin = doc.subarray(bins[0].start, bins[0].end);
  assert.deepEqual(bin, Buffer.from("0200030003004f004c004500", "hex"));
  const oleRecords = documentRecords(body).filter(r => r.tag === 84);
  assert.equal(oleRecords.length, 1);
  const p = body.subarray(oleRecords[0].start, oleRecords[0].end);
  const id = p.readUInt16LE(12);
  assert.equal(id, 1);
  assert.equal(call(46, Buffer.concat([Buffer.from([1]), p])).readUInt16LE(12), 1);
  const ownership = oleActual(call, h.readUInt32LE(32), body);
  assert.equal(ownership[1], 1); // Do not replace pending with a guessed success.
  const sections = [{ index: 0, bytes: body }];
  const document = documentActual(call, h, doc, sections);
  const container = containerActual(call, file, cfb, h, doc, sections);
  const inner = await createCfbReader(readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)));
  const streams = [];
  for (const [name, style] of [["BIN0001.OLE", "smooth"], ["BIN0002.OLE", "lineMarker"], ["BIN0003.OLE", "smoothMarker"]]) {
    const raw = Buffer.from(cfb.findExact(`/BinData/${name}`).content);
    const bytes = flags & 1 ? inflateRawSync(raw) : raw;
    // This fixture uses a four-byte size envelope followed by an independent CFB.
    assert.equal(bytes.readUInt32LE(0), bytes.length - 4);
    inner.parse(bytes.subarray(4), { strict: true });
    const xml = Buffer.from(inner.findExact("/OOXMLChartContents").content).toString("utf8");
    assert.ok(xml.includes(`<c:scatterStyle val="${style}"/>`));
    streams.push({ name, style, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  assert.equal(new Set(streams.map(s => s.sha256)).size, 3);
  return { oleId: id, docInfoOrdinal: 1, docInfoStorageId: 3, ownership, document, container, streams, interpretation: "pending: distinct physical targets; no Hancom execution" };
}
