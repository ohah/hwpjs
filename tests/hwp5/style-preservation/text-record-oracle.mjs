// Independent Node oracle: no product parser offsets or model snapshots.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { inflateRawSync } from "node:zlib";
const context = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(readFileSync("legacy/cfb.js", "utf8"), context);
const cfb = context.module.exports;

export function records(bytes) {
  const result = [];
  for (let at = 0; at < bytes.length;) {
    assert(at + 4 <= bytes.length);
    const start = at, bits = bytes.readUInt32LE(at); at += 4;
    let length = bits >>> 20;
    if (length === 4095) { assert(at + 4 <= bytes.length); length = bytes.readUInt32LE(at); at += 4; }
    assert(length <= bytes.length - at);
    result.push({ tag: bits & 1023, level: (bits >>> 10) & 1023, start, payload: Buffer.from(bytes.subarray(at, at + length)), raw: Buffer.from(bytes.subarray(start, at + length)) });
    at += length;
  }
  return result;
}

export function inspect(input) {
  const parsed = cfb.parse(input), streams = new Map();
  parsed.FileIndex.forEach((e, i) => { if (e.type === 2) streams.set(parsed.FullPaths[i].slice(parsed.FullPaths[0].length), Buffer.from(e.content ?? [])); });
  const compressed = Boolean(streams.get("FileHeader").readUInt32LE(36) & 1);
  const decode = b => compressed ? inflateRawSync(b, { maxOutputLength: 32 * 1024 * 1024 }) : b;
  const sections = [...streams].filter(([p]) => /^BodyText\/Section\d+$/.test(p)).sort((a, b) => Number(a[0].slice(16)) - Number(b[0].slice(16))).map(([path, b]) => ({ path, bytes: decode(b) }));
  return { streams, compressed, sections, decode };
}

export function paragraphRecords(bytes, index) {
  const all = records(bytes), heads = all.map((r, i) => r.tag === 66 ? i : -1).filter(i => i >= 0), at = heads[index];
  assert(at !== undefined);
  let end = at + 1;
  while (end < all.length && all[end].level > all[at].level) end++;
  return { all, at, end, head: all[at], direct: all.slice(at + 1, end) };
}

export function encodeRecord(tag, level, payload, extended = payload.length >= 4095) {
  const h = Buffer.alloc(extended ? 8 : 4);
  h.writeUInt32LE((tag | (level << 10) | ((extended ? 4095 : payload.length) << 20)) >>> 0);
  if (extended) h.writeUInt32LE(payload.length, 4);
  return Buffer.concat([h, payload]);
}

export function expectedSection(bytes, index, start, end, utf8) {
  const owner = paragraphRecords(bytes, index), text = owner.direct.find(r => r.tag === 67).payload;
  const add = Buffer.from(utf8, "utf16le"), output = Buffer.concat([text.subarray(0, start * 2), add, text.subarray(end * 2)]);
  if (output.equals(text)) return bytes;
  const rows = owner.direct.find(r => r.tag === 68).payload;
  const oldRuns = Array.from({ length: rows.length / 8 }, (_, i) => ({ at: rows.readUInt32LE(i * 8), id: rows.readUInt32LE(i * 8 + 4) }));
  // Unit-wise style map, independently of the product's boundary algorithm.
  const shapes = Array.from({ length: text.length / 2 + 1 }, (_, unit) => oldRuns.findLast(r => r.at <= unit).id);
  const newShapes = [...shapes.slice(0, start), ...Array(add.length / 2).fill(shapes[start]), ...shapes.slice(end)];
  const runs = newShapes.flatMap((id, unit) => unit === 0 || newShapes[unit - 1] !== id ? [{ at: unit, id }] : []);
  const runPayload = Buffer.alloc(runs.length * 8);
  runs.forEach((r, i) => { runPayload.writeUInt32LE(r.at, i * 8); runPayload.writeUInt32LE(r.id, i * 8 + 4); });
  const rangeRecord = owner.direct.find(r => r.tag === 70), rangeValues = [];
  if (rangeRecord) {
    const map = point => point < start ? point : point >= end ? point + add.length / 2 - (end - start) : start;
    for (let i = 0; i < rangeRecord.payload.length; i += 12) {
      const s = map(rangeRecord.payload.readUInt32LE(i)), e = map(rangeRecord.payload.readUInt32LE(i + 4)), tag = rangeRecord.payload.readUInt32LE(i + 8);
      if (s < e) rangeValues.push({ s, e, tag });
    }
  }
  const rangePayload = Buffer.alloc(rangeValues.length * 12);
  rangeValues.forEach((r, i) => { rangePayload.writeUInt32LE(r.s, i * 12); rangePayload.writeUInt32LE(r.e, i * 12 + 4); rangePayload.writeUInt32LE(r.tag, i * 12 + 8); });
  const header = Buffer.from(owner.head.payload);
  header.writeUInt32LE(((header.readUInt32LE(0) & 0x80000000) | (output.length / 2)) >>> 0, 0);
  header.writeUInt16LE(runs.length, 12); header.writeUInt16LE(rangeValues.length, 14); header.writeUInt16LE(0, 16);
  const changed = [Buffer.concat([owner.head.raw.subarray(0, owner.head.raw.length - owner.head.payload.length), header])];
  for (const r of owner.direct) {
    if (r.tag === 69) continue;
    const payload = r.tag === 67 ? output : r.tag === 68 ? runPayload : r.tag === 70 ? rangePayload : r.payload;
    changed.push(encodeRecord(r.tag, r.level, payload));
  }
  return Buffer.concat([...owner.all.slice(0, owner.at).map(r => r.raw), ...changed, ...owner.all.slice(owner.end).map(r => r.raw)]);
}

export function verifyRaw(beforeBytes, afterBytes, section, paragraph, start, end, utf8) {
  const before = inspect(beforeBytes), after = inspect(afterBytes), target = before.sections[section];
  assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
  assert.deepEqual(after.sections[section].bytes, expectedSection(target.bytes, paragraph, start, end, utf8), "complete Section must match independent splice, styles, ranges and cache removal");
  for (const [path, bytes] of before.streams) if (path !== target.path) assert.deepEqual(after.streams.get(path), bytes, `unselected stream ${path}`);
}
