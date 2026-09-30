import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { createCfbReader } from "../../../js/cfb.mjs";

const probe = resolve(process.argv[2]);
const artifacts = mkdtempSync(join(tmpdir(), "hwpjs-style-preservation-"));
const context = { module: { exports: {} }, require: createRequire(import.meta.url), Buffer, process };
runInNewContext(readFileSync("legacy/cfb.js", "utf8"), context);
const legacy = context.module.exports;
const rust = createRequire(import.meta.url)("../../../legacy/rust/packages/hwpjs/dist/index.js");
const writer = await createCfbReader(readFileSync("zig-out/bin/hwpjs.wasm"));

// Independent framing walk. No Zig-produced expected offsets or payloads.
function records(bytes) {
  const result = [];
  for (let offset = 0; offset < bytes.length;) {
    assert(offset + 4 <= bytes.length, "truncated record header");
    const start = offset, bits = bytes.readUInt32LE(offset);
    offset += 4;
    let length = bits >>> 20;
    if (length === 4095) {
      assert(offset + 4 <= bytes.length, "truncated extended size");
      length = bytes.readUInt32LE(offset);
      offset += 4;
    }
    assert(length <= bytes.length - offset, "truncated record payload");
    result.push({ tag: bits & 1023, level: (bits >>> 10) & 1023, start, payload: offset, end: offset + length });
    offset += length;
  }
  return result;
}

function inspect(input) {
  const cfb = legacy.parse(input);
  const streams = new Map();
  cfb.FileIndex.forEach((entry, i) => {
    if (entry.type === 2) streams.set(cfb.FullPaths[i].slice(cfb.FullPaths[0].length), Buffer.from(entry.content ?? []));
  });
  const header = streams.get("FileHeader");
  assert(header && header.length >= 256);
  const compressed = Boolean(header.readUInt32LE(36) & 1);
  const decode = value => compressed ? inflateRawSync(value, { maxOutputLength: 32 * 1024 * 1024 }) : value;
  const info = decode(streams.get("DocInfo"));
  const styleCount = records(info).filter(r => r.tag === 26).length;
  const sections = [...streams].filter(([path]) => /^BodyText\/Section\d+$/.test(path)).sort((a, b) => Number(a[0].slice(16)) - Number(b[0].slice(16)));
  return { streams, compressed, styleCount, sections: sections.map(([path, bytes]) => ({ path, bytes: decode(bytes) })) };
}

function headers(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (Object.hasOwn(value, "para_header")) out.push(value.para_header);
  for (const child of Object.values(value)) headers(child, out);
  return out;
}

function verify(beforeBytes, afterBytes, section, paragraph, style) {
  const before = inspect(beforeBytes), after = inspect(afterBytes);
  assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
  const target = before.sections[section];
  const heading = records(target.bytes).filter(r => r.tag === 66)[paragraph];
  assert(heading);
  const expected = Buffer.from(target.bytes);
  expected[heading.payload + 10] = style;
  assert.deepEqual(after.sections[section].bytes, expected, "only selected style byte may change");
  for (const [path, bytes] of before.streams) {
    if (path !== target.path) assert.deepEqual(after.streams.get(path), bytes, `unselected stream ${path}`);
  }
  const oldJson = JSON.parse(rust.toJson(beforeBytes));
  const newJson = JSON.parse(rust.toJson(afterBytes));
  const oldHeaders = headers(oldJson.body_text.sections[section]);
  const newHeaders = headers(newJson.body_text.sections[section]);
  assert.equal(oldHeaders.length, newHeaders.length);
  let changes = 0;
  for (let i = 0; i < oldHeaders.length; i++) {
    if (oldHeaders[i].para_style_id === newHeaders[i].para_style_id) continue;
    assert.equal(oldHeaders[i].para_style_id, target.bytes[heading.payload + 10]);
    assert.equal(newHeaders[i].para_style_id, style);
    oldHeaders[i].para_style_id = style;
    changes++;
  }
  // Rust can expose the same source paragraph in cell and control projections.
  // The independent byte oracle above fixes the exact source owner; every JSON
  // projection must then change only that reference, with all other data equal.
  assert(changes > 0, "Rust must observe the edited source paragraph");
  assert.deepEqual(newJson, oldJson, "Rust JSON must change only the selected paragraph style");
}

let edited = 0, refused = 0, nested = 0, unknownCases = 0, oracleCounterexamples = 0, uncompressedCases = 0, multiSectionCases = 0;
function run(inputPath, section, paragraph, style, permission, succeeds, label) {
  const output = join(artifacts, `${label}.hwp`);
  const result = spawnSync(probe, [inputPath, output, String(section), String(paragraph), String(style), permission], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, result.stderr);
  if (succeeds) assert.equal(result.status, 0, result.stderr);
  else {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LayoutReflowRequired|InvalidStyleReference|InvalidSection|InvalidParagraph|InvalidRecordHierarchy|ParagraphTextCountMismatch/);
    refused++;
    return null;
  }
  return readFileSync(output);
}

