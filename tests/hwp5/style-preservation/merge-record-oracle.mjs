import assert from "node:assert/strict";
import { inspect, paragraphRecords, encodeRecord } from "./text-record-oracle.mjs";
import { scopes } from "./structure-record-oracle.mjs";

export function verifyMerge(input, output, section, paragraph) {
  const before = inspect(input), after = inspect(output);
  const source = before.sections[section].bytes;
  const left = paragraphRecords(source, paragraph), right = paragraphRecords(source, paragraph + 1);
  const { parents, owners } = scopes(left.all);
  assert.equal(parents[left.at], parents[right.at]); assert.equal(owners[left.at], owners[right.at]);
  const owner = owners[left.at];
  const textOf = paragraph => {
    const payload = paragraph.direct.find(r => r.tag === 67)?.payload;
    if (payload?.length) return payload;
    assert((paragraph.head.payload.readUInt32LE(0) & 0x7fffffff) <= 1, "oracle cannot invent missing nonempty text");
    return Buffer.from("\r", "utf16le");
  };
  const first = textOf(left), second = textOf(right);
  const text = Buffer.concat([first.subarray(0, -2), second]);
  const map = (p, count) => {
    const rows = p.direct.find(r => r.tag === 68).payload;
    const runs = Array.from({ length: rows.length / 8 }, (_, i) => ({ at: rows.readUInt32LE(i * 8), id: rows.readUInt32LE(i * 8 + 4) }));
    return Array.from({ length: count }, (_, unit) => runs.findLast(r => r.at <= unit).id);
  };
  const styles = [...map(left, first.length / 2 - 1), ...map(right, second.length / 2 + 1)];
  const boundaries = styles.flatMap((id, at) => at === 0 || styles[at - 1] !== id ? [{ at, id }] : []);
  const runBytes = Buffer.alloc(boundaries.length * 8);
  boundaries.forEach((r, i) => { runBytes.writeUInt32LE(r.at, i * 8); runBytes.writeUInt32LE(r.id, i * 8 + 4); });
  const chunks = [];
  const retained = left.all.map((r, i) => ({ r, i })).filter(({ i }) => i < right.at || i >= right.end);
  const lastHeader = new Map();
  for (const { r, i } of retained) if (r.tag === 66) lastHeader.set(owners[i], i);
  const hasText = left.direct.some(r => r.tag === 67);
  for (const { r, i } of retained) {
    if (r.tag === 66) {
      const header = Buffer.from(r.payload);
      if (i === left.at) {
        header.writeUInt32LE(text.length / 2, 0);
        header.writeUInt16LE(boundaries.length, 12); header.writeUInt16LE(0, 14); header.writeUInt16LE(0, 16);
      }
      header.writeUInt32LE(((header.readUInt32LE(0) & 0x7fffffff) | (lastHeader.get(owners[i]) === i ? 0x80000000 : 0)) >>> 0, 0);
      chunks.push(Buffer.concat([r.raw.subarray(0, r.raw.length - r.payload.length), header]));
      if (i === left.at && !hasText) chunks.push(encodeRecord(67, r.level + 1, text));
    } else if (i === owner) {
      const raw = Buffer.from(r.raw), offset = raw.length - r.payload.length;
      raw.writeUInt16LE(raw.readUInt16LE(offset) - 1, offset); chunks.push(raw);
    } else if (i > left.at && i < left.end && r.level === left.head.level + 1) {
      if (r.tag === 69) continue;
      if (r.tag === 67) chunks.push(encodeRecord(r.tag, r.level, text));
      else if (r.tag === 68) chunks.push(encodeRecord(r.tag, r.level, runBytes));
      else if (r.tag === 70) chunks.push(encodeRecord(r.tag, r.level, Buffer.alloc(0)));
      else chunks.push(r.raw);
    } else chunks.push(r.raw);
  }
  assert.deepEqual(after.sections[section].bytes, Buffer.concat(chunks), "whole merged Section differs from independent expected records");
  assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
  for (const [path, bytes] of before.streams)
    if (path !== before.sections[section].path) assert.deepEqual(after.streams.get(path), bytes, `unselected stream changed: ${path}`);
}
