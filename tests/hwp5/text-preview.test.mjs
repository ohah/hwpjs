import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { constants, deflateRawSync, deflateSync, inflateRawSync, inflateSync } from "node:zlib";
import test from "node:test";
import { createCfbReader } from "../../js/cfb.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { decodeHwp5Text } from "../../js/hwp5-text-wire.mjs";
import { rawParagraphTexts } from "../../tools/hwp5-preview-record-oracle.mjs";

const wasm = readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url));
const fixture = name => readFileSync(new URL(`../../legacy/rust/crates/hwp-core/tests/fixtures/${name}`, import.meta.url));

test("HWP5 public preview preserves exact text-token bytes from two real files", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    for (const [name, expectedCount] of [["example.hwp", 15], ["footnote-endnote.hwp", 6]]) {
      const bytes = fixture(name);
      const result = hwp.readText(bytes);
      cfb.parse(bytes, { strict: true });
      assert.deepEqual(result.version, [5, 1, 0, 1]);
      assert.equal(result.sections.length, 1);
      const paragraphs = result.sections[0].paragraphs;
      assert.equal(paragraphs.length, expectedCount);
      if (name === "example.hwp") assert.equal(paragraphs.filter(p => !p.textPresent).length, 3);
      const header = cfb.findExact("/FileHeader").content;
      const encoded = cfb.findExact("/BodyText/Section0").content;
      const section = header[36] & 1 ? inflateRawSync(encoded) : encoded;
      const oracle = rawParagraphTexts(section);
      assert.equal(oracle.length, paragraphs.length);
      for (const [index, paragraph] of paragraphs.entries()) {
        assert.equal(paragraph.textPresent, oracle[index] !== null);
        assert.deepEqual(Buffer.concat(paragraph.tokens.map(t => Buffer.from(t.raw))), oracle[index] ?? Buffer.alloc(0));
      }
    }
    assert.equal(hwp.readText(fixture("example.hwp")).sections[0].paragraphs[0].text, "삼강오륜");
    assert.equal(hwp.readText(fixture("footnote-endnote.hwp")).sections[0].paragraphs[0].text, "각주참조");
  } finally {
    cfb.close();
    hwp.close();
  }
});

test("HWP5 preview accepts zlib-wrapped DocInfo and Section with strict envelope validation", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    const original = fixture("example.hwp");
    const expected = hwp.readText(original);
    cfb.parse(original, { strict: true });
    const document = cfb.document();
    const info = document.nodes.find(node => node.name === "DocInfo");
    const section = document.nodes.find(node => node.name === "Section0");
    assert.ok(info && section);
    const rawInfo = inflateRawSync(info.content);
    const rawSection = inflateRawSync(section.content);
    info.content = deflateSync(rawInfo);
    section.content = deflateSync(rawSection);
    assert.deepEqual(inflateSync(info.content), rawInfo);
    assert.deepEqual(inflateSync(section.content), rawSection);
    assert.deepEqual(hwp.readText(cfb.write(document)), expected);

    const valid = Buffer.from(section.content);
    section.content = Buffer.from(valid);
    section.content[section.content.length - 1] ^= 1;
    assert.throws(() => hwp.readText(cfb.write(document)), { message: "InvalidChecksum" });
    section.content = Buffer.concat([valid, Buffer.of(0)]);
    assert.throws(() => hwp.readText(cfb.write(document)), { message: "TrailingData" });
    section.content = valid;
    info.content = Buffer.from(info.content);
    info.content[1] ^= 1;
    assert.throws(() => hwp.readText(cfb.write(document)));
    assert.deepEqual(hwp.readText(original), expected);
  } finally {
    cfb.close();
    hwp.close();
  }
});

