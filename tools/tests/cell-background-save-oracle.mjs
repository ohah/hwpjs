// Independent saved-byte expectations. Never imports SDK/native edit writers.
// CFB reader closure: ../cfb-stream-map.mjs -> ../../legacy/cfb.js (Apache-2.0).
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLegacyCfbStreams } from '../cfb-stream-map.mjs';

const LIMIT = 128 * 1024 * 1024;
const swap = (n) => ((n & 255) << 16) | (n & 0xff00) | ((n >>> 16) & 255);
const uint = (n) => assert.ok(Number.isInteger(n) && n >= 0 && n <= 0xffffffff);
const bytes = (value) => {
  assert.ok(value instanceof Uint8Array && value.length <= LIMIT);
  return Buffer.from(value);
};

function records(input) {
  const result = [],
    stack = [];
  let offset = 0;
  while (offset < input.length) {
    const start = offset;
    assert.ok(offset + 4 <= input.length, 'truncated record header');
    const word = input.readUInt32LE(offset);
    offset += 4;
    let size = word >>> 20;
    if (size === 4095) {
      assert.ok(offset + 4 <= input.length, 'truncated extended size');
      size = input.readUInt32LE(offset);
      offset += 4;
    }
    assert.ok(size <= input.length - offset, 'truncated record payload');
    const level = (word >>> 10) & 1023;
    while (stack.length && result[stack.at(-1)].level >= level) stack.pop();
    const index = result.length;
    result.push({
      tag: word & 1023,
      level,
      start,
      payloadStart: offset,
      parent: stack.at(-1),
      payload: input.subarray(offset, offset + size),
      raw: input.subarray(start, offset + size),
    });
    stack.push(index);
    offset += size;
    assert.ok(result.length <= 1_000_000, 'record budget');
  }
  return result;
}

function h5Original(input, target) {
  const streams = readLegacyCfbStreams(bytes(input));
  const header = streams.get('FileHeader');
  assert.ok(header && header.length >= 40, 'FileHeader missing');
  const flags = header.readUInt32LE(36);
  assert.equal(flags & 6, 0, 'encrypted/distribution fixture unsupported by this oracle');
  const decode = (name) => {
    const value = streams.get(name);
    assert.ok(value, `missing stream ${name}`);
    return flags & 1 ? inflateRawSync(value, { maxOutputLength: LIMIT }) : value;
  };
  const sectionName = `BodyText/Section${target.section}`;
  const section = decode(sectionName),
    body = records(section),
    info = records(decode('DocInfo'));
  const table = body[target.tableNode],
    cell = body[target.listNode];
  assert.equal(table?.tag, 77, 'target table must be TABLE');
  assert.equal(cell?.tag, 72, 'target cell must be LIST_HEADER');
  assert.ok(target.listNode > target.tableNode, 'caption is not a cell');
  assert.equal(cell.parent, table.parent, 'table/list owner mismatch');
  assert.equal(body[table.parent]?.tag, 71, 'table owner must be CTRL_HEADER');
  assert.equal(body.filter((r) => r.parent === table.parent && r.tag === 77).length, 1);
  assert.ok(cell.payload.length >= 34, 'observed8 cell payload required');
  const sourceRef = cell.payload.readUInt16LE(32);
  const fills = info.filter((r) => r.tag === 20);
  assert.ok(fills.every((r) => r.level === 1));
  const mappings = info.filter((r) => r.tag === 17);
  assert.equal(mappings.length, 1);
  assert.ok(mappings[0].payload.length >= 36);
  assert.equal(mappings[0].payload.readInt32LE(32), fills.length, 'ID_MAPPINGS count');
  const source = fills[sourceRef - 1];
  assert.ok(source && source.payload.length >= 36, 'known source fill required');
  const sourceIndex = info.indexOf(source);
  assert.ok(!info[sourceIndex + 1] || info[sourceIndex + 1].level <= 1, 'opaque BF child');
  const fillFlags = source.payload.readUInt32LE(32);
  assert.ok(fillFlags === 0 || fillFlags === 1, 'known no-fill or solid only');
  let color = null;
  if (fillFlags === 1) {
    assert.ok(source.payload.length >= 48, 'existing solid pattern required');
    assert.equal(source.payload.readInt32LE(44), -1, 'solid pattern only');
    const rawColor = source.payload.readUInt32LE(36);
    assert.ok(rawColor <= 0xffffff, 'explicit background required');
    color = swap(rawColor);
  } else {
    assert.ok(
      source.payload.length === 36 ||
        (source.payload.length === 40 && source.payload.readUInt32LE(36) === 0),
      'only known no-fill extension, no opaque construction',
    );
  }
  const sharedCount = body.filter(
    (r, i) =>
      i > target.tableNode &&
      r.tag === 72 &&
      r.payload.length >= 34 &&
      r.parent === table.parent &&
      r.payload.readUInt16LE(32) === sourceRef,
  ).length;
  return {
    streams,
    decode,
    sectionName,
    section,
    body,
    info,
    fills,
    cell,
    source,
    sourceRef,
    nextRef: fills.length + 1,
    color,
    fillFlags,
    sharedCount,
  };
}

