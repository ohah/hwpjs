// Independent expected records, shared by native-API and real-browser audits.
import assert from "node:assert/strict";
import { inspect, records, encodeRecord } from "./text-record-oracle.mjs";

export function verifyParagraphProperty(
  input,
  saved,
  { section, paragraph, alignment, margins, spacing },
) {
  const original = inspect(Buffer.from(input)),
    edited = inspect(Buffer.from(saved));
  const source = original.sections[section];
  assert(source, "MissingSection");
  const head = records(source.bytes).filter((row) => row.tag === 66)[paragraph];
  assert(head, "MissingParagraph");
  const info = original.decode(original.streams.get("DocInfo")),
    entries = records(info),
    shapes = entries.filter((row) => row.tag === 25);
  const template = shapes[head.payload.readUInt16LE(8)];
  assert(template, "MissingParagraphShape");
  const added = Buffer.from(template.payload),
    count = shapes.length;
  assert(count < 65536);
  if (alignment !== undefined) {
    assert(Number.isInteger(alignment) && alignment >= 0 && alignment <= 7);
    added.writeUInt32LE(((added.readUInt32LE(0) & ~28) | (alignment << 2)) >>> 0, 0);
  }
  if (margins)
    for (const [name, offset] of Object.entries({
      left: 4,
      right: 8,
      indent: 12,
      before: 16,
      after: 20,
    })) {
      if (margins[name] !== undefined && margins[name] !== null)
        added.writeInt32LE(margins[name], offset);
    }
  if (spacing) {
    const { kind, value } = spacing;
    assert(Number.isInteger(kind) && kind >= 0 && kind <= 3);
    assert(Number.isInteger(value) && value >= -2147483648 && value <= 2147483647);
    const modern =
      original.streams.get("FileHeader").readUInt32LE(32) >= 0x05000205 && added.length >= 54;
    if (modern) {
      added.writeUInt32LE(((added.readUInt32LE(46) & ~31) | kind) >>> 0, 46);
      added.writeInt32LE(value, 50);
    }
    if (!modern || kind === 0) {
      assert(modern || kind !== 3, "MissingModernMinimumSpacing");
      added.writeUInt32LE(((added.readUInt32LE(0) & ~3) | kind) >>> 0, 0);
      added.writeInt32LE(value, 24);
    }
  }
  const last = entries.lastIndexOf(shapes.at(-1));
  assert(last >= 0);
  let at = shapes.at(-1).start + shapes.at(-1).raw.length;
  for (let i = last + 1; i < entries.length && entries[i].level > 1; i++)
    at = entries[i].start + entries[i].raw.length;
  const expectedInfo = Buffer.from(info),
    mapping = entries.find((row) => row.tag === 17);
  assert(mapping);
  expectedInfo.writeInt32LE(
    count + 1,
    mapping.start + mapping.raw.length - mapping.payload.length + 52,
  );
  assert.deepEqual(
    edited.decode(edited.streams.get("DocInfo")),
    Buffer.concat([
      expectedInfo.subarray(0, at),
      encodeRecord(25, 1, added),
      expectedInfo.subarray(at),
    ]),
    "ExactDocInfo",
  );
  const expectedSection = Buffer.from(source.bytes);
  expectedSection.writeUInt16LE(count, head.start + head.raw.length - head.payload.length + 8);
  assert.deepEqual(edited.sections[section].bytes, expectedSection, "ExactTargetSection");
  assert.deepEqual(edited.metadata, original.metadata, "ContainerMetadata");
  assert.deepEqual([...edited.streams.keys()].sort(), [...original.streams.keys()].sort());
  for (const [name, bytes] of original.streams)
    if (name !== "DocInfo" && name !== source.path)
      assert.deepEqual(edited.streams.get(name), bytes, name);
  return true;
}