test("HWP5 preview agrees across zlib levels, strategies and window sizes", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    const original = fixture("example.hwp");
    const expected = hwp.readText(original);
    cfb.parse(original, { strict: true });
    const document = cfb.document();
    const info = document.nodes.find(node => node.name === "DocInfo");
    const section = document.nodes.find(node => node.name === "Section0");
    assert.ok(info && section);
    const rawInfo = inflateRawSync(info.content);
    const rawSection = inflateRawSync(section.content);
    let checked = 0;
    for (const level of [0, 1, 3, 6, 9]) {
      for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED, constants.Z_HUFFMAN_ONLY, constants.Z_RLE, constants.Z_FIXED]) {
        for (const windowBits of [9, 10, 11, 12, 13, 14, 15]) {
          const options = { level, strategy, windowBits };
          info.content = deflateSync(rawInfo, options);
          section.content = deflateSync(rawSection, options);
          assert.deepEqual(hwp.readText(cfb.write(document)), expected, JSON.stringify(options));
          checked++;
        }
      }
    }
    assert.equal(checked, 175);
  } finally {
    cfb.close();
    hwp.close();
  }
});

const wrappedCorpusFile = new URL("../../reference/hwpers/converted_output.hwp", import.meta.url);
test("observed wrapped HWP reaches its separately short DocumentProperties", { skip: !existsSync(wrappedCorpusFile) }, async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    const bytes = readFileSync(wrappedCorpusFile);
    cfb.parse(bytes, { strict: true });
    const info = cfb.findExact("/DocInfo").content;
    const section = cfb.findExact("/BodyText/Section0").content;
    assert.throws(() => inflateRawSync(info));
    assert.throws(() => inflateRawSync(section));
    const decodedInfo = inflateSync(info);
    assert.equal(decodedInfo.readUInt32LE(0) & 1023, 16);
    assert.equal(decodedInfo.readUInt32LE(0) >>> 20, 4);
    assert.equal(inflateSync(section).length, 8782);
    assert.throws(() => hwp.readText(bytes), { message: "InvalidDocumentPropertiesLength" });
  } finally {
    cfb.close();
    hwp.close();
  }
});

test("HWP5 preview repairs only observed CFB metadata without changing text", async () => {
  const bytes = fixture("example.hwp");
  const input = Buffer.from(bytes);
  const sectorSize = 1 << input.readUInt16LE(30);
  const sectors = input.length / sectorSize - 1;
  const root = (input.readUInt32LE(48) + 1) * sectorSize;
  const fat = (input.readUInt32LE(76) + 1) * sectorSize;
  input.writeBigUInt64LE(17n, root + 100);
  input.writeUInt32LE(0, fat + sectors * 4);
  const preview = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    const expected = preview.readText(bytes);
    assert.throws(() => cfb.parse(input, { strict: true }), /InvalidFat/);
    assert.deepEqual(preview.readText(input), expected);
    assert.deepEqual(bytes, fixture("example.hwp"));
    const broken = Buffer.from(input);
    broken.writeUInt32LE(0xffffffff, fat + input.readUInt32LE(76) * 4);
    assert.throws(() => preview.readText(broken), /InvalidFat/);
  } finally {
    preview.close();
    cfb.close();
  }
});

test("HWP5 preview skips unrelated malformed semantic records but keeps framing and text strict", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  const framed = (tag, level, payload) => {
    const out = Buffer.alloc(4 + payload.length);
    out.writeUInt32LE((payload.length << 20) | (level << 10) | tag, 0);
    Buffer.from(payload).copy(out, 4);
    return out;
  };
  try {
    const bytes = fixture("example.hwp");
    const original = hwp.readText(bytes);
    cfb.parse(bytes, { strict: true });
    const document = cfb.document();
    const info = document.nodes.find(node => node.name === "DocInfo");
    const section = document.nodes.find(node => node.name === "Section0");
    assert.ok(info && section);
    info.content = deflateRawSync(Buffer.concat([inflateRawSync(info.content), framed(21, 1, [0])]));
    section.content = deflateRawSync(Buffer.concat([inflateRawSync(section.content), framed(77, 0, [0])]));
    const malformedUnrelated = cfb.write(document);
    assert.deepEqual(hwp.readText(malformedUnrelated), original);

    section.content = deflateRawSync(Buffer.concat([inflateRawSync(section.content), Buffer.of(1)]));
    assert.throws(() => hwp.readText(cfb.write(document)), { message: "UnexpectedEnd" });
  } finally {
    cfb.close();
    hwp.close();
  }
});

