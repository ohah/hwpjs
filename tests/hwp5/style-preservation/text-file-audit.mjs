import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";
import { createCfbReader } from "../../../js/cfb.mjs";
import { inspect, records, paragraphRecords, encodeRecord, verify } from "./text-oracle.mjs";
const probe = resolve(process.argv[2]);
const artifacts = mkdtempSync(join(tmpdir(), "hwpjs-text-splice-"));
const writer = await createCfbReader(readFileSync("zig-out/bin/hwpjs.wasm"));
let edited = 0, refused = 0, oracleCounterexamples = 0, synthetic = 0;

function run(path, paragraph, start, end, text, label, error, ranges = "reject", layout = "allow-stale-layout", section = 0) {
  const output = join(artifacts, `${label}.hwp`);
  const result = spawnSync(probe, [path, output, String(section), String(paragraph), String(start), String(end), text, ranges, layout], { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  if (error) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
    assert(!existsSync(output), "refused operation must not write an output file");
    refused++;
    return null;
  }
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(output);
}

function fixture(input, change, label, uncompressed = false, witness = false) {
  writer.parse(input, { strict: true });
  const doc = writer.document(), parsed = inspect(input);
  const node = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
  const decoded = change(parsed.sections[0].bytes);
  node.content = parsed.compressed && !uncompressed ? deflateRawSync(decoded) : decoded;
  if (uncompressed) {
    for (const n of doc.nodes) {
      if (n.name === "FileHeader" && n.parent === 0) {
        n.content = Buffer.from(n.content); n.content.writeUInt32LE(n.content.readUInt32LE(36) & ~1, 36);
      } else if (n.name === "DocInfo" && n.parent === 0) n.content = parsed.decode(n.content);
      else if (["DefaultJScript", "JScriptVersion"].includes(n.name) && doc.nodes[n.parent]?.name === "Scripts") n.content = parsed.decode(n.content);
    }
    // The chosen charshape fixture has no BinData inheriting compression.
    assert(!doc.nodes.some(n => doc.nodes[n.parent]?.name === "BinData" && n.content?.length));
  }
  if (witness) doc.nodes.push({ name: "UnknownWitness", parent: 0, content: Buffer.from([0x91, 0x82, 0x73]) });
  const bytes = Buffer.from(writer.write(doc)), path = join(artifacts, `${label}-input.hwp`);
  writeFileSync(path, bytes);
  return { bytes, path };
}

function replaceParagraph(bytes, index, transform) {
  const p = paragraphRecords(bytes, index);
  return Buffer.concat([...p.all.slice(0, p.at).map(r => r.raw), ...transform(p), ...p.all.slice(p.end).map(r => r.raw)]);
}

try {
  for (const name of ["charshape", "parashape", "linespacing", "facename", "underline-styles"]) {
    const path = `legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`, input = readFileSync(path), parsed = inspect(input);
    const candidates = records(parsed.sections[0].bytes).filter(r => r.tag === 66);
    const eligible = candidates.flatMap((r, i) => r.level === 0 && r.payload.readUInt32LE(4) === 0 && paragraphRecords(parsed.sections[0].bytes, i).direct.some(child => child.tag === 67) ? [i] : []);
    assert(eligible.length > 0);
    for (const paragraph of new Set([eligible[0], eligible[Math.floor(eligible.length / 2)], eligible.at(-1)])) {
      const p = paragraphRecords(parsed.sections[0].bytes, paragraph), text = p.direct.find(r => r.tag === 67).payload;
      const units = text.length / 2 - 1;
      for (const [start, end, addition, suffix] of [[0, 0, "한😀", "start"], [Math.floor(units / 2), Math.floor(units / 2), "Z", "middle"], [units, units, "끝", "end"], [0, Math.min(2, units), "", "delete"], [0, units, "", "empty"]]) {
        const after = run(path, paragraph, start, end, addition, `${name}-${paragraph}-${suffix}`);
        verify(input, after, 0, paragraph, start, end, addition); edited++;
      }
      const noop = run(path, paragraph, 0, 0, "", `${name}-${paragraph}-noop`, null, "reject", "require-layout");
      assert.deepEqual(noop, input);
    }
  }
  const basePath = "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", base = readFileSync(basePath);
  const check = (f, paragraph, start, end, text, label, ranges = "reject") => {
    const after = run(f.path, paragraph, start, end, text, label, null, ranges);
    verify(f.bytes, after, 0, paragraph, start, end, text); synthetic++; return after;
  };
  const plain = fixture(base, b => b, "uncompressed", true);
  check(plain, 1, 1, 2, "😀", "uncompressed-edit");
  const long = check({ path: basePath, bytes: base }, 1, 0, 0, "가".repeat(2200), "extended-growth");
  const longPath = join(artifacts, "extended-growth.hwp");
  check({ path: longPath, bytes: long }, 1, 0, 2200, "", "extended-shrink");
  assert(records(inspect(long).sections[0].bytes).some(r => r.tag === 67 && r.raw.length - r.payload.length === 8));
  const ranges = fixture(base, bytes => replaceParagraph(bytes, 1, p => {
    const header = Buffer.from(p.head.payload); header.writeUInt16LE(3, 14);
    const payload = Buffer.alloc(36);
    [[0, 6, 0x03000071], [1, 4, 0x04000082], [3, 3, 0x05000093]].forEach(([s, e, t], i) => { payload.writeUInt32LE(s, i * 12); payload.writeUInt32LE(e, i * 12 + 4); payload.writeUInt32LE(t, i * 12 + 8); });
    return [encodeRecord(66, 0, header), ...p.direct.map(r => r.raw), encodeRecord(70, 1, payload)];
  }), "ranges");
  run(ranges.path, 1, 2, 4, "X", "range-default-refusal", /UnsupportedRangeSemantics/);
  for (const [s, e, text] of [[0, 0, "한"], [2, 4, "😀"], [0, 6, ""], [4, 4, "X"]]) check(ranges, 1, s, e, text, `ranges-${s}-${e}`, "half-open");
  const high = fixture(base, bytes => replaceParagraph(bytes, 1, p => {
    const header = Buffer.from(p.head.payload); header.writeUInt32LE((header.readUInt32LE(0) | 0x80000000) >>> 0, 0);
    return [encodeRecord(66, 0, header, true), ...p.direct.map(r => r.raw)];
  }), "high-bit");
  check(high, 1, 0, 0, "X", "high-bit-edit");
  const witness = fixture(base, b => b, "witness", false, true);
  check(witness, 1, 0, 0, "X", "witness-edit");
  writer.parse(base, { strict: true });
  const multiDoc = writer.document(), original = inspect(base);
  const bodyIndex = multiDoc.nodes.findIndex(n => n.kind === 1 && n.name === "BodyText" && n.parent === 0);
  multiDoc.nodes.push({ name: "Section1", parent: bodyIndex, content: multiDoc.nodes.find(n => n.name === "Section0" && n.parent === bodyIndex).content });
  const info = multiDoc.nodes.find(n => n.name === "DocInfo" && n.parent === 0), decodedInfo = original.decode(info.content);
  const properties = records(decodedInfo).find(r => r.tag === 16);
  decodedInfo.writeUInt16LE(2, properties.start + properties.raw.length - properties.payload.length);
  info.content = original.compressed ? deflateRawSync(decodedInfo) : decodedInfo;
  const multiBytes = Buffer.from(writer.write(multiDoc)), multiPath = join(artifacts, "two-sections-input.hwp");
  writeFileSync(multiPath, multiBytes);
  const multiOutput = run(multiPath, 1, 0, 0, "한😀", "two-sections-edit", null, "reject", "allow-stale-layout", 1);
  verify(multiBytes, multiOutput, 1, 1, 0, 0, "한😀"); synthetic++;
  writer.parse(multiBytes, { strict: true });
  const opaqueDoc = writer.document(), opaqueSection = opaqueDoc.nodes.find(n => n.name === "Section1" && opaqueDoc.nodes[n.parent]?.name === "BodyText");
  opaqueSection.content = deflateRawSync(Buffer.concat([inspect(multiBytes).sections[1].bytes, encodeRecord(1000, 0, Buffer.from([0x81]))]));
  const opaquePath = join(artifacts, "other-section-opaque-input.hwp");
  writeFileSync(opaquePath, Buffer.from(writer.write(opaqueDoc)));
  run(opaquePath, 1, 0, 0, "X", "other-section-opaque-refused", /UnsupportedSectionRecord/);
  // Exhaust every start/end boundary and insertion position of the six-unit
  // mixed-style real paragraph, rather than only its first/middle/last points.
  let boundaryCases = 0;
  for (let start = 0; start <= 6; start++) for (let end = start; end <= 6; end++) {
    for (const text of ["", "한😀"]) {
      const output = run(basePath, 1, start, end, text, `boundary-${start}-${end}-${text.length}`);
      verify(base, output, 0, 1, start, end, text); boundaryCases++;
    }
  }

  const refuseFixture = (label, change, expected) => {
    const f = fixture(base, change, label);
    run(f.path, 1, 0, 0, "X", `${label}-refused`, expected);
  };
  refuseFixture("unknown-root", b => Buffer.concat([b, encodeRecord(1000, 0, Buffer.from([1]))]), /UnsupportedSectionRecord/);
  refuseFixture("unknown-child", b => replaceParagraph(b, 1, p => [p.head.raw, ...p.direct.map(r => r.raw), encodeRecord(1001, 1, Buffer.from([2]))]), /UnsupportedSectionRecord/);
  refuseFixture("header-tail", b => replaceParagraph(b, 1, p => [encodeRecord(66, 0, Buffer.concat([p.head.payload, Buffer.from([3, 4])])), ...p.direct.map(r => r.raw)]), /UnsupportedParagraphExtension/);
  refuseFixture("opaque-control", b => {
    const all = records(b), ctrl = all.find(r => r.tag === 71), payload = Buffer.from(ctrl.payload);
    payload.writeUInt32LE(0x25787266, 0); // %xrf, a known field kind with opaque references.
    return Buffer.concat(all.map(r => r === ctrl ? encodeRecord(r.tag, r.level, payload) : r.raw));
  }, /UnsupportedSectionControl/);
  refuseFixture("stale-count", b => replaceParagraph(b, 1, p => { const h = Buffer.from(p.head.payload); h.writeUInt32LE(99, 0); return [encodeRecord(66, 0, h), ...p.direct.map(r => r.raw)]; }), /ParagraphTextCountMismatch/);
  refuseFixture("stale-lines", b => replaceParagraph(b, 1, p => { const h = Buffer.from(p.head.payload); h.writeUInt16LE(9, 16); return [encodeRecord(66, 0, h), ...p.direct.map(r => r.raw)]; }), /ParagraphMetadataCountMismatch/);
  refuseFixture("missing-text", b => replaceParagraph(b, 1, p => [p.head.raw, ...p.direct.filter(r => r.tag !== 67).map(r => r.raw)]), /UnsupportedMissingText/);
  refuseFixture("invalid-unicode", b => replaceParagraph(b, 1, p => p.all.slice(p.at, p.end).map(r => { if (r.tag !== 67) return r.raw; const v = Buffer.from(r.payload); v.writeUInt16LE(0xdc00, 0); return encodeRecord(67, 1, v); })), /InvalidUnicodeEncoding/);
  refuseFixture("duplicate-runs", b => replaceParagraph(b, 1, p => p.all.slice(p.at, p.end).map(r => { if (r.tag !== 68) return r.raw; const v = Buffer.from(r.payload); v.writeUInt32LE(0, 8); return encodeRecord(68, 1, v); })), /AmbiguousCharacterRuns/);
  refuseFixture("invalid-shape", b => replaceParagraph(b, 1, p => p.all.slice(p.at, p.end).map(r => { if (r.tag !== 68) return r.raw; const v = Buffer.from(r.payload); v.writeUInt32LE(0xffffffff, 4); return encodeRecord(68, 1, v); })), /InvalidResourceReference/);
  run(basePath, 1, 0, 0, "\n", "control-refused", /UnsupportedTextControl/);
  run(basePath, 1, 0, 999, "", "terminator-refused", /InvalidTextPosition/);
  run(basePath, 0, 0, 0, "X", "section-control-refused", /UnsupportedTextControl|UnsupportedParagraphRecord/);
  run(basePath, 1, 0, 0, "X", "layout-refused", /LayoutReflowRequired/, "reject", "require-layout");
  const unicodeAfter = run(basePath, 1, 0, 0, "😀", "unicode-first");
  const unicodePath = join(artifacts, "unicode-first.hwp");
  verify(base, unicodeAfter, 0, 1, 0, 0, "😀"); synthetic++;
  run(unicodePath, 1, 1, 1, "X", "surrogate-refused", /SplitSurrogatePair/);
  run(basePath, 1, 0, 0, "X", "section-refused", /InvalidSection/, "reject", "allow-stale-layout", 99);
  run(basePath, 99999, 0, 0, "X", "paragraph-refused", /InvalidParagraph/);
  const nestedPath = "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp";
  const nested = records(inspect(readFileSync(nestedPath)).sections[0].bytes).filter(r => r.tag === 66).findIndex(r => r.level > 0);
  assert(nested >= 0);
  run(nestedPath, nested, 0, 0, "X", "nested-refused", /UnsupportedNestedParagraph/);

  // Challenge the oracle with actual CFB fixtures, not only tiny expectation arrays.
  assert.throws(() => verify(base, base, 0, 1, 0, 0, "X"), /complete Section/); oracleCounterexamples++;
  const wrongOwner = run(basePath, 2, 0, 0, "X", "wrong-owner");
  assert.throws(() => verify(base, wrongOwner, 0, 1, 0, 0, "X"), /complete Section/); oracleCounterexamples++;
  const good = run(basePath, 1, 0, 0, "X", "oracle-good");
  const damaged = fixture(good, b => replaceParagraph(b, 1, p => p.all.slice(p.at, p.end).map(r => { if (r.tag !== 68) return r.raw; const v = Buffer.from(r.payload); v.writeUInt32LE(v.readUInt32LE(4) + 1, 4); return encodeRecord(68, 1, v); })), "wrong-style");
  assert.throws(() => verify(base, damaged.bytes, 0, 1, 0, 0, "X"), /complete Section/); oracleCounterexamples++;
  console.log(JSON.stringify({ real_files: 5, edited, synthetic, boundary_cases: boundaryCases, refused, oracle_counterexamples: oracleCounterexamples, independent_oracles: ["legacy CFB.js", "Node zlib and unit-wise styles", "Rust toJson"], artifacts }));
} finally { writer.close(); }
