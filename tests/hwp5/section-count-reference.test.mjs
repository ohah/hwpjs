import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { createCfbReader } from '../../js/cfb.mjs';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

import { sectionCountFixtures as fixtures } from './section-count-fixtures.mjs';
const hash = (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');

for (const [name, version, declared, available, digest] of fixtures)
  test(`section count refusal is source metadata rather than different version offsets: ${name}`, async (t) => {
    const path = `reference/rhwp/samples/${name}`;
    if (!existsSync(path)) {
      t.skip('RHWP section-count fixture is unavailable');
      return;
    }
    const input = readFileSync(path);
    assert.equal(hash(input), digest, 'fixture identity changed');
    const normal = JSON.parse(
      execFileSync('python3', ['tools/hwp5-section-count-oracle.py'], { input, timeout: 30000 }),
    );
    const optimized = JSON.parse(
      execFileSync('python3', ['-O', 'tools/hwp5-section-count-oracle.py'], {
        input,
        timeout: 30000,
      }),
    );
    assert.deepEqual(normal, optimized);
    assert.equal(normal.inputSha256, digest);
    assert.equal(normal.version, version);
    assert.equal(normal.flags, 1);
    assert.equal(normal.properties.bytes, 26);
    assert.equal(normal.properties.sectionCount, declared);
    assert.deepEqual(
      normal.bodySections,
      Array.from({ length: available }, (_, index) => `BodyText/Section${index}`),
    );
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
    const cfb = await createCfbReader(wasm),
      reader = await createHwp5Reader(wasm);
    try {
      assert.throws(() => reader.readText(input), { message: 'SectionCountMismatch' });
      assert.throws(() => cfb.parse(input, { strict: true }), { message: 'InvalidFat' });
      // This permissive container query is cross-checked, not called strict-valid.
      const parsed = cfb.parse(input),
        root = parsed.FullPaths[0];
      const streams = normal.streams.map((row) => row.path).sort();
      const observed = [];
      for (const [index, entry] of parsed.FileIndex.entries()) {
        if (entry.type !== 2) continue;
        assert(parsed.FullPaths[index].startsWith(root));
        const path = parsed.FullPaths[index].slice(root.length);
        const expected = normal.streams.find((row) => row.path === path);
        assert(expected, `Unexpected stream: ${path}`);
        assert.equal(entry.content.length, expected.bytes);
        assert.equal(hash(entry.content), expected.sha256);
        observed.push(path);
      }
      assert.deepEqual(observed.sort(), streams);
      const document = cfb.document();
      // Memory-only counter-control: first canonicalize CFB administration alone.
      document.nodes[0].created = 0n;
      const canonical = cfb.write(document);
      cfb.parse(canonical, { strict: true });
      assert.throws(() => reader.readText(canonical), { message: 'SectionCountMismatch' });
      const info = document.nodes.find((node) => node.parent === 0 && node.name === 'DocInfo');
      assert(info);
      const decoded = inflateRawSync(info.content);
      assert.equal(hash(decoded), normal.docInfoSha256);
      assert.equal(decoded.readUInt16LE(normal.properties.offset), declared);
      const patched = Buffer.from(decoded);
      patched.writeUInt16LE(available, normal.properties.offset);
      info.content = deflateRawSync(patched);
      const repaired = cfb.write(document);
      const result = reader.readText(repaired);
      assert.equal(result.sections.length, available);
      // Every non-DocInfo stream remains byte-identical; no missing body is made up.
      const after = cfb.parse(repaired, { strict: true });
      assert.deepEqual(
        after.FileIndex.flatMap((entry, index) =>
          entry.type === 2 ? [after.FullPaths[index].slice(after.FullPaths[0].length)] : [],
        ).sort(),
        streams,
      );
      for (const [index, entry] of after.FileIndex.entries()) {
        if (entry.type !== 2) continue;
        const path = after.FullPaths[index].slice(after.FullPaths[0].length);
        if (path === 'DocInfo') {
          assert.deepEqual(inflateRawSync(Buffer.from(entry.content)), patched);
          continue;
        }
        assert.equal(
          hash(entry.content),
          normal.streams.find((row) => row.path === path)?.sha256,
          path,
        );
      }
      for (const [count, error] of [
        [available + 1, 'SectionCountMismatch'],
        [0, 'InvalidSectionCount'],
      ]) {
        const negative = Buffer.from(patched);
        negative.writeUInt16LE(count, normal.properties.offset);
        info.content = deflateRawSync(negative);
        assert.throws(() => reader.readText(cfb.write(document)), { message: error });
      }
      const shortProperties = Buffer.alloc(5);
      shortProperties.writeUInt32LE((1 << 20) | 16);
      shortProperties[4] = 1;
      info.content = deflateRawSync(shortProperties);
      const malformed = cfb.write(document);
      assert.throws(() => reader.readText(malformed), {
        message: 'InvalidDocumentPropertiesLength',
      });
      for (const flags of [[], ['-O']])
        assert.throws(
          () =>
            execFileSync('python3', [...flags, 'tools/hwp5-section-count-oracle.py'], {
              input: malformed,
              timeout: 30000,
            }),
          (error) => error.status === 1 && /Document properties framing/.test(String(error.stderr)),
        );
      assert.equal(hash(input), digest);
      assert.deepEqual(readFileSync(path), input);
      t.diagnostic(
        JSON.stringify({
          declared,
          available,
          paragraphs: result.sections.reduce((sum, section) => sum + section.paragraphs.length, 0),
          scope: 'memory-only counter-control, not production repair or complete recovery',
        }),
      );
    } finally {
      reader.close();
      cfb.close();
    }
  });
