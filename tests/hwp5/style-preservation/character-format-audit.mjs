// Unit-wise style oracle independent of the product's boundary mapper.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { inspect, records, paragraphRecords, encodeRecord, rust, verify as verifySplice } from "./text-oracle.mjs";

function expected(bytes, paragraph, start, end, id) {
  const p = paragraphRecords(bytes, paragraph), text = p.direct.find(r => r.tag === 67).payload;
  const run = p.direct.find(r => r.tag === 68).payload;
  const rows = Array.from({ length: run.length / 8 }, (_, i) => ({ at: run.readUInt32LE(i * 8), id: run.readUInt32LE(i * 8 + 4) }));
  const shapes = Array.from({ length: text.length / 2 + 1 }, (_, unit) => rows.findLast(r => r.at <= unit).id);
  if (shapes.slice(start, end).every(shape => shape === id)) return bytes;
  shapes.fill(id, start, end);
  const result = shapes.flatMap((shape, unit) => unit === 0 || shape !== shapes[unit - 1] ? [{ at: unit, id: shape }] : []);
  const payload = Buffer.alloc(result.length * 8);
  result.forEach((r, i) => { payload.writeUInt32LE(r.at, i * 8); payload.writeUInt32LE(r.id, i * 8 + 4); });
  const header = Buffer.from(p.head.payload);
  header.writeUInt16LE(result.length, 12); header.writeUInt16LE(0, 16);
  const edited = [Buffer.concat([p.head.raw.subarray(0, p.head.raw.length - p.head.payload.length), header])];
  for (const r of p.direct) if (r.tag !== 69) edited.push(encodeRecord(r.tag, r.level, r.tag === 68 ? payload : r.payload));
  return Buffer.concat([...p.all.slice(0, p.at).map(r => r.raw), ...edited, ...p.all.slice(p.end).map(r => r.raw)]);
}

function verify(before, after, paragraph, start, end, id) {
  const old = inspect(before), current = inspect(after);
  assert.deepEqual([...current.streams.keys()].sort(), [...old.streams.keys()].sort());
  assert.deepEqual(current.sections[0].bytes, expected(old.sections[0].bytes, paragraph, start, end, id), "character format complete Section");
  for (const [path, bytes] of old.streams) if (path !== old.sections[0].path) assert.deepEqual(current.streams.get(path), bytes);
  const jsonBefore = JSON.parse(rust.toJson(before)), jsonAfter = JSON.parse(rust.toJson(after));
  const bp = jsonBefore.body_text.sections[0].paragraphs[paragraph], ap = jsonAfter.body_text.sections[0].paragraphs[paragraph];
  assert.deepEqual(ap.text, bp.text);
  jsonBefore.body_text.sections[0].paragraphs[paragraph] = ap;
  assert.deepEqual(jsonAfter, jsonBefore);
}