test("HWP5 preview accepts complete base DocumentProperties without caret and rejects partial tails", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    const bytes = fixture("example.hwp");
    const expected = hwp.readText(bytes);
    cfb.parse(bytes, { strict: true });
    const document = cfb.document();
    const info = document.nodes.find(node => node.name === "DocInfo");
    assert.ok(info);
    const raw = inflateRawSync(info.content);
    const bits = raw.readUInt32LE(0);
    assert.equal(bits & 1023, 16);
    const oldLength = bits >>> 20;
    assert.ok(oldLength >= 26 && oldLength < 4095);
    for (const length of [4, 14, 13, 15, 25]) {
      const first = Buffer.from(raw.subarray(0, 4));
      first.writeUInt32LE((length << 20) | (bits & 0xfffff));
      info.content = deflateRawSync(Buffer.concat([first, raw.subarray(4, 4 + length), raw.subarray(4 + oldLength)]));
      const changed = cfb.write(document);
      if (length === 14) assert.deepEqual(hwp.readText(changed), expected);
      else assert.throws(() => hwp.readText(changed), { message: "InvalidDocumentPropertiesLength" });
    }
  } finally {
    cfb.close();
    hwp.close();
  }
});

test("HWP5 preview matches raw section text across all tracked HWP fixtures", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  const folder = new URL("../../legacy/rust/crates/hwp-core/tests/fixtures/", import.meta.url);
  const names = readdirSync(folder).filter(name => name.endsWith(".hwp")).sort();
  const expectedRejections = new Map([
    ["distribution.hwp", "UnsupportedDistribution"],
    ["viewtext.hwp", "UnsupportedDistribution"],
    ["password-12345.hwp", "UnsupportedEncryption"],
  ]);
  let accepted = 0;
  const versions = new Map();
  try {
    for (const name of names) {
      const bytes = readFileSync(new URL(name, folder));
      if (expectedRejections.has(name)) {
        assert.throws(() => hwp.readText(bytes), { message: expectedRejections.get(name) }, name);
        continue;
      }
      const result = hwp.readText(bytes);
      const version = result.version.slice(0, 2).join(".");
      versions.set(version, (versions.get(version) ?? 0) + 1);
      cfb.parse(bytes, { strict: true });
      const header = cfb.findExact("/FileHeader").content;
      for (const section of result.sections) {
        const encoded = cfb.findExact(`/BodyText/Section${section.index}`).content;
        const raw = header[36] & 1 ? inflateRawSync(encoded) : encoded;
        const oracle = rawParagraphTexts(raw);
        assert.equal(section.paragraphs.length, oracle.length, name);
        for (const [i, paragraph] of section.paragraphs.entries()) {
          assert.equal(paragraph.textPresent, oracle[i] !== null, name);
          assert.deepEqual(Buffer.concat(paragraph.tokens.map(token => Buffer.from(token.raw))), oracle[i] ?? Buffer.alloc(0), `${name} section ${section.index} paragraph ${i}`);
        }
      }
      accepted++;
    }
    assert.equal(names.length, 48);
    assert.equal(accepted, 45);
    assert.deepEqual([...versions].sort(), [["5.0", 12], ["5.1", 33]]);
  } finally {
    cfb.close();
    hwp.close();
  }
});

