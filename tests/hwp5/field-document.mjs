import assert from "node:assert/strict";
import { documentRecords, decodedDocumentInput } from "./documents.mjs";
import { fieldsActual } from "./fields.mjs";
import { fieldIds } from "./control-types.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
import { deflateRawSync } from "node:zlib";
export function fieldDocumentEdges(call, h, doc, sections, cfb) {
  const total = Array(6).fill(0);
  let rejected = 0,
    diagnostics = 0,
    containerRejected = 0;
  const nodes = cfb.document().nodes;
  assert.deepEqual(Buffer.from(cfb.findExact("/FileHeader").content), h);
  const body = nodes.findIndex((n) => n.name === "BodyText" && n.parent === 0);
  const base = call(24, decodedDocumentInput(h, doc, sections));
  for (const section of sections) {
    const b = section.bytes;
    let checkedContainer = false;
    fieldsActual(call, h.readUInt32LE(32), b).forEach(
      (n, i) => (total[i] += n),
    );
    const run = (bytes) =>
      call(
        24,
        decodedDocumentInput(
          h,
          doc,
          sections.map((s) =>
            s.index === section.index ? { index: s.index, bytes } : s,
          ),
        ),
      );
    for (const r of documentRecords(b))
      if (r.tag === 71 && fieldIds.has(b.readUInt32LE(r.start))) {
        const requiredEnd = r.start + 15 + b.readUInt16LE(r.start + 9) * 2;
        // Remove all opaque tail and the last required instance ID byte.
        const short = Buffer.concat([
          b.subarray(0, requiredEnd - 1),
          b.subarray(r.end),
        ]);
        assert.notEqual(b.readUInt32LE(r.offset) >>> 20, 4095);
        short.writeUInt32LE(
          ((b.readUInt32LE(r.offset) & 0xfffff) |
            ((requiredEnd - 1 - r.start) << 20)) >>>
            0,
          r.offset,
        );
        assert.throws(() => run(short), /UnexpectedEnd/);
        rejected++;
        assert.deepEqual(run(b), base);
        if (!checkedContainer) {
          const index = nodes.findIndex(
            (n) => n.name === `Section${section.index}` && n.parent === body,
          );
          assert.ok(index >= 0);
          const full = (plain) => {
            const copy = nodes.map((n) => ({ ...n }));
            copy[index].content =
              h.readUInt32LE(36) & 1 ? deflateRawSync(plain) : plain;
            const cap = Buffer.alloc(4);
            cap.writeUInt32LE(67108864);
            return call(
              25,
              Buffer.concat([cap, Buffer.from(cfb.write({ nodes: copy }))]),
            );
          };
          const original = full(b);
          assert.throws(() => full(short), /UnexpectedEnd/);
          containerRejected++;
          assert.deepEqual(full(b), original);
          checkedContainer = true;
        }
        const original = b.readUInt32LE(r.start + 4);
        for (const [mask, field] of [
          [1, 2],
          [0x8000, 3],
          [0xffff07fe, 4],
        ]) {
          const before = (original & mask) !== 0;
          const attrs = before
            ? (original & ~mask) >>> 0
            : (original | (mask === 0xffff07fe ? 0x80000000 : mask)) >>> 0;
          const changed = Buffer.from(b);
          changed.writeUInt32LE(attrs, r.start + 4);
          const want = Buffer.from(base),
            offset = sectionFieldOffset(section.index, "fields", field);
          want.writeUInt32LE(
            want.readUInt32LE(offset) + (before ? -1 : 1),
            offset,
          );
          assert.deepEqual(run(changed), want);
          diagnostics++;
        }
      }
  }
  return { total, rejected, diagnostics, containerRejected };
}
