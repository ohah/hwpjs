// Independent raw-byte expectation, not product resource or run snapshots.
import assert from "node:assert/strict";
import { inspect, records, paragraphRecords, encodeRecord } from "./text-record-oracle.mjs";
import { deflateRawSync } from "node:zlib";
import { decodeDistributionSection } from "../../../tools/hwp5-distribution-oracle.mjs";

function inspectCharacterDocument(input) {
  const parsed = inspect(input),
    flags = parsed.streams.get("FileHeader").readUInt32LE(36);
  if (flags & 4) {
    assert.equal(flags & 2, 0, "password distribution is outside this oracle");
    parsed.sections = [...parsed.streams]
      .filter(([path]) => /^ViewText\/Section\d+$/.test(path))
      .sort((a, b) => Number(a[0].slice(16)) - Number(b[0].slice(16)))
      .map(([path, bytes]) => ({
        path,
        bytes: decodeDistributionSection(bytes, parsed.compressed),
      }));
    assert(parsed.sections.length > 0, "distribution oracle requires ViewText");
  }
  return parsed;
}

export function verifyCharacterProperties(
  before,
  after,
  {
    section,
    paragraph,
    startUnit,
    endUnit,
    properties,
    reusableResourceIds = [],
    fontResource = null,
  },
) {
  return verifyCharacterPropertyBatch(before, after, [
    { section, paragraph, startUnit, endUnit, properties, reusableResourceIds, fontResource },
  ]);
}

export function verifyCharacterPropertyBatch(before, after, requests) {
  assert(Array.isArray(requests) && requests.length > 0);
  const original = inspectCharacterDocument(before),
    saved = inspectCharacterDocument(after);
  let planned = original;
  const reusable = new Set();
  for (const request of requests) {
    planned = planCharacterProperties(planned, {
      ...request,
      reusableResourceIds: [...new Set([...(request.reusableResourceIds ?? []), ...reusable])],
    });
    for (const id of planned.createdResourceIds) reusable.add(id);
  }
  assert.deepEqual(
    saved.decode(saved.streams.get("DocInfo")),
    planned.decode(planned.streams.get("DocInfo")),
  );
  assert.deepEqual(
    saved.sections.map((row) => row.path),
    planned.sections.map((row) => row.path),
  );
  for (let section = 0; section < planned.sections.length; section++)
    assert.deepEqual(saved.sections[section].bytes, planned.sections[section].bytes);
  assert.deepEqual([...saved.streams.keys()].sort(), [...original.streams.keys()].sort());
  const changed = new Set([
    "DocInfo",
    ...requests.map((request) => original.sections[request.section].path),
  ]);
  for (const [path, bytes] of original.streams)
    if (!changed.has(path)) assert.deepEqual(saved.streams.get(path), bytes, path);
  return true;
}

