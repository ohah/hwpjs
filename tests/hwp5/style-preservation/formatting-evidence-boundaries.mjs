import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import {
  preserveInactiveGridSnapReset as proof,
  verify,
  expected,
} from '../../../tools/formatting-evidence/hwp5-oracle.mjs';
import { inspect, records, paragraphRecords, encodeRecord } from './text-record-oracle.mjs';

export function runBoundaryChecks(root) {
  const read = (n) => readFileSync(join(root, 'hwp5-reset-paragraph', n));
  const source = read('source'),
    edited = read('edited'),
    command = JSON.parse(read('metadata.json')).command,
    original = inspect(source),
    target = paragraphRecords(original.sections[0].bytes, command.paragraph),
    shapes = records(original.decode(original.streams.get('DocInfo'))).filter((r) => r.tag === 25),
    before = shapes[target.head.payload.readUInt16LE(8)].payload,
    after = shapes[2].payload,
    results = [];
  function test(name, fn) {
    try {
      fn();
      results.push({ name, pass: true });
    } catch (e) {
      results.push({ name, pass: false, error: e.stack });
    }
  }
  const definition = (r) => r.tag === 71 && r.payload.subarray(0, 4).toString('ascii') === 'dces';
  function view(change) {
    const values = change(records(original.sections[0].bytes));
    return {
      ...original,
      sections: [{ ...original.sections[0], bytes: Buffer.concat(values.map((r) => r.raw)) }],
    };
  }
  function gridChange(fn) {
    return view((rows) =>
      rows.map((r) => {
        if (!definition(r)) return r;
        const p = Buffer.from(r.payload);
        fn(p);
        return { ...r, payload: p, raw: encodeRecord(r.tag, r.level, p) };
      }),
    );
  }
  test('inactive explicit grid and snap-only source proof', () =>
    assert.equal(proof(original, command, before, after), true));
  test('missing grid definition denied', () =>
    assert.equal(
      proof(
        view((rows) => rows.filter((r) => !definition(r))),
        command,
        before,
        after,
      ),
      false,
    ));
  test('truncated grid definition denied', () =>
    assert.equal(
      proof(
        view((rows) =>
          rows.map((r) =>
            definition(r)
              ? { ...r, raw: encodeRecord(r.tag, r.level, r.payload.subarray(0, 11)) }
              : r,
          ),
        ),
        command,
        before,
        after,
      ),
      false,
    ));
  test('duplicate grid definitions denied', () =>
    assert.equal(
      proof(
        view((rows) => [...rows, rows.find(definition)]),
        command,
        before,
        after,
      ),
      false,
    ));
  test('active line grid denied', () =>
    assert.equal(
      proof(
        gridChange((p) => p.writeUInt16LE(1, 10)),
        command,
        before,
        after,
      ),
      false,
    ));
  test('active character grid denied', () =>
    assert.equal(
      proof(
        gridChange((p) => p.writeUInt16LE(1, 12)),
        command,
        before,
        after,
      ),
      false,
    ));
  test('unknown section flags denied', () =>
    assert.equal(
      proof(
        gridChange((p) => p.writeUInt32LE(0x80000000, 4)),
        command,
        before,
        after,
      ),
      false,
    ));
  test('other geometry single flag bit denied', () => {
    const p = Buffer.from(after);
    p[0] ^= 4;
    assert.equal(proof(original, command, before, p), false);
  });
  test('other geometry margin byte denied', () => {
    const p = Buffer.from(after);
    p[4] ^= 1;
    assert.equal(proof(original, command, before, p), false);
  });
  test('other reset scope denied', () =>
    assert.equal(
      proof(
        original,
        { ...command, patch: { reset: { basis: 'paragraph-style', scope: 'all' } } },
        before,
        after,
      ),
      false,
    ));
  function mutateSaved(fn) {
    // Preserve directory metadata, FAT/MiniFAT and unrelated streams byte-for-byte.
    const input = edited,
      output = Buffer.from(input),
      ss = 2 ** input.readUInt16LE(30),
      ms = 2 ** input.readUInt16LE(32);
    assert.equal(input.readUInt32LE(72), 0, 'fixture has no DIFAT extension');
    const fatIds = Array.from({ length: input.readUInt32LE(44) }, (_, i) =>
      input.readUInt32LE(76 + 4 * i),
    );
    const sector = (id) => input.subarray((id + 1) * ss, (id + 2) * ss),
      fat = Buffer.concat(fatIds.map(sector));
    function chain(start, table) {
      const ids = [],
        seen = new Set();
      for (let id = start; id !== 0xfffffffe; id = table.readUInt32LE(id * 4)) {
        assert(id < 0xfffffffa && id * 4 + 4 <= table.length && !seen.has(id));
        seen.add(id);
        ids.push(id);
      }
      return ids;
    }
    const dirs = chain(input.readUInt32LE(48), fat),
      directory = Buffer.concat(dirs.map(sector)),
      entries = [];
    for (let at = 0; at + 128 <= directory.length; at += 128) {
      const row = directory.subarray(at, at + 128),
        len = row.readUInt16LE(64);
      if (len >= 2 && row[66] !== 0)
        entries.push({
          at,
          type: row[66],
          name: row.subarray(0, len - 2).toString('utf16le'),
          start: row.readUInt32LE(116),
          size: Number(row.readBigUInt64LE(120)),
        });
    }
    const target = entries.filter((r) => r.name === 'Section0' && r.type === 2);
    assert.equal(target.length, 1);
    const entry = target[0],
      rootEntry = entries.find((r) => r.type === 5);
    assert(rootEntry);
    let offsets, unit;
    if (entry.size < input.readUInt32LE(56)) {
      const minifat = Buffer.concat(chain(input.readUInt32LE(60), fat).map(sector));
      const roots = chain(rootEntry.start, fat);
      unit = ms;
      offsets = chain(entry.start, minifat).map((id) => {
        const at = id * ms,
          outer = Math.floor(at / ss);
        assert(outer < roots.length);
        return (roots[outer] + 1) * ss + (at % ss);
      });
    } else {
      unit = ss;
      offsets = chain(entry.start, fat).map((id) => (id + 1) * ss);
    }
    const compressed = Buffer.concat(offsets.map((at) => input.subarray(at, at + unit))).subarray(
        0,
        entry.size,
      ),
      raw = inflateRawSync(compressed),
      changed = fn(Buffer.from(raw)),
      packed = deflateRawSync(changed);
    assert(packed.length <= offsets.length * unit, 'mutation must fit existing allocated chain');
    for (let at = 0; at < packed.length; at += unit)
      packed.copy(output, offsets[Math.floor(at / unit)], at, Math.min(at + unit, packed.length));
    const entryLogical = entry.at + 120,
      entryPhysical = (dirs[Math.floor(entryLogical / ss)] + 1) * ss + (entryLogical % ss);
    output.writeBigUInt64LE(BigInt(packed.length), entryPhysical);
    const observed = inspect(output),
      unchanged = inspect(input);
    assert.deepEqual(observed.metadata, unchanged.metadata, 'mutation preserves CFB metadata');
    assert.deepEqual(
      [...observed.streams.keys()],
      [...unchanged.streams.keys()],
      'mutation preserves stream list',
    );
    for (const [name, bytes] of unchanged.streams)
      if (name !== 'BodyText/Section0')
        assert.deepEqual(
          observed.streams.get(name),
          bytes,
          'mutation preserves unrelated stream ' + name,
        );
    return output;
  }
  test('target cache-only tampering rejected', () => {
    const changed = mutateSaved((bytes) => {
      const p = paragraphRecords(bytes, command.paragraph),
        r = p.direct.find((r) => r.tag === 69);
      assert(r);
      bytes[r.start + 4 + 8] ^= 1;
      return bytes;
    });
    assert.throws(() => verify(source, changed, command), /entire section/);
  });
  test('non-target paragraph reference tampering rejected', () => {
    const changed = mutateSaved((bytes) => {
      const p = paragraphRecords(bytes, 0);
      bytes.writeUInt16LE(
        (p.head.payload.readUInt16LE(8) + 1) % shapes.length,
        p.head.start + 4 + 8,
      );
      return bytes;
    });
    assert.throws(() => verify(source, changed, command), /entire section/);
  });
  for (const value of [1, -1, 'wrong', true, '0', null, undefined])
    test('invalid section rejected ' + String(value), () =>
      assert.throws(
        () => verify(source, edited, { ...command, section: value }),
        /invalid source section/,
      ),
    );
  return {
    tests: results,
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
  };
}

