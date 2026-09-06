import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { overlapActual, overlapInput } from "./char-overlap.mjs";
import {
  documentRecords,
  documentActual,
  decodedDocumentInput,
} from "./documents.mjs";
export function overlapReference(call, cfb) {
  const results = [];
  for (const [path, mode] of [
    ["aift.hwp", 1],
    ["basic/issue2007_nested_cell_pagination_42065.hwp", 0],
  ]) {
    const url = new URL(
      "../../reference/rhwp/samples/" + path,
      import.meta.url,
    );
    if (!existsSync(url)) {
      results.push({ path, skipped: "reference fixture unavailable" });
      continue;
    }
    cfb.parse(readFileSync(url), { strict: true });
    const h = Buffer.from(cfb.findExact("/FileHeader").content),
      v = h.readUInt32LE(32),
      flags = h.readUInt32LE(36);
    assert.equal(flags & (2 | 4 | 16 | 256 | 1024), 0);
    const decode = (p) => {
      const raw = Buffer.from(cfb.findExact(p).content),
        b = flags & 1 ? inflateRawSync(raw) : raw;
      assert.deepEqual(call(3, Buffer.concat([h, raw]), b.length), b);
      return b;
    };
    const b = decode("/BodyText/Section0"),
      doc = decode("/DocInfo"),
      count = documentRecords(doc).filter((r) => r.tag === 21).length;
    const stats = overlapActual(call, v, b, count, mode);
    assert.ok(stats[0] > 0);
    let rejected = 0;
    for (const r of documentRecords(b))
      if (r.tag === 71 && b.readUInt32LE(r.start) === 0x74637073) {
        const short = Buffer.concat([
          b.subarray(0, r.end - 1),
          b.subarray(r.end),
        ]);
        assert.notEqual(b.readUInt32LE(r.offset) >>> 20, 4095);
        short.writeUInt32LE(
          ((b.readUInt32LE(r.offset) & 0xfffff) |
            ((r.end - r.start - 1) << 20)) >>>
            0,
          r.offset,
        );
        assert.throws(
          () => call(37, overlapInput(v, short, count, mode)),
          /UnexpectedEnd/,
        );
        rejected++;
        if (mode) {
          const bad = Buffer.from(b),
            pos = r.start + 4 + 2 + b.readUInt16LE(r.start + 4) * 2;
          assert.ok(b[pos + 3] > 0);
          bad.writeUInt32LE(count, pos + 4);
          assert.throws(
            () => call(37, overlapInput(v, bad, count, mode)),
            /InvalidResourceReference/,
          );
          rejected++;
        }
        overlapActual(call, v, b, count, mode);
      }
    const nodes = cfb.document().nodes;
    const sections = mode
      ? nodes
          .filter(
            (n) =>
              /^Section\d+$/.test(n.name) &&
              nodes[n.parent]?.name === "BodyText",
          )
          .map((n) => ({
            index: Number(n.name.slice(7)),
            bytes: decode("/BodyText/" + n.name),
          }))
      : [];
    let documentReport = null;
    if (mode) {
      // Known whole-document blocker: Section2 %%me tokens have %unk headers.
      // Keep it visible and pinned; do not count this as successful document validation.
      assert.throws(
        () => documentActual(call, h, doc, sections),
        /ControlIdMismatch/,
      );
      assert.throws(
        () => call(24, decodedDocumentInput(h, doc, sections)),
        /ControlIdMismatch/,
      );
      documentReport = {
        pending: "ControlIdMismatch",
        section: 2,
        paragraphOffsets: [401136, 401473],
      };
    }
    results.push({ path, version: v, stats, rejected, documentReport });
  }
  return results;
}