function inject(input, change, name, addWitness = true) {
  writer.parse(input, { strict: true });
  const doc = writer.document();
  const index = doc.nodes.findIndex(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
  const parsed = inspect(input), decoded = parsed.sections[0].bytes;
  const changed = change(decoded);
  doc.nodes[index].content = parsed.compressed ? deflateRawSync(changed) : changed;
  if (addWitness && !doc.nodes.some(n => n.name === "UnmodelledWitness" && n.parent === 0))
    doc.nodes.push({ name: "UnmodelledWitness", parent: 0, content: Buffer.from([0x90, 0x81, 0x72, 0x63]) });
  const bytes = Buffer.from(writer.write(doc));
  const path = join(artifacts, `${name}-input.hwp`);
  writeFileSync(path, bytes);
  return { bytes, path };
}

try {
  for (const name of ["example", "noori", "table", "footnote-endnote"]) {
    const path = `legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`, input = readFileSync(path), original = inspect(input);
    const paraRecords = records(original.sections[0].bytes).filter(r => r.tag === 66);
    for (const index of new Set([0, Math.floor(paraRecords.length / 2), paraRecords.length - 1])) {
      const old = original.sections[0].bytes[paraRecords[index].payload + 10];
      assert(original.styleCount > 1);
      const style = (old + 1) % original.styleCount;
      const after = run(path, 0, index, style, "allow-stale-layout", true, `${name}-${index}`);
      verify(input, after, 0, index, style);
      if (paraRecords[index].level > 0) nested++;
      edited++;
    }
    const firstStyle = original.sections[0].bytes[paraRecords[0].payload + 10];
    const noop = run(path, 0, 0, firstStyle, "require-layout", true, `${name}-noop`);
    assert.deepEqual(noop, input, "no edit must preserve the whole original file");
    run(path, 0, 0, (firstStyle + 1) % original.styleCount, "require-layout", false, `${name}-layout`);
  }

  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/example.hwp");
  const base = inspect(input), first = records(base.sections[0].bytes).find(r => r.tag === 66);
  const old = base.sections[0].bytes[first.payload + 10], style = (old + 1) % base.styleCount;

  // A generated ordinary-stream-uncompressed counterpart. BinData that used
  // document-default compression is made explicitly compressed, so clearing
  // FileHeader.compressed does not silently change its interpretation.
  writer.parse(input, { strict: true });
  const uncompressedDoc = writer.document();
  for (const node of uncompressedDoc.nodes) {
    if (node.name === "FileHeader" && node.parent === 0) {
      node.content = Buffer.from(node.content);
      node.content.writeUInt32LE(node.content.readUInt32LE(36) & ~1, 36);
    } else if ((node.name === "DocInfo" && node.parent === 0)
      || (/^Section\d+$/.test(node.name) && uncompressedDoc.nodes[node.parent]?.name === "BodyText")
      || (["DefaultJScript", "JScriptVersion"].includes(node.name) && uncompressedDoc.nodes[node.parent]?.name === "Scripts")) {
      node.content = inflateRawSync(node.content);
      if (node.name === "DocInfo") for (const record of records(node.content)) {
        if (record.tag !== 18) continue;
        const flags = node.content.readUInt16LE(record.payload);
        if (((flags >>> 4) & 3) === 0) node.content.writeUInt16LE(flags | 0x10, record.payload);
      }
    }
  }
  const uncompressedInput = Buffer.from(writer.write(uncompressedDoc));
  const uncompressedPath = join(artifacts, "uncompressed-input.hwp");
  writeFileSync(uncompressedPath, uncompressedInput);
  assert.equal(inspect(uncompressedInput).compressed, false);
  const uncompressedAfter = run(uncompressedPath, 0, 0, style, "allow-stale-layout", true, "uncompressed-edited");
  verify(uncompressedInput, uncompressedAfter, 0, 0, style);
  uncompressedCases++;

  // Identical source-node numbers in two sections must remain section-local.
  writer.parse(input, { strict: true });
  const multiDoc = writer.document();
  const bodyIndex = multiDoc.nodes.findIndex(n => n.kind === 1 && n.name === "BodyText" && n.parent === 0);
  const firstSection = multiDoc.nodes.find(n => n.name === "Section0" && n.parent === bodyIndex);
  multiDoc.nodes.push({ name: "Section1", parent: bodyIndex, content: firstSection.content });
  const infoNode = multiDoc.nodes.find(n => n.name === "DocInfo" && n.parent === 0);
  const info = inflateRawSync(infoNode.content), properties = records(info).find(r => r.tag === 16);
  info.writeUInt16LE(2, properties.payload);
  infoNode.content = deflateRawSync(info);
  const multiInput = Buffer.from(writer.write(multiDoc));
  const multiPath = join(artifacts, "two-sections-input.hwp");
  writeFileSync(multiPath, multiInput);
  assert.equal(inspect(multiInput).sections.length, 2);
  const multiAfter = run(multiPath, 1, 0, style, "allow-stale-layout", true, "two-sections-edited");
  verify(multiInput, multiAfter, 1, 0, style);
  multiSectionCases++;
  // Preserve an unknown extended-size root record and the first header's tail.
  const injected = inject(input, bytes => {
    const tail = Buffer.from([0x91, 0x82, 0x73, 0x64, 0x55, 0x46]);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(66 | ((first.end - first.payload + tail.length) << 20));
    const opaque = Buffer.alloc(8 + 5000, 0xa7);
    opaque.writeUInt32LE((0xfff << 20 | 1000) >>> 0);
    opaque.writeUInt32LE(5000, 4);
    return Buffer.concat([bytes.subarray(0, first.start), header, bytes.subarray(first.payload, first.end), tail, bytes.subarray(first.end), opaque]);
  }, "unknown-header-and-record");
  const after = run(injected.path, 0, 0, style, "allow-stale-layout", true, "unknown-edited");
  verify(injected.bytes, after, 0, 0, style);
  unknownCases++;

  // An unknown child before a paragraph makes record-node and paragraph ordinals diverge.
  const shifted = inject(input, bytes => {
    const opaque = Buffer.alloc(5);
    opaque.writeUInt32LE(1001 | (1 << 10) | (1 << 20));
    opaque[4] = 0xbb;
    return Buffer.concat([bytes.subarray(0, first.end), opaque, bytes.subarray(first.end)]);
  }, "shifted-binding");
  const shiftedRaw = inspect(shifted.bytes).sections[0].bytes;
  const heading = records(shiftedRaw).filter(r => r.tag === 66).at(-1);
  const lastIndex = records(shiftedRaw).filter(r => r.tag === 66).length - 1;
  const lastStyle = (shiftedRaw[heading.payload + 10] + 1) % base.styleCount;
  const shiftedAfter = run(shifted.path, 0, lastIndex, lastStyle, "allow-stale-layout", true, "shifted-edited");
  verify(shifted.bytes, shiftedAfter, 0, lastIndex, lastStyle);
  unknownCases++;

  // Reject a naive length-changing edit: payload framing changed, paragraph's
  // declared UTF-16 length was left stale. The source-preserving model must not
  // treat this as a valid document merely because all unknown bytes survived.
  const badText = inject(input, bytes => {
    const text = records(bytes).find(r => r.tag === 67);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(67 | (text.level << 10) | ((text.end - text.payload + 2) << 20));
    return Buffer.concat([bytes.subarray(0, text.start), header, bytes.subarray(text.payload, text.end), Buffer.from([65, 0]), bytes.subarray(text.end)]);
  }, "stale-text-length");
  run(badText.path, 0, 0, style, "allow-stale-layout", false, "stale-text-length-output");

  // Oracle adversarial controls: ignored edit, wrong owner and lost opaque
  // bytes must all fail even when the candidate is a readable canonical CFB.
  assert.throws(() => verify(injected.bytes, injected.bytes, 0, 0, style), /only selected style byte may change/);
  oracleCounterexamples++;
  const wrongOwner = inject(input, bytes => {
    const value = Buffer.from(bytes), other = records(value).filter(r => r.tag === 66)[1];
    value[other.payload + 10] = style;
    return value;
  }, "wrong-owner", false);
  assert.throws(() => verify(input, wrongOwner.bytes, 0, 0, style), /only selected style byte may change/);
  oracleCounterexamples++;
  const lostOpaque = inject(injected.bytes, bytes => {
    const value = Buffer.from(bytes);
    value[first.payload + 10] = style;
    value[value.length - 1] ^= 1;
    return value;
  }, "lost-opaque");
  assert.throws(() => verify(injected.bytes, lostOpaque.bytes, 0, 0, style), /only selected style byte may change/);
  oracleCounterexamples++;

  const originalPath = "legacy/rust/crates/hwp-core/tests/fixtures/example.hwp";
  run(originalPath, 0, 0, 255, "allow-stale-layout", false, "invalid-style");
  run(originalPath, 100, 0, 0, "allow-stale-layout", false, "invalid-section");
  run(originalPath, 0, 100000, 0, "allow-stale-layout", false, "invalid-paragraph");
  console.log(JSON.stringify({ real_files: 4, edited, nested, uncompressed_cases: uncompressedCases, multi_section_cases: multiSectionCases, unknown_cases: unknownCases, refused, oracle_counterexamples: oracleCounterexamples, independent_oracles: ["legacy CFB.js", "Node zlib", "Rust toJson"], artifacts }));
} finally {
  writer.close();
}
