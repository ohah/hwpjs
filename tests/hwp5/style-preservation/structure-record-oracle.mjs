import assert from "node:assert/strict";
import { inspect, records, paragraphRecords, expectedSection, encodeRecord } from "./text-record-oracle.mjs";

// Independent framing ancestry and sibling LIST_HEADER scope; never import product offsets.
export function scopes(all) {
  const stack = [], parents = [], lists = new Map(), owners = [];
  for (let i = 0; i < all.length; i++) {
    while (stack.length && all[stack.at(-1)].level >= all[i].level) stack.pop();
    const parent = stack.at(-1) ?? -1;
    parents.push(parent);
    if (all[i].tag === 72) lists.set(parent, i);
    owners.push(parent === -1 ? -1 : lists.get(parent) ?? -1);
    stack.push(i);
  }
  return { parents, owners };
}

export function verifySplit(input, output, section, paragraph, atUnit, endUnit = atUnit) {
  const before = inspect(input), after = inspect(output);
  assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
  const source = endUnit === atUnit ? before.sections[section].bytes : expectedSection(before.sections[section].bytes, paragraph, atUnit, endUnit, "");
  const original = paragraphRecords(source, paragraph);
  const text = original.direct.find(r => r.tag === 67)?.payload ?? Buffer.from("\r", "utf16le");
  const end = text.length / 2 - 1;
  assert(atUnit >= 0 && atUnit <= end);
  const used = new Set(before.sections.flatMap(s => records(s.bytes).filter(r => r.tag === 66).map(r => r.payload.readUInt32LE(18))));
  let id = 1;
  while (used.has(id)) id++;
  const { parents, owners } = scopes(original.all), owner = owners[original.at];
  const last = !original.all.some((r, i) => i > original.at && r.tag === 66 && parents[i] === parents[original.at] && owners[i] === owner);
  const leftBytes = expectedSection(source, paragraph, atUnit, end, "");
  const left = paragraphRecords(leftBytes, paragraph);
  const right = paragraphRecords(expectedSection(source, paragraph, 0, atUnit, ""), paragraph);
  const header = Buffer.from(right.head.payload);
  const rightText = right.direct.find(r => r.tag === 67)?.payload ?? Buffer.from("\r", "utf16le");
  const shapes = right.direct.find(r => r.tag === 68).payload;
  header.writeUInt32LE(((last ? 0x80000000 : 0) | rightText.length / 2) >>> 0, 0);
  header[11] = 0;
  header.writeUInt16LE(shapes.length / 8, 12);
  header.writeUInt16LE(0, 14); header.writeUInt16LE(0, 16);
  header.writeUInt32LE(id, 18);
  const added = Buffer.concat([encodeRecord(66, right.head.level, header), encodeRecord(67, right.head.level + 1, rightText), encodeRecord(68, right.head.level + 1, shapes)]);
  const chunks = left.all.map((r, i) => {
    if (i === left.at) {
      const raw = Buffer.from(r.raw), offset = raw.length - r.payload.length;
      raw.writeUInt32LE(raw.readUInt32LE(offset) & 0x7fffffff, offset);
      return raw;
    }
    if (i === owner) {
      const raw = Buffer.from(r.raw), offset = raw.length - r.payload.length;
      raw.writeUInt16LE(raw.readUInt16LE(offset) + 1, offset);
      return raw;
    }
    return r.raw;
  });
  chunks.splice(left.end, 0, added);
  assert.deepEqual(after.sections[section].bytes, Buffer.concat(chunks), "whole split Section differs from independent expected records");
  for (const [path, bytes] of before.streams)
    if (path !== before.sections[section].path) assert.deepEqual(after.streams.get(path), bytes, `unselected stream changed: ${path}`);
}