export function auditCharacterFormat(probe, artifacts, fixture) {
  let edits = 0, refused = 0, counterexamples = 0, serial = 0;
  const run = (path, p, s, e, id, error, layout = "allow-stale-layout", section = 0) => {
    const output = join(artifacts, `character-format-${serial++}.hwp`);
    const result = spawnSync(probe, [path, output, String(section), String(p), String(s), String(e), String(id), "char-shape", layout], { encoding: "utf8", timeout: 30000 });
    if (result.error) throw result.error;
    assert.equal(result.signal, null);
    if (error) { assert.notEqual(result.status, 0); assert.match(result.stderr, error); assert(!existsSync(output)); refused++; return; }
    assert.equal(result.status, 0, result.stderr);
    const before = readFileSync(path), after = readFileSync(output);
    verify(before, after, p, s, e, id); edits++;
    return { bytes: after, path: output };
  };
  for (const name of ["charshape", "parashape", "linespacing", "facename", "underline-styles"]) {
    const path = `legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`, b = readFileSync(path);
    const section = inspect(b).sections[0].bytes;
    const eligible = records(section).filter(r => r.tag === 66).flatMap((r, i) => r.level === 0 && r.payload.readUInt32LE(4) === 0 && paragraphRecords(section, i).direct.some(child => child.tag === 67) ? [i] : []);
    assert(eligible.length > 0);
    for (const p of new Set([eligible[0], eligible[Math.floor(eligible.length / 2)], eligible.at(-1)])) {
      const n = paragraphRecords(section, p).direct.find(r => r.tag === 67).payload.length / 2 - 1;
      for (const [s, e] of [[0, n], [0, Math.min(1, n)], [Math.floor(n / 2), n], [n, n]]) run(path, p, s, e, 0);
    }
  }
  const path = "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", base = readFileSync(path);
  for (let s = 0; s <= 6; s++) for (let e = s; e <= 6; e++) for (const id of [0, 1, 2]) run(path, 1, s, e, id);
  const first = run(path, 1, 1, 5, 0);
  const second = run(first.path, 1, 2, 4, 1);
  const merged = run(second.path, 1, 0, 6, 0);
  const stable = run(merged.path, 1, 0, 6, 0, null, "require-layout");
  assert.deepEqual(stable.bytes, merged.bytes);
  const splicePath = join(artifacts, "format-then-splice.hwp");
  const spliced = spawnSync(probe, [second.path, splicePath, "0", "1", "2", "2", "😀", "reject", "allow-stale-layout"], { encoding: "utf8" });
  assert.equal(spliced.status, 0, spliced.stderr);
  verifySplice(second.bytes, readFileSync(splicePath), 0, 1, 2, 2, "😀");
  run(splicePath, 1, 2, 4, 0);
  run(splicePath, 1, 3, 4, 0, /SplitSurrogatePair/);
  run(path, 1, 2, 1, 0, /InvalidTextPosition/);
  run(path, 1, 0, 7, 0, /InvalidTextPosition/);
  run(path, 1, 0, 1, 0xffffffff, /InvalidResourceReference/);
  run(path, 1, 0, 1, 0, /LayoutReflowRequired/, "require-layout");
  run(path, 1, 0, 1, 0, /InvalidSection/, "allow-stale-layout", 99);
  run(path, 9999, 0, 1, 0, /InvalidParagraph/);
  run(path, 0, 0, 1, 0, /UnsupportedTextControl|UnsupportedParagraphRecord/);
  const rangeFixture = fixture(base, bytes => {
    const p = paragraphRecords(bytes, 1), h = Buffer.from(p.head.payload), ranges = Buffer.alloc(24);
    h.writeUInt16LE(2, 14);
    [[1, 4, 0x03000071], [3, 3, 0x04000082]].forEach(([s, e, t], i) => { ranges.writeUInt32LE(s, 12 * i); ranges.writeUInt32LE(e, 12 * i + 4); ranges.writeUInt32LE(t, 12 * i + 8); });
    return Buffer.concat([...p.all.slice(0, p.at).map(r => r.raw), encodeRecord(66, 0, h), ...p.direct.map(r => r.raw), encodeRecord(70, 1, ranges), ...p.all.slice(p.end).map(r => r.raw)]);
  }, "format-ranges");
  run(rangeFixture.path, 1, 1, 5, 0);
  for (const [name, error] of [
    ["unknown-root", /UnsupportedSectionRecord/],
    ["unknown-child", /UnsupportedSectionRecord/],
    ["header-tail", /UnsupportedParagraphExtension/],
    ["opaque-control", /UnsupportedSectionControl/],
    ["stale-count", /ParagraphTextCountMismatch/],
    ["stale-lines", /ParagraphMetadataCountMismatch/],
    ["missing-text", /UnsupportedMissingText/],
    ["invalid-unicode", /InvalidUnicodeEncoding/],
    ["duplicate-runs", /AmbiguousCharacterRuns/],
    ["invalid-shape", /InvalidResourceReference/],
  ]) run(join(artifacts, `${name}-input.hwp`), 1, 0, 1, 0, error);
  const nestedPath = "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp";
  const nested = 2;
  assert(paragraphRecords(inspect(readFileSync(nestedPath)).sections[0].bytes, nested).head.level > 0);
  // Nested formatting uses the independent raw Section oracle. Rust's root
  // paragraph JSON index is not the flat nested index used by this API.
  const nestedOut = join(artifacts, "nested-character-format.hwp");
  const nestedRun = spawnSync(probe, [nestedPath, nestedOut, "0", String(nested), "0", "1", "0", "char-shape", "allow-stale-layout"], { encoding: "utf8", timeout: 30000 });
  assert.equal(nestedRun.status, 0, nestedRun.stderr);
  const beforeNested = inspect(readFileSync(nestedPath)), afterNested = inspect(readFileSync(nestedOut));
  assert.deepEqual(afterNested.sections[0].bytes, expected(beforeNested.sections[0].bytes, nested, 0, 1, 0));
  for (const [path, bytes] of beforeNested.streams) if (path !== beforeNested.sections[0].path) assert.deepEqual(afterNested.streams.get(path), bytes);
  edits++;
  run(splicePath, 1, 2, 3, 0, /SplitSurrogatePair/);
  const foreign = fixture(base, bytes => Buffer.concat([bytes, encodeRecord(73, 0, Buffer.alloc(40)), encodeRecord(67, 1, Buffer.from("WITNESS\r", "utf16le"), true)]), "format-foreign-root");
  const last = records(inspect(base).sections[0].bytes).filter(r => r.tag === 66).length - 1;
  run(foreign.path, last, 0, 1, 0);
  run(foreign.path, 1, 1, 5, 0);
  assert.throws(() => verify(base, base, 1, 1, 5, 0), /character format complete Section/); counterexamples++;
  assert.throws(() => verify(base, first.bytes, 2, 1, 5, 0), /character format complete Section/); counterexamples++;
  console.log(JSON.stringify({ character_format: { real_files: 5, edits, refused, oracle_counterexamples: counterexamples } }));
}