function publicH5(original) {
  return {
    sourceRef: original.sourceRef,
    nextRef: original.nextRef,
    color: original.color,
    sharedCount: original.sharedCount,
    resourceCount: original.fills.length,
    sourceKind: original.fillFlags === 0 ? 'none' : 'solid',
  };
}

function verifyH5(before, after, target, color, expectedRef) {
  const original = h5Original(before, target);
  const next = h5Original(after, target);
  const ref = original.nextRef;
  assert.equal(expectedRef ?? ref, ref, 'wrong expected clone reference');
  assert.notEqual(color, original.color, 'edit oracle requires a changed color');
  assert.equal(next.sourceRef, ref, 'selected LIST_HEADER clone reference');
  assert.deepEqual([...next.streams.keys()].sort(), [...original.streams.keys()].sort());
  let untouchedStreams = 0;
  for (const [name, value] of original.streams) {
    if (name === 'DocInfo' || name === original.sectionName) continue;
    assert.deepEqual(next.streams.get(name), value, `unrelated stream ${name}`);
    untouchedStreams++;
  }
  const expectedSection = Buffer.from(original.section);
  expectedSection.writeUInt16LE(ref, original.cell.payloadStart + 32);
  assert.deepEqual(next.section, expectedSection, 'only selected LIST_HEADER ref bytes may change');
  assert.equal(next.fills.length, original.fills.length + 1, 'one BF clone');
  assert.equal(next.info.length, original.info.length + 1, 'one DocInfo record');
  const clone = next.fills.at(-1);
  let expectedPayload;
  if (original.fillFlags === 0) {
    const pattern = Buffer.alloc(16);
    pattern.writeUInt32LE(1, 0);
    pattern.writeUInt32LE(swap(color), 4);
    // Cell-specific construction: requested RGB supplies the inactive foreground.
    // This is not a guessed default and does not relax the generic patch writer.
    pattern.writeUInt32LE(swap(color), 8);
    pattern.writeInt32LE(-1, 12);
    expectedPayload = Buffer.concat([
      original.source.payload.subarray(0, 32),
      pattern,
      original.source.payload.subarray(36),
    ]);
  } else {
    expectedPayload = Buffer.from(original.source.payload);
    expectedPayload.writeUInt32LE(swap(color), 36);
  }
  assert.deepEqual(
    clone.payload,
    expectedPayload,
    'clone changes background only, including opaque tail',
  );
  assert.equal(clone.level, 1);
  const withoutClone = next.info.filter((r) => r !== clone);
  original.info.forEach((record, index) => {
    const expected = Buffer.from(record.raw);
    if (record.tag === 17) expected.writeInt32LE(ref, record.payloadStart - record.start + 32);
    assert.deepEqual(withoutClone[index].raw, expected, `original DocInfo record ${index}`);
  });
  return {
    ...publicH5(original),
    cloneRef: ref,
    color,
    untouchedStreams,
    comparedBodyRecords: original.body.length,
    comparedDocInfoRecords: original.info.length,
  };
}

function hx(request) {
  const result = spawnSync(
    'python3',
    ['-B', fileURLToPath(new URL('./cell-background-hwpx-oracle.py', import.meta.url))],
    {
      input: JSON.stringify(request),
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `independent HX oracle: ${result.stderr.slice(0, 4000)}`);
  return JSON.parse(result.stdout);
}

export function inspectCellBackgroundOriginal({ format, before, target }) {
  for (const key of ['section', 'tableNode', 'listNode']) uint(target[key]);
  if (format === 'hwp5') return publicH5(h5Original(before, target));
  assert.equal(format, 'hwpx');
  return hx({ before: bytes(before).toString('base64'), target });
}

export function verifyCellBackgroundSaved({ format, before, after, target, color, expectedRef }) {
  uint(color);
  assert.ok(color <= 0xffffff);
  for (const key of ['section', 'tableNode', 'listNode']) uint(target[key]);
  if (expectedRef !== undefined) uint(expectedRef);
  if (format === 'hwp5') return verifyH5(before, after, target, color, expectedRef);
  assert.equal(format, 'hwpx');
  return hx({
    before: bytes(before).toString('base64'),
    after: bytes(after).toString('base64'),
    target,
    color,
    expectedRef,
  });
}