test("HWP5 preview rejects damaged and encrypted inputs without leaking result state", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    const first = hwp.readText(fixture("example.hwp"));
    assert.throws(() => hwp.readText(Uint8Array.of(1, 2, 3)));
    cfb.parse(fixture("example.hwp"), { strict: true });
    const document = cfb.document();
    const fileHeader = document.nodes.find(n => n.name === "FileHeader");
    assert.ok(fileHeader);
    fileHeader.content = Uint8Array.from(fileHeader.content);
    fileHeader.content[36] |= 2;
    const encrypted = cfb.write(document);
    assert.throws(() => hwp.readText(encrypted), { message: "UnsupportedEncryption" });
    assert.equal(first.sections[0].paragraphs[0].text, "삼강오륜");
    assert.equal(hwp.readText(fixture("example.hwp")).sections.length, 1);
  } finally {
    cfb.close();
    hwp.close();
  }
  assert.throws(() => hwp.readText(fixture("example.hwp")), { message: "ReaderClosed" });
});

test("HWP5 preview checks declared Section count and keeps all sections", async () => {
  const hwp = await createHwp5Reader(wasm);
  const cfb = await createCfbReader(wasm);
  try {
    cfb.parse(fixture("example.hwp"), { strict: true });
    const original = cfb.document();
    const infoNode = original.nodes.find(n => n.name === "DocInfo");
    const bodyIndex = original.nodes.findIndex(n => n.name === "BodyText");
    const section = original.nodes.find(n => n.name === "Section0" && n.parent === bodyIndex);
    assert.ok(infoNode && section && bodyIndex > 0);
    const info = inflateRawSync(infoNode.content);
    const view = new DataView(info.buffer, info.byteOffset, info.byteLength);
    let changed = false;
    for (let offset = 0; offset < info.length;) {
      const bits = view.getUint32(offset, true);
      offset += 4;
      let length = bits >>> 20;
      if (length === 4095) { length = view.getUint32(offset, true); offset += 4; }
      if ((bits & 1023) === 16) {
        view.setUint16(offset, 2, true);
        changed = true;
        break;
      }
      offset += length;
    }
    assert.ok(changed);
    infoNode.content = deflateRawSync(info);
    assert.throws(() => hwp.readText(cfb.write(original)), { message: "SectionCountMismatch" });
    original.nodes.push({ name: "Section1", parent: bodyIndex, content: section.content });
    const two = hwp.readText(cfb.write(original));
    assert.deepEqual(two.sections.map(s => s.index), [0, 1]);
    assert.equal(two.sections[1].paragraphs.length, two.sections[0].paragraphs.length);
    original.nodes.at(-1).name = "Section2";
    assert.throws(() => hwp.readText(cfb.write(original)), { message: "SectionCountMismatch" });
  } finally {
    cfb.close();
    hwp.close();
  }
});

test("HWP5 preview wire rejects truncation and trailing bytes", () => {
  const valid = Uint8Array.of(72, 53, 84, 49, 1, 0, 0, 5, 0, 0, 0, 0);
  assert.deepEqual(decodeHwp5Text(valid), { version: [5, 0, 0, 1], sections: [] });
  for (let n = 0; n < valid.length; n++) assert.throws(() => decodeHwp5Text(valid.subarray(0, n)));
  assert.throws(() => decodeHwp5Text(Uint8Array.from([...valid, 0])));
});

test("HWP5 text wire preserves a literal leading BOM code unit", () => {
  const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24];
  const bytes = Uint8Array.from([
    72, 53, 84, 49, ...u32(0x05010001), ...u32(1),
    ...u32(0), ...u32(1),
    ...u32(0), ...u32(0xffffffff), ...u32(1), ...u32(1), ...u32(1),
    ...u32(0), ...u32(0), ...u32(2), 0xff, 0xfe,
  ]);
  const paragraph = decodeHwp5Text(bytes).sections[0].paragraphs[0];
  assert.equal(paragraph.text, "\ufeff");
  assert.deepEqual([...paragraph.tokens[0].raw], [0xff, 0xfe]);
});
