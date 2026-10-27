// 독립 CFB/raw-record 기대 변환입니다. Native serializer/문서 snapshot을 가져오지 않습니다.
import assert from 'node:assert/strict';
import {
  inspect,
  records,
  paragraphRecords,
  encodeRecord,
} from '../../tests/hwp5/style-preservation/text-record-oracle.mjs';
const rgb = (value) => {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffffff);
  return ((value >>> 16) & 255) | (value & 0xff00) | ((value & 255) << 16);
};
const widths = [10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500];
const styles = { NONE: 0, SOLID: 1, DOUBLE_SLIM: 8 };
const hatchStyles = ['HORIZONTAL', 'VERTICAL', 'BACK_SLASH', 'SLASH', 'CROSS', 'CROSS_DIAGONAL'];
function int(value, size, signed = false) {
  const out = Buffer.alloc(size);
  if (size === 1) out.writeUInt8(value);
  else if (signed) out.writeInt32LE(value);
  else out.writeUInt32LE(value);
  return out;
}
function patchedFill(original, request) {
  assert(original.length >= 36);
  const base = Buffer.from(original.subarray(0, 32));
  for (const [name, edge] of Object.entries(request.border ?? {})) {
    const index = ['left', 'right', 'top', 'bottom'].indexOf(name);
    assert(index >= 0);
    const at = 2 + index * 6;
    for (const key of Object.keys(edge))
      assert(['style', 'widthHundredthMm', 'color'].includes(key));
    if (edge.style !== undefined) {
      assert(Object.hasOwn(styles, edge.style));
      base[at] = styles[edge.style];
    }
    if (edge.widthHundredthMm !== undefined) {
      const width = widths.indexOf(edge.widthHundredthMm);
      assert(width >= 0);
      base[at + 1] = width;
    }
    if (edge.color !== undefined) base.writeUInt32LE(rgb(edge.color), at + 2);
  }
  if (!request.background) return Buffer.concat([base, original.subarray(32)]);
  const flags = original.readUInt32LE(32);
  assert((flags & ~7) === 0 && !(flags & 2), 'opaque/image background');
  let cursor = 36,
    foreground;
  if (flags & 1) {
    foreground = original.readUInt32LE(cursor + 4);
    const kind = original.readInt32LE(cursor + 8);
    assert(kind === -1 || (kind >= 1 && kind <= 6));
    cursor += 12;
  }
  if (flags & 4) {
    assert.equal(original[cursor], 1, 'linear only');
    const count = original.readUInt32LE(cursor + 17);
    cursor += 21 + count * 4 + (count > 2 ? count * 4 : 0);
  }
  let present = !(flags <= 1 && cursor === original.length),
    additional = Buffer.alloc(0);
  if (present) {
    const count = original.readUInt32LE(cursor);
    cursor += 4;
    additional = original.subarray(cursor, cursor + count);
    cursor += count;
  }
  const extra = original.subarray(cursor);
  assert(extra.length === 0 || (extra.length === 1 && [1, 4].includes(flags)));
  if (flags & 4) assert.equal(additional.length, 1);
  else assert.equal(additional.length, 0);
  const b = request.background;
  let fill;
  if (b.kind === 'none') fill = [int(0, 4)];
  else if (b.kind === 'solid') {
    assert(
      b.hatchColor !== undefined || foreground !== undefined,
      'explicit hatchColor needed to create H5 pattern storage',
    );
    fill = [
      int(1, 4),
      int(rgb(b.color), 4),
      int(b.hatchColor === undefined ? foreground : rgb(b.hatchColor), 4),
      int(-1, 4, true),
    ];
  } else if (b.kind === 'hatch') {
    const kind = hatchStyles.indexOf(b.style);
    assert(kind >= 0);
    fill = [int(1, 4), int(rgb(b.faceColor), 4), int(rgb(b.hatchColor), 4), int(kind + 1, 4, true)];
  } else {
    assert.equal(b.kind, 'linear');
    assert.equal(b.colors.length, 2);
    fill = [
      int(4, 4),
      int(1, 1),
      ...[b.angle, b.centerX, b.centerY, b.step, 2].map((v) => int(v, 4)),
      ...b.colors.map((v) => int(rgb(v), 4)),
    ];
  }
  if (b.kind === 'linear') fill.push(int(1, 4), int(b.stepCenter, 1));
  else if (present || extra.length) fill.push(int(0, 4));
  if (b.kind !== 'none' && extra.length) fill.push(extra);
  return Buffer.concat([base, ...fill]);
}
function styleReferences(payload) {
  let at = 0;
  for (let i = 0; i < 2; i++) {
    const count = payload.readUInt16LE(at);
    at += 2 + count * 2;
    assert(at <= payload.length);
  }
  assert(at + 6 <= payload.length);
  assert.equal(payload[at] & 7, 0, 'paragraph style only');
  return {
    paragraph: payload.readUInt16LE(at + 4),
    character: at + 8 <= payload.length ? payload.readUInt16LE(at + 6) : null,
  };
}
function appendResources(info, additions) {
  const rows = records(info),
    mapping = rows.find((r) => r.tag === 17);
  assert(mapping);
  const slots = { 20: 32, 21: 36, 25: 52 };
  const inserted = new Map();
  for (const tag of [20, 21, 25]) {
    if (!additions[tag].length) continue;
    const entries = rows.filter((r) => r.tag === tag);
    assert(entries.length);
    const last = rows.indexOf(entries.at(-1));
    let at = last + 1;
    while (at < rows.length && rows[at].level > 1) at++;
    inserted.set(at, [
      ...(inserted.get(at) ?? []),
      ...additions[tag].map((p) => encodeRecord(tag, 1, p)),
    ]);
  }
  const result = [];
  for (let i = 0; i <= rows.length; i++) {
    if (inserted.has(i)) result.push(...inserted.get(i));
    if (i === rows.length) break;
    const row = rows[i];
    if (row !== mapping) {
      result.push(row.raw);
      continue;
    }
    const payload = Buffer.from(row.payload);
    for (const tag of [20, 21, 25]) {
      const count = rows.filter((r) => r.tag === tag).length;
      assert.equal(payload.readInt32LE(slots[tag]), count);
      payload.writeInt32LE(count + additions[tag].length, slots[tag]);
    }
    result.push(Buffer.concat([row.raw.subarray(0, row.raw.length - row.payload.length), payload]));
  }
  return Buffer.concat(result);
}
// Proof uses only original records and requested resource payloads, never saved output.
export function preserveInactiveGridSnapReset(original, command, before, after) {
  if (
    command.patch?.reset?.scope !== 'paragraph' ||
    command.patch.reset.basis !== 'paragraph-style'
  )
    return false;
  if (before.length < 4 || before.length !== after.length) return false;
  if ((before.readUInt32LE(0) ^ after.readUInt32LE(0)) !== 256) return false;
  const masked = Buffer.from(before);
  masked.writeUInt32LE(after.readUInt32LE(0), 0);
  if (!masked.equals(after)) return false;
  try {
    const definitions = records(original.sections[command.section].bytes).filter(
      (row) => row.tag === 71 && row.payload.subarray(0, 4).toString('ascii') === 'dces',
    );
    if (definitions.length !== 1 || definitions[0].payload.length < 14) return false;
    const section = definitions[0].payload;
    return (
      section.readUInt32LE(4) === 0 &&
      section.readUInt16LE(10) === 0 &&
      section.readUInt16LE(12) === 0
    );
  } catch {
    return false;
  }
}

