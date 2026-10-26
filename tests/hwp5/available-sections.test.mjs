import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { sectionCountFixtures } from "./section-count-fixtures.mjs";

assert(process.env.HWPJS_TEST_WASM, "explicit available-section candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [name, version, declared, available, digest, paragraphs] of sectionCountFixtures)
  test(`explicit available-only preview never repairs or enables editing: ${name}`, async (t) => {
    const path = `reference/rhwp/samples/${name}`;
    if (!existsSync(path)) {
      t.skip("RHWP section-count reference is unavailable");
      return;
    }
    const input = readFileSync(path);
    assert.equal(hash(input), digest);
    const reader = await createHwp5Reader(wasm),
      cfb = await createCfbReader(wasm);
    try {
      const oracle = JSON.parse(
        execFileSync("python3", ["tools/hwp5-section-count-oracle.py"], { input, timeout: 30000 }),
      );
      assert.equal(oracle.version, version);
      assert.equal(oracle.properties.sectionCount, declared);
      assert.equal(oracle.bodySections.length, available);
      assert.throws(() => reader.readText(input), { message: "SectionCountMismatch" });
      const preview = reader.readAvailableText(input);
      assert.equal(preview.readOnly, true);
      assert.equal(preview.primarySource, "available_bodytext");
      assert.deepEqual(preview.sectionInventory, { declared, available, mismatch: true });
      assert.equal(preview.sections.length, available);
      assert.equal(
        preview.sections.reduce((sum, section) => sum + section.paragraphs.length, 0),
        paragraphs,
      );
      assert.throws(() => reader.readText(input), { message: "SectionCountMismatch" });
      assert.deepEqual(reader.readAvailableText(input), preview);
      cfb.parse(input);
      const document = cfb.document();
      document.nodes[0].created = 0n;
      const info = document.nodes.find((node) => node.parent === 0 && node.name === "DocInfo");
      const decoded = inflateRawSync(info.content);
      assert.equal(hash(decoded), oracle.docInfoSha256);
      const corrected = Buffer.from(decoded);
      corrected.writeUInt16LE(available, oracle.properties.offset);
      info.content = deflateRawSync(corrected);
      const canonical = cfb.write(document);
      const {
        readOnly: _previewReadOnly,
        primarySource: _previewPrimarySource,
        sectionInventory: _previewSectionInventory,
        ...body
      } = preview;
      assert.deepEqual(
        reader.readText(canonical),
        body,
        "explicit preview reads exactly the independently counted stored sections",
      );
      info.content = deflateRawSync(decoded);
      const strictCfb = cfb.write(document);
      await assert.rejects(createExperimentalHwp5Editor(wasm, strictCfb), /SectionCountMismatch/);
      for (const count of [0, 1025]) {
        const invalid = Buffer.from(decoded);
        invalid.writeUInt16LE(count, oracle.properties.offset);
        info.content = deflateRawSync(invalid);
        assert.throws(() => reader.readAvailableText(cfb.write(document)), {
          message: "InvalidSectionCount",
        });
      }
      info.content = deflateRawSync(decoded);
      const bodyNode = document.nodes.find((node) => node.parent === 0 && node.name === "BodyText");
      const parent = document.nodes.indexOf(bodyNode);
      const section = document.nodes.find(
        (node) => node.parent === parent && node.name === `Section${available - 1}`,
      );
      const originalName = section.name;
      section.name = `Section${available}`;
      assert.throws(() => reader.readAvailableText(cfb.write(document)), {
        message: "SectionCountMismatch",
      });
      section.name = originalName;
      assert.deepEqual(
        reader.readAvailableText(input),
        preview,
        "a failed query must not leave stale count metadata",
      );
      assert.equal(hash(input), digest);
      assert.deepEqual(readFileSync(path), input);
    } finally {
      reader.close();
      cfb.close();
    }
    assert.throws(() => reader.readAvailableText(input), { message: "ReaderClosed" });
  });

test("available-only reader is an optional native capability and never silently uses strict reading", async () => {
  for (const name of [
    "hwp5_text_read_available",
    "hwp5_text_declared_sections",
    "hwp5_text_distribution",
  ]) {
    const altered = Buffer.from(wasm),
      key = Buffer.from(name),
      offset = altered.indexOf(key);
    assert(offset >= 0);
    altered[offset] = "x".charCodeAt(0);
    const reader = await createHwp5Reader(altered);
    try {
      assert.throws(() => reader.readAvailableText(new Uint8Array()), {
        message: "AvailableSectionsPreviewUnavailable",
      });
    } finally {
      reader.close();
    }
  }
});