function planCharacterProperties(
  original,
  {
    section,
    paragraph,
    startUnit,
    endUnit,
    properties,
    reusableResourceIds = [],
    fontResource = null,
  },
) {
  const info = original.decode(original.streams.get("DocInfo"));
  const entries = records(info),
    resources = entries.filter((row) => row.tag === 21);
  const target = paragraphRecords(original.sections[section].bytes, paragraph);
  const direct = target.direct.filter((row) => row.level === target.head.level + 1);
  const text = direct.find((row) => row.tag === 67).payload;
  const runs = direct.find((row) => row.tag === 68).payload;
  const rows = Array.from({ length: runs.length / 8 }, (_, index) => ({
    at: runs.readUInt32LE(index * 8),
    id: runs.readUInt32LE(index * 8 + 4),
  }));
  const unitIds = Array.from(
    { length: text.length / 2 + 1 },
    (_, unit) => rows.findLast((row) => row.at <= unit).id,
  );
  const added = [],
    addedPayloads = [],
    replacements = new Map();
  for (let unit = startUnit; unit < endUnit; unit++) {
    const source = unitIds[unit];
    if (!replacements.has(source)) {
      const payload = Buffer.from(resources[source].payload);
      if (properties.fontIds != null) {
        assert.equal(properties.fontIds.length, 7);
        properties.fontIds.forEach((id, language) => {
          if (id == null) return;
          assert(Number.isInteger(id) && id >= 0 && id <= 65535);
          payload.writeUInt16LE(id, language * 2);
        });
      }
      if (properties.size != null) payload.writeInt32LE(properties.size, 42);
      let flags = payload.readUInt32LE(46);
      if (properties.outlineKind != null) {
        const codes = {
          none: 0,
          solid: 1,
          dot: 2,
          thick: 3,
          dash: 4,
          "dash-dot": 5,
          "dash-dot-dot": 6,
        };
        assert(Object.hasOwn(codes, properties.outlineKind));
        flags = ((flags & ~(7 << 8)) | (codes[properties.outlineKind] << 8)) >>> 0;
      }
      for (const [name, bit] of [
        ["emboss", 13],
        ["engrave", 14],
        ["superscript", 15],
        ["subscript", 16],
      ]) {
        if (Object.hasOwn(properties, name)) {
          assert.equal(typeof properties[name], "boolean");
          flags = ((flags & ~(1 << bit)) | (properties[name] ? 1 << bit : 0)) >>> 0;
        }
      }
      if (properties.bold != null) flags = ((flags & ~2) | (properties.bold ? 2 : 0)) >>> 0;
      if (properties.italic != null) flags = ((flags & ~1) | (properties.italic ? 1 : 0)) >>> 0;
      if (properties.underlineKind != null) {
        const raw = { none: 0, bottom: 1, top: 3 }[properties.underlineKind];
        assert.notEqual(raw, undefined, "unsupported HWP5 underline oracle request");
        flags = ((flags & ~12) | (raw << 2)) >>> 0;
      }
      payload.writeUInt32LE(flags, 46);
      if (properties.textColor != null) {
        const color = properties.textColor;
        assert(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
        payload.writeUInt32LE(
          ((color >>> 16) & 255) | (color & 0xff00) | ((color & 255) << 16),
          52,
        );
      }
      if (Object.hasOwn(properties, "shadeColor")) {
        const color = properties.shadeColor;
        assert(color === null || (Number.isInteger(color) && color >= 0 && color <= 0xffffff));
        payload.writeUInt32LE(
          color === null
            ? 0xffffffff
            : ((color >>> 16) & 255) | (color & 0xff00) | ((color & 255) << 16),
          60,
        );
      }
      if (properties.underlineColor != null) {
        const color = properties.underlineColor;
        assert(Number.isInteger(color) && color >= 0 && color <= 0xffffff);
        payload.writeUInt32LE(
          ((color >>> 16) & 255) | (color & 0xff00) | ((color & 255) << 16),
          56,
        );
      }
      if (payload.equals(resources[source].payload)) replacements.set(source, source);
      else {
        const existing = resources.findIndex(
          (resource, id) => reusableResourceIds.includes(id) && resource.payload.equals(payload),
        );
        const pending = addedPayloads.findIndex((resource) => resource.equals(payload));
        if (existing !== -1) replacements.set(source, existing);
        else if (pending !== -1) replacements.set(source, resources.length + pending);
        else {
          replacements.set(source, resources.length + added.length);
          added.push(encodeRecord(21, 1, payload));
          addedPayloads.push(payload);
        }
      }
    }
    unitIds[unit] = replacements.get(source);
  }
  assert(
    [...replacements].some(([source, replacement]) => source !== replacement),
    "oracle case must change properties",
  );
  const last = entries.lastIndexOf(resources.at(-1));
  let insertion = resources.at(-1).start + resources.at(-1).raw.length;
  for (let index = last + 1; index < entries.length && entries[index].level > 1; index++)
    insertion = entries[index].start + entries[index].raw.length;
  const expectedInfo = Buffer.from(info),
    mapping = entries.find((row) => row.tag === 17);
  const countAt = mapping.start + mapping.raw.length - mapping.payload.length + 36;
  assert.equal(expectedInfo.readInt32LE(countAt), resources.length);
  expectedInfo.writeInt32LE(resources.length + added.length, countAt);
  let composedInfo = Buffer.concat([
    expectedInfo.subarray(0, insertion),
    ...added,
    expectedInfo.subarray(insertion),
  ]);
  if (fontResource) {
    const { language, name } = fontResource;
    assert(Number.isInteger(language) && language >= 0 && language < 7);
    const infoRows = records(composedInfo),
      fontRows = infoRows.filter((row) => row.tag === 19);
    assert(fontRows.length > 0, "font oracle requires existing font list");
    const map = infoRows.find((row) => row.tag === 17);
    const slot = (1 + language) * 4;
    const count = map.payload.readInt32LE(slot);
    const boundary = Array.from({ length: language + 1 }, (_, i) =>
      map.payload.readInt32LE((1 + i) * 4),
    ).reduce((a, b) => a + b, 0);
    let at = fontRows[0].start;
    if (boundary > 0) {
      const lastFont = fontRows[boundary - 1];
      at = lastFont.start + lastFont.raw.length;
      for (
        let i = infoRows.indexOf(lastFont) + 1;
        i < infoRows.length && infoRows[i].level > 1;
        i++
      )
        at = infoRows[i].start + infoRows[i].raw.length;
    }
    const fontPayload = Buffer.alloc(3 + Buffer.byteLength(name, "utf16le"));
    fontPayload.writeUInt16LE(name.length, 1);
    fontPayload.write(name, 3, "utf16le");
    composedInfo.writeInt32LE(count + 1, map.start + map.raw.length - map.payload.length + slot);
    composedInfo = Buffer.concat([
      composedInfo.subarray(0, at),
      encodeRecord(19, 1, fontPayload),
      composedInfo.subarray(at),
    ]);
  }
  const boundaries = unitIds.flatMap((id, unit) =>
    unit === 0 || id !== unitIds[unit - 1] ? [{ id, unit }] : [],
  );
  const newRuns = Buffer.alloc(boundaries.length * 8);
  boundaries.forEach(({ id, unit }, index) => {
    newRuns.writeUInt32LE(unit, index * 8);
    newRuns.writeUInt32LE(id, index * 8 + 4);
  });
  const header = Buffer.from(target.head.payload);
  header.writeUInt16LE(boundaries.length, 12);
  header.writeUInt16LE(0, 16);
  const changed = [
    Buffer.concat([
      target.head.raw.subarray(0, target.head.raw.length - target.head.payload.length),
      header,
    ]),
  ];
  for (const row of target.direct) {
    if (row.level === target.head.level + 1 && row.tag === 69) continue;
    changed.push(
      row.level === target.head.level + 1 && row.tag === 68
        ? encodeRecord(68, row.level, newRuns)
        : row.raw,
    );
  }
  const expectedSection = Buffer.concat([
    ...target.all.slice(0, target.at).map((row) => row.raw),
    ...changed,
    ...target.all.slice(target.end).map((row) => row.raw),
  ]);
  const streams = new Map(original.streams),
    encode = (bytes) => (original.compressed ? deflateRawSync(bytes) : bytes);
  streams.set("DocInfo", encode(composedInfo));
  streams.set(original.sections[section].path, encode(expectedSection));
  return {
    ...original,
    streams,
    sections: original.sections.map((row, index) =>
      index === section ? { ...row, bytes: expectedSection } : row,
    ),
    createdResourceIds: [...replacements.values()].filter((id) => id >= resources.length),
  };
}