export function expected(original, command) {
  assert(
    Number.isInteger(command.section) &&
      command.section >= 0 &&
      command.section < original.sections.length,
    'invalid source section',
  );
  const info = original.decode(original.streams.get('DocInfo')),
    rows = records(info);
  const byTag = (tag) => rows.filter((r) => r.tag === tag);
  const fills = byTag(20),
    chars = byTag(21),
    paras = byTag(25),
    stylesSource = byTag(26);
  const target = paragraphRecords(original.sections[command.section].bytes, command.paragraph);
  const header = Buffer.from(target.head.payload),
    direct = target.direct.filter((r) => r.level === target.head.level + 1);
  const additions = { 20: [], 21: [], 25: [] };
  const fillClone = (id, request) => {
    assert(id > 0 && id <= fills.length, 'real one-based fill ref');
    const added = patchedFill(fills[id - 1].payload, request);
    additions[20].push(added);
    return fills.length + additions[20].length;
  };
  const patch = command.patch,
    character = patch.character ?? {},
    paragraph = patch.paragraph ?? {};
  assert(Object.keys(character).every((k) => ['border', 'background', 'shadow'].includes(k)));
  assert(
    Object.keys(paragraph).every((k) =>
      ['border', 'background', 'grid', 'borderConnect'].includes(k),
    ),
  );
  let resetChar = null;
  if (patch.reset) {
    assert.equal(Object.keys(character).length + Object.keys(paragraph).length, 0);
    assert.equal(patch.reset.basis, 'paragraph-style');
    assert(['character', 'paragraph', 'all'].includes(patch.reset.scope));
    const style = stylesSource[header[10]];
    assert(style, 'real style_id');
    const refs = styleReferences(style.payload);
    if (patch.reset.scope !== 'character') {
      assert(refs.paragraph < paras.length);
      header.writeUInt16LE(refs.paragraph, 8);
    }
    if (patch.reset.scope !== 'paragraph') {
      assert(refs.character !== null && refs.character < chars.length);
      resetChar = refs.character;
    }
  } else if (Object.keys(paragraph).length) {
    const source = paras[header.readUInt16LE(8)];
    assert(source);
    const payload = Buffer.from(source.payload);
    if (paragraph.border || paragraph.background)
      payload.writeUInt16LE(fillClone(payload.readUInt16LE(32), paragraph), 32);
    let flags = payload.readUInt32LE(0);
    if (paragraph.grid !== undefined)
      flags = ((flags & ~(1 << 8)) | (Number(paragraph.grid) << 8)) >>> 0;
    if (paragraph.borderConnect !== undefined)
      flags = ((flags & ~(1 << 28)) | (Number(paragraph.borderConnect) << 28)) >>> 0;
    payload.writeUInt32LE(flags, 0);
    header.writeUInt16LE(paras.length, 8);
    additions[25].push(payload);
  }
  let nextRuns = null;
  if (Object.keys(character).length || resetChar !== null) {
    const text = direct.find((r) => r.tag === 67),
      run = direct.find((r) => r.tag === 68);
    assert(text && run);
    const runs = [];
    for (let i = 0; i < run.payload.length; i += 8)
      runs.push({ unit: run.payload.readUInt32LE(i), id: run.payload.readUInt32LE(i + 4) });
    const unitIds = Array.from(
        { length: text.payload.length / 2 + 1 },
        (_, u) => runs.findLast((r) => r.unit <= u).id,
      ),
      created = new Map();
    assert(
      command.startUnit >= 0 &&
        command.startUnit < command.endUnit &&
        command.endUnit <= text.payload.length / 2 - 1,
    );
    for (let unit = command.startUnit; unit < command.endUnit; unit++) {
      const old = unitIds[unit];
      assert(old < chars.length);
      if (resetChar !== null) {
        unitIds[unit] = resetChar;
        continue;
      }
      if (!created.has(old)) {
        const payload = Buffer.from(chars[old].payload);
        if (character.border || character.background) {
          assert(payload.length >= 70);
          payload.writeUInt16LE(fillClone(payload.readUInt16LE(68), character), 68);
        }
        if (character.shadow) {
          const shadow = character.shadow;
          let flags = payload.readUInt32LE(46);
          if (shadow.kind !== undefined) {
            const kind = ['none', 'drop', 'continuous'].indexOf(shadow.kind);
            assert(kind >= 0);
            flags = ((flags & ~(3 << 11)) | (kind << 11)) >>> 0;
            payload.writeUInt32LE(flags, 46);
          }
          if (shadow.offsetX !== undefined) payload.writeInt8(shadow.offsetX, 50);
          if (shadow.offsetY !== undefined) payload.writeInt8(shadow.offsetY, 51);
          if (shadow.color !== undefined) payload.writeUInt32LE(rgb(shadow.color), 64);
        }
        created.set(old, chars.length + additions[21].length);
        additions[21].push(payload);
      }
      unitIds[unit] = created.get(old);
    }
    const boundaries = unitIds.flatMap((id, u) =>
      u === 0 || id !== unitIds[u - 1] ? [{ id, unit: u }] : [],
    );
    nextRuns = Buffer.alloc(boundaries.length * 8);
    boundaries.forEach((row, i) => {
      nextRuns.writeUInt32LE(row.unit, i * 8);
      nextRuns.writeUInt32LE(row.id, i * 8 + 4);
    });
    header.writeUInt16LE(boundaries.length, 12);
  }
  const preserveLayout =
    patch.reset?.scope === 'paragraph' &&
    preserveInactiveGridSnapReset(
      original,
      command,
      paras[target.head.payload.readUInt16LE(8)].payload,
      paras[header.readUInt16LE(8)].payload,
    );
  if (!preserveLayout) header.writeUInt16LE(0, 16);
  const newHead = Buffer.concat([
    target.head.raw.subarray(0, target.head.raw.length - target.head.payload.length),
    header,
  ]);
  const selected = [
    newHead,
    ...target.direct
      .filter((row) => preserveLayout || !(row.level === target.head.level + 1 && row.tag === 69))
      .map((row) =>
        nextRuns && row.level === target.head.level + 1 && row.tag === 68
          ? encodeRecord(68, row.level, nextRuns)
          : row.raw,
      ),
  ];
  return {
    info: appendResources(info, additions),
    section: Buffer.concat([
      ...target.all.slice(0, target.at).map((r) => r.raw),
      ...selected,
      ...target.all.slice(target.end).map((r) => r.raw),
    ]),
  };
}
export function verify(before, after, command) {
  const original = inspect(before),
    saved = inspect(after),
    planned = expected(original, command);
  assert.deepEqual(saved.decode(saved.streams.get('DocInfo')), planned.info, 'entire DocInfo');
  assert.deepEqual(saved.metadata, original.metadata, 'CFB metadata');
  assert.deepEqual([...saved.streams.keys()].sort(), [...original.streams.keys()].sort());
  for (let section = 0; section < original.sections.length; section++)
    assert.deepEqual(
      saved.sections[section].bytes,
      section === command.section ? planned.section : original.sections[section].bytes,
      'entire section ' + section,
    );
  const changed = new Set(['DocInfo', original.sections[command.section].path]);
  for (const [name, data] of original.streams)
    if (!changed.has(name))
      assert.deepEqual(saved.streams.get(name), data, 'untouched stream ' + name);
  return {
    entireDocInfo: true,
    entireSections: true,
    metadataExact: true,
    untouchedStreamsExact: true,
  };
}
