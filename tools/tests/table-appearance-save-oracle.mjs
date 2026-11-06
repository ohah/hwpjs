// Independent multi-owner COW expectations. No product model/editor/writer imports.
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLegacyCfbStreams } from '../cfb-stream-map.mjs';
const widths = [10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500];
const swap = (n) => ((n & 255) << 16) | (n & 0xff00) | ((n >>> 16) & 255);
export function records(bytes) {
  const out = [];
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset;
    assert.ok(offset + 4 <= bytes.length);
    const word = bytes.readUInt32LE(offset);
    offset += 4;
    let size = word >>> 20;
    if (size === 4095) {
      assert.ok(offset + 4 <= bytes.length);
      size = bytes.readUInt32LE(offset);
      offset += 4;
    }
    assert.ok(size <= bytes.length - offset, 'record extent');
    out.push({
      tag: word & 1023,
      level: (word >>> 10) & 1023,
      start,
      payloadStart: offset,
      payload: bytes.subarray(offset, offset + size),
      raw: bytes.subarray(start, offset + size),
    });
    offset += size;
    assert.ok(out.length <= 1_000_000);
  }
  return out;
}
function document(input) {
  const streams = readLegacyCfbStreams(Buffer.from(input));
  const header = streams.get('FileHeader');
  assert.ok(header?.length >= 40);
  const flags = header.readUInt32LE(36);
  assert.equal(flags & 6, 0);
  const decode = (name) => {
    const bytes = streams.get(name);
    assert.ok(bytes);
    return flags & 1 ? inflateRawSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }) : bytes;
  };
  return { streams, decode, info: records(decode('DocInfo')) };
}
function payload(source, operations) {
  let expected = Buffer.from(source);
  for (const op of operations) {
    assert.ok(Number.isInteger(op.color) && op.color >= 0 && op.color <= 0xffffff);
    if (op.kind === 'cell-background') {
      const flags = expected.readUInt32LE(32);
      if (flags === 0) {
        assert.ok(
          expected.length === 36 || (expected.length === 40 && expected.readUInt32LE(36) === 0),
        );
        const fill = Buffer.alloc(16);
        fill.writeUInt32LE(1);
        fill.writeUInt32LE(swap(op.color), 4);
        fill.writeUInt32LE(swap(op.color), 8);
        fill.writeInt32LE(-1, 12);
        expected = Buffer.concat([expected.subarray(0, 32), fill, expected.subarray(36)]);
      } else {
        assert.equal(flags, 1);
        assert.equal(expected.readInt32LE(44), -1);
        expected.writeUInt32LE(swap(op.color), 36);
      }
    } else {
      assert.equal(op.kind, 'cell-border');
      assert.ok(op.edges > 0 && op.edges <= 15);
      assert.ok(widths.includes(op.width));
      assert.ok(['NONE', 'SOLID', 'DOUBLE_SLIM'].includes(op.style));
      for (let i = 0; i < 4; i++)
        if (op.edges & (1 << i)) {
          expected[2 + i * 6] = { NONE: 0, SOLID: 1, DOUBLE_SLIM: 8 }[op.style];
          expected[3 + i * 6] = widths.indexOf(op.width);
          expected.writeUInt32LE(swap(op.color), 4 + i * 6);
        }
    }
  }
  return expected;
}
let oracleOutputBytes = 0;
export function pythonOracle(request, optimized = false) {
  const result = spawnSync(
    'python3',
    [
      ...(optimized ? ['-O'] : []),
      '-B',
      fileURLToPath(new URL('./table-appearance-hwpx-oracle.py', import.meta.url)),
    ],
    {
      input: JSON.stringify(request),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  oracleOutputBytes +=
    Buffer.byteLength(result.stdout ?? '') + Buffer.byteLength(result.stderr ?? '');
  assert.ok(oracleOutputBytes <= 2 * 1024 * 1024, 'aggregate child oracle stdout/stderr budget');
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `independent ZIP/XML oracle: ${result.stderr.slice(0, 4000)}`);
  return JSON.parse(result.stdout);
}
export function verifyAppearanceSaved({ format, before, after, edits }, optimized = false) {
  assert.ok(Array.isArray(edits) && edits.length > 0 && edits.length <= 4096);
  const keys = new Set();
  for (const e of edits) {
    const k = `${e.target.section}:${e.target.listNode}`;
    assert.ok(!keys.has(k), 'duplicate oracle owner');
    keys.add(k);
  }
  if (format === 'hwpx')
    return pythonOracle(
      {
        before: Buffer.from(before).toString('base64'),
        after: Buffer.from(after).toString('base64'),
        edits,
      },
      optimized,
    );
  assert.equal(format, 'hwp5');
  const old = document(before),
    next = document(after),
    oldFills = old.info.filter((r) => r.tag === 20),
    nextFills = next.info.filter((r) => r.tag === 20);
  const sections = new Map(),
    clones = new Map(),
    expectedClones = new Map();
  for (const { target, operations } of edits) {
    const name = `BodyText/Section${target.section}`;
    if (!sections.has(name))
      sections.set(name, {
        raw: old.decode(name),
        records: records(old.decode(name)),
        expected: Buffer.from(old.decode(name)),
      });
    const section = sections.get(name),
      list = section.records[target.listNode],
      table = section.records[target.tableNode];
    assert.equal(table?.tag, 77);
    assert.equal(list?.tag, 72);
    assert.ok(target.listNode > target.tableNode && list.payload.length >= 34);
    assert.equal(list.level, table.level);
    const sourceId = list.payload.readUInt16LE(32),
      source = oldFills[sourceId - 1];
    assert.ok(source);
    const nextBody = records(next.decode(name)),
      ref = nextBody[target.listNode].payload.readUInt16LE(32);
    const expected = payload(source.payload, operations),
      key = `${sourceId}:${expected.toString('hex')}`;
    if (expected.equals(source.payload)) {
      assert.equal(ref, sourceId);
      continue;
    }
    assert.ok(ref > oldFills.length && ref <= nextFills.length, 'new clone reference');
    if (expectedClones.has(key))
      assert.equal(expectedClones.get(key), ref, 'identical owner intents share clone');
    else expectedClones.set(key, ref);
    assert.deepEqual(
      nextFills[ref - 1].payload,
      expected,
      'whole expected clone payload incl untouched tail',
    );
    if (clones.has(ref)) assert.equal(clones.get(ref), key, 'different intents cannot alias');
    else clones.set(ref, key);
    section.expected.writeUInt16LE(ref, list.payloadStart + 32);
  }
  assert.equal(nextFills.length, oldFills.length + clones.size, 'no unused resource clones');
  assert.equal(next.info.length, old.info.length + clones.size);
  const rest = next.info.filter((r) => r.tag !== 20 || nextFills.indexOf(r) < oldFills.length);
  old.info.forEach((r, i) => {
    const expected = Buffer.from(r.raw);
    if (r.tag === 17) expected.writeUInt32LE(nextFills.length, r.payloadStart - r.start + 32);
    assert.deepEqual(rest[i]?.raw, expected, `old DocInfo record ${i}`);
  });
  assert.deepEqual([...next.streams.keys()].sort(), [...old.streams.keys()].sort());
  for (const [name, bytes] of old.streams) {
    if (name === 'DocInfo') continue;
    if (sections.has(name))
      assert.deepEqual(
        next.decode(name),
        sections.get(name).expected,
        'only union of target list reference bytes',
      );
    else assert.deepEqual(next.streams.get(name), bytes, `untouched stream ${name}`);
  }
  return {
    owners: edits.length,
    clones: clones.size,
    originalResources: oldFills.length,
    streams: old.streams.size,
  };
}

function strictNewCfbMetadata(bytes) {
  const b = Buffer.from(bytes);
  assert.equal(b.subarray(0, 8).toString('hex'), 'd0cf11e0a1b11ae1');
  assert.equal(b.readUInt16LE(26), 3);
  assert.equal(b.readUInt16LE(28), 0xfffe);
  assert.equal(b.readUInt16LE(30), 9);
  assert.equal(b.readUInt16LE(32), 6);
  assert.equal(b.length % 512, 0);
  assert.equal(b.readUInt32LE(56), 4096);
  assert.equal(b.readUInt32LE(72), 0, 'small document requires no DIFAT chain');
  const sector = (id) => {
    assert.ok(id >= 0 && id < b.length / 512 - 1, 'CFB sector bound');
    return b.subarray((id + 1) * 512, (id + 2) * 512);
  };
  const count = b.readUInt32LE(44);
  assert.ok(count > 0 && count <= 109);
  const fat = Buffer.concat(
    Array.from({ length: count }, (_, i) => sector(b.readUInt32LE(76 + i * 4))),
  );
  let cursor = b.readUInt32LE(48);
  const seen = new Set(),
    parts = [];
  while (cursor !== 0xfffffffe) {
    assert.ok(!seen.has(cursor), 'CFB directory cycle');
    seen.add(cursor);
    parts.push(sector(cursor));
    assert.ok(cursor * 4 + 4 <= fat.length);
    cursor = fat.readUInt32LE(cursor * 4);
  }
  const directory = Buffer.concat(parts);
  let active = 0;
  for (let i = 0; i < directory.length; i += 128) {
    const d = directory.subarray(i, i + 128),
      kind = d[66];
    if (!kind) continue;
    assert.ok([1, 2, 5].includes(kind));
    assert.ok(d.readUInt16LE(64) >= 2 && d.readUInt16LE(64) <= 64);
    assert.deepEqual(
      d.subarray(80, 116),
      Buffer.alloc(36),
      'directory CLSID/state/times must be zero',
    );
    active++;
  }
  assert.equal(active, 5, 'root, BodyText and exactly three streams');
  return active;
}
export function verifyNewDocument(
  { format, bytes, expectedTexts = [''], strictMetadata = true },
  optimized = false,
) {
  if (format === 'hwpx')
    return pythonOracle(
      { mode: 'newDocument', bytes: Buffer.from(bytes).toString('base64'), expectedTexts },
      optimized,
    );
  assert.equal(format, 'hwp5');
  if (strictMetadata) strictNewCfbMetadata(bytes);
  const doc = document(bytes),
    names = [...doc.streams.keys()].sort();
  assert.deepEqual(names, ['BodyText/Section0', 'DocInfo', 'FileHeader']);
  const header = doc.streams.get('FileHeader');
  assert.equal(header.length, 256);
  assert.equal(header.readUInt32LE(32), 0x05000107);
  assert.equal(header.readUInt32LE(36), 0);
  const chars = doc.info.filter((r) => r.tag === 21);
  assert.equal(chars.length, 1);
  assert.equal(chars[0].payload.readUInt32LE(42), 1100, '11pt');
  const faces = doc.info.filter((r) => r.tag === 19);
  assert.equal(faces.length, 7);
  for (const face of faces) {
    const n = face.payload.readUInt16LE(1);
    assert.equal(face.payload.subarray(3, 3 + n * 2).toString('utf16le'), '함초롬바탕');
  }
  const body = records(doc.decode('BodyText/Section0')),
    pages = body.filter((r) => r.tag === 73);
  assert.equal(pages.length, 1);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => pages[0].payload.readUInt32LE(i * 4)),
    [59528, 84189, 5669, 5669, 5669, 5669, 2835, 2835],
  );
  const texts = body
    .filter((r) => r.tag === 67)
    .map((r) => {
      let text = '';
      const raw = r.payload;
      assert.equal(raw.length % 2, 0);
      for (let i = 0; i < raw.length;) {
        const unit = raw.readUInt16LE(i);
        if (unit === 2) {
          assert.ok(i + 16 <= raw.length);
          assert.equal(raw.readUInt16LE(i + 14), 2);
          i += 16;
        } else if (unit === 13) {
          assert.equal(i, raw.length - 2, 'sole paragraph terminator');
          i += 2;
        } else {
          assert.ok(unit >= 32, 'unexpected authored control');
          text += String.fromCharCode(unit);
          i += 2;
        }
      }
      return text;
    });
  assert.deepEqual(texts, expectedTexts, 'independent paragraph texts');
  assert.equal(body.filter((r) => r.tag === 66).length, expectedTexts.length);
  return {
    paragraphs: texts.length,
    fontHeight: 1100,
    page: [59528, 84189],
    author: null,
    streams: names,
    texts,
  };
}
