import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { sectionCountFixtures } from "./section-count-fixtures.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inspect = (input) =>
  JSON.parse(
    execFileSync("python3", ["tools/hwp5-section-count-oracle.py"], {
      input,
      timeout: 30000,
      maxBuffer: 64 * 1024 * 1024,
    }),
  );

for (const [name, version, declared, available, digest, paragraphs] of sectionCountFixtures) {
  test(`native available-section copy preserves independent stream inventory: ${name}`, async (t) => {
    const cli = process.env.HWPJS_SECTION_COPY_CLI;
    const path = `reference/rhwp/samples/${name}`;
    if (!cli || !existsSync(path)) {
      t.skip("Explicit native copy CLI and reference fixture required");
      return;
    }
    const input = readFileSync(path);
    assert.equal(hash(input), digest);
    const output = execFileSync(cli, [path], { timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
    const before = inspect(input),
      after = inspect(output);
    assert.equal(before.version, version);
    assert.equal(before.properties.sectionCount, declared);
    assert.equal(after.properties.sectionCount, available);
    assert.equal(after.flags, before.flags);
    assert.equal(after.version, before.version);
    assert.deepEqual(after.bodySections, before.bodySections);
    assert.deepEqual(
      after.streams.map((row) => row.path),
      before.streams.map((row) => row.path),
    );
    for (const row of before.streams) {
      if (row.path !== "DocInfo")
        assert.deepEqual(
          after.streams.find((item) => item.path === row.path),
          row,
        );
    }
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
    const cfb = await createCfbReader(wasm),
      reader = await createHwp5Reader(wasm);
    try {
      const decodedInfo = (bytes, strict) => {
        const parsed = cfb.parse(bytes, { strict });
        const root = parsed.FullPaths[0];
        const index = parsed.FullPaths.indexOf(`${root}DocInfo`);
        assert(index >= 0);
        return inflateRawSync(Buffer.from(parsed.FileIndex[index].content));
      };
      const original = decodedInfo(input, false);
      const expected = Buffer.from(original);
      expected.writeUInt16LE(available, before.properties.offset);
      const actual = decodedInfo(output, true);
      assert.deepEqual(actual, expected, "Only the source-bound section counter may change");
      const wrong = Buffer.from(original);
      wrong.writeUInt16LE(available + 1, before.properties.offset);
      assert.notDeepEqual(actual, wrong, "Wrong count negative control");
      const wrongOffset = Buffer.from(original);
      wrongOffset.writeUInt16LE(available, before.properties.offset + 2);
      assert.notDeepEqual(actual, wrongOffset, "Wrong offset negative control");
      assert.throws(() => reader.readText(input), { message: "SectionCountMismatch" });
      const result = reader.readText(output);
      assert.equal(result.sections.length, available);
      assert.equal(
        result.sections.reduce((sum, section) => sum + section.paragraphs.length, 0),
        paragraphs,
      );
      assert.deepEqual(readFileSync(path), input);
      t.diagnostic(
        `declared=${declared}, available=${available}, paragraphs=${paragraphs}; independent streams and exact DocInfo patch verified`,
      );
    } finally {
      reader.close();
      cfb.close();
    }
  });
}
