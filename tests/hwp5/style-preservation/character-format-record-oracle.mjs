// Unit-wise styles, independent of native run editing and field ownership.
import assert from "node:assert/strict";
import { paragraphRecords, encodeRecord } from "./text-record-oracle.mjs";
export function expectedCharacterFormat(bytes, paragraph, start, end, id) {
  const p = paragraphRecords(bytes, paragraph);
  const own = p.direct.filter((r) => r.level === p.head.level + 1);
  const text = own.find((r) => r.tag === 67).payload,
    run = own.find((r) => r.tag === 68).payload;
  const rows = Array.from({ length: run.length / 8 }, (_, i) => ({
    at: run.readUInt32LE(i * 8),
    id: run.readUInt32LE(i * 8 + 4),
  }));
  assert(start >= 0 && start <= end && end < text.length / 2);
  const shapes = Array.from(
    { length: text.length / 2 + 1 },
    (_, unit) => rows.findLast((r) => r.at <= unit).id,
  );
  if (shapes.slice(start, end).every((shape) => shape === id)) return bytes;
  shapes.fill(id, start, end);
  const result = shapes.flatMap((shape, unit) =>
    unit === 0 || shape !== shapes[unit - 1] ? [{ at: unit, id: shape }] : [],
  );
  const payload = Buffer.alloc(result.length * 8);
  result.forEach((r, i) => {
    payload.writeUInt32LE(r.at, i * 8);
    payload.writeUInt32LE(r.id, i * 8 + 4);
  });
  const header = Buffer.from(p.head.payload);
  header.writeUInt16LE(result.length, 12);
  header.writeUInt16LE(0, 16);
  const changed = [
    Buffer.concat([p.head.raw.subarray(0, p.head.raw.length - p.head.payload.length), header]),
  ];
  for (const r of p.direct) {
    if (r.level !== p.head.level + 1) {
      changed.push(r.raw);
      continue;
    }
    if (r.tag === 69) continue;
    changed.push(r.tag === 68 ? encodeRecord(r.tag, r.level, payload) : r.raw);
  }
  return Buffer.concat([
    ...p.all.slice(0, p.at).map((r) => r.raw),
    ...changed,
    ...p.all.slice(p.end).map((r) => r.raw),
  ]);
}
