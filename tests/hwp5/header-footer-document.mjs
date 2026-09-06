import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { decodedDocumentInput, documentRecords } from "./documents.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
function replace(bytes, r, payload) {
  const bits = bytes.readUInt32LE(r.offset) & 0xfffff;
  return Buffer.concat([
    bytes.subarray(0, r.offset),
    w((bits | (payload.length << 20)) >>> 0),
    payload,
    bytes.subarray(r.end),
  ]);
}
// Mutate real owning records, not isolated synthetic headers; verify both aggregation paths.
export function headerFooterDocumentEdges(call, cfb, h, doc, sections) {
  let controls = 0,
    rejected = 0;
  const nodes = cfb.document().nodes;
  const decoded = (ss) => call(24, decodedDocumentInput(h, doc, ss));
  const container = (ss) => {
    const modified = nodes.map((n) => ({ ...n }));
    for (const s of ss) {
      const body = modified.findIndex(
        (n) => n.name === "BodyText" && n.kind === 1,
      );
      const node = modified.find(
        (n) => n.parent === body && n.name === `Section${s.index}`,
      );
      assert.ok(node);
      node.content = h.readUInt32LE(36) & 1 ? deflateRawSync(s.bytes) : s.bytes;
    }
    return call(
      25,
      Buffer.concat([
        w(64 * 1024 * 1024),
        Buffer.from(cfb.write({ nodes: modified })),
      ]),
    );
  };
  for (const s of sections) {
    const rows = documentRecords(s.bytes);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (
        r.tag !== 71 ||
        ![0x68656164, 0x666f6f74].includes(s.bytes.readUInt32LE(r.start))
      )
        continue;
      controls++;
      const mutate = (bytes) =>
        sections.map((x) => (x.index === s.index ? { ...x, bytes } : x));
      const good = decoded(sections);
      const check = (bytes, error) => {
        const ss = mutate(bytes);
        assert.throws(() => decoded(ss), error);
        assert.throws(() => container(ss), error);
        rejected += 2;
        assert.deepEqual(decoded(sections), good);
      };
      check(
        replace(s.bytes, r, s.bytes.subarray(r.start, r.start + 7)),
        /UnexpectedEnd/,
      );
      const level = (s.bytes.readUInt32LE(r.offset) >>> 10) & 1023;
      let end = i + 1;
      while (
        end < rows.length &&
        ((s.bytes.readUInt32LE(rows[end].offset) >>> 10) & 1023) > level
      )
        end++;
      const list = rows
        .slice(i + 1, end)
        .find(
          (x) =>
            x.tag === 72 &&
            ((s.bytes.readUInt32LE(x.offset) >>> 10) & 1023) === level + 1,
        );
      assert.ok(list);
      check(
        replace(s.bytes, list, s.bytes.subarray(list.start, list.start + 8)),
        /UnexpectedEnd/,
      );
      check(
        Buffer.concat([
          s.bytes.subarray(0, r.end),
          s.bytes.subarray(
            end < rows.length ? rows[end].offset : s.bytes.length,
          ),
        ]),
        /MissingHeaderFooterList/,
      );
      const reserved = Buffer.from(s.bytes);
      reserved.writeUInt32LE(
        (reserved.readUInt32LE(r.start + 4) | 3) >>> 0,
        r.start + 4,
      );
      const changed = decoded(mutate(reserved));
      const stat = 132 + s.index * 180 + 144;
      assert.equal(
        changed.readUInt32LE(stat + 12),
        good.readUInt32LE(stat + 12) + 1,
      );
      // Container serializes the same document prefix, including the previously unobserved report.
      assert.deepEqual(
        container(mutate(reserved)).subarray(0, changed.length),
        changed,
      );
    }
  }
  return { controls, rejected };
}