export function runCallsiteChecks(root) {
  const input = inspect(readFileSync(join(root, 'hwp5-reset-paragraph/source'))),
    command = JSON.parse(readFileSync(join(root, 'hwp5-reset-paragraph/metadata.json'))).command,
    results = [];
  function check(name, view, count) {
    const plan = expected(view, command),
      p = paragraphRecords(plan.section, command.paragraph);
    assert.equal(p.direct.filter((r) => r.tag === 69).length, count);
    assert.equal(p.head.payload.readUInt16LE(16), count);
    results.push({ name, pass: true, expectedLineCacheRecords: count });
  }
  function view(change) {
    return {
      ...input,
      sections: [
        {
          ...input.sections[0],
          bytes: Buffer.concat(change(records(input.sections[0].bytes)).map((r) => r.raw)),
        },
      ],
    };
  }
  function changedGrid(offset) {
    return view((rows) =>
      rows.map((r) => {
        if (r.tag !== 71 || r.payload.subarray(0, 4).toString('ascii') !== 'dces') return r;
        const p = Buffer.from(r.payload);
        p.writeUInt16LE(1, offset);
        return { ...r, raw: encodeRecord(r.tag, r.level, p) };
      }),
    );
  }
  check('inactive source retains complete line cache', input, 1);
  check('active line grid still expects cache deletion', changedGrid(10), 0);
  check('active character grid still expects cache deletion', changedGrid(12), 0);
  check(
    'missing source grid still expects cache deletion',
    view((rows) =>
      rows.filter((r) => !(r.tag === 71 && r.payload.subarray(0, 4).toString('ascii') === 'dces')),
    ),
    0,
  );
  let ordinal = 0;
  const originalInfo = input.streams.get('DocInfo'),
    info = Buffer.concat(
      records(input.decode(originalInfo)).map((r) => {
        if (r.tag !== 25) return r.raw;
        if (ordinal++ !== 2) return r.raw;
        const p = Buffer.from(r.payload);
        p[4] ^= 1;
        return encodeRecord(r.tag, r.level, p);
      }),
    );
  check(
    'other geometry bit still expects cache deletion',
    { ...input, decode: (bytes) => (bytes === originalInfo ? info : input.decode(bytes)) },
    0,
  );
  return { tests: results, pass: results.length, fail: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2),
      at = argv.indexOf('--evidence-dir');
    assert(at >= 0 && argv[at + 1], 'explicit --evidence-dir required');
    const result = argv.includes('--callsite')
      ? runCallsiteChecks(argv[at + 1])
      : runBoundaryChecks(argv[at + 1]);
    console.log(JSON.stringify(result));
    if (result.fail) process.exitCode = 1;
  } catch (error) {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  }
}
