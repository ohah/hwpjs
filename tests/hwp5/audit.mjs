import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  deflateRawSync,
  inflateRawSync,
  deflateSync,
  gzipSync,
  constants,
} from "node:zlib";
import { createCfbReader } from "../../js/cfb.mjs";
import { checkDocinfo, checkDocinfoEdges } from "./docinfo.mjs";
import { resourceEdges, resourceActual } from "./resources.mjs";
import { shapeEdges, shapeMutations } from "./shapes.mjs";
import { referenceEdges, referenceActual } from "./references.mjs";
import { checkBody, bodyEdges, bodyMutations } from "./body.mjs";
import { metadataActual, metadataEdges } from "./metadata.mjs";
import { controlEdges } from "./controls.mjs";
import { treeActual, treeEdges } from "./tree.mjs";
import { sectionActual, sectionEdges } from "./sections.mjs";
import { notePair } from "./note-pair.mjs";
import { linksActual, linkEdges } from "./links.mjs";
import { columnEdges, columnPair } from "./columns.mjs";
import { listsActual, listEdges } from "./list-groups.mjs";
import { typeActual, typeEdges } from "./control-types.mjs";
import { objectActual, objectEdges } from "./objects.mjs";
import {
  tablesActual,
  tableEdges,
  tableZonePair,
  tableCellLists,
} from "./tables.mjs";
import { cellPair, cellEdges } from "./cell-extensions.mjs";
import { gridEdges } from "./grid.mjs";
import {
  formattingEdges,
  formattingCounts,
  formattingMutations,
} from "./formatting.mjs";

const module = await WebAssembly.compile(readFileSync(process.argv[2]));
assert.equal(WebAssembly.Module.imports(module).length, 0);
const { exports: w } = await WebAssembly.instantiate(module, {});
let checks = 0;
function call(mode, bytes, limit = 64 * 1024 * 1024) {
  const ptr = w.alloc(bytes.length);
  assert.ok(ptr);
  try {
    new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
    checks++;
    if (!w.probe(mode, ptr, bytes.length, limit)) {
      throw Error(
        Buffer.from(w.memory.buffer, w.error_ptr(), w.error_len()).toString(),
      );
    }
    return Buffer.from(
      new Uint8Array(w.memory.buffer, w.result_ptr(), w.result_len()),
    );
  } finally {
    w.free(ptr, bytes.length);
  }
}
function header(version = 0x05000307, flags = 0) {
  const b = Buffer.alloc(256);
  b.write("HWP Document File");
  b.writeUInt32LE(version, 32);
  b.writeUInt32LE(flags, 36);
  return b;
}
function record(tag, level, payload, extended = payload.length >= 4095) {
  const b = Buffer.alloc((extended ? 8 : 4) + payload.length);
  b.writeUInt32LE(
    (tag | (level << 10) | ((extended ? 4095 : payload.length) << 20)) >>> 0,
  );
  if (extended) b.writeUInt32LE(payload.length, 4);
  payload.copy(b, extended ? 8 : 4);
  return b;
}
// Independent framing oracle: direct integer division, no Zig helpers.
function oracle(bytes) {
  const rows = [];
  let pos = 0;
  while (pos < bytes.length) {
    assert.ok(bytes.length - pos >= 4);
    const start = pos,
      word = bytes.readUInt32LE(pos);
    pos += 4;
    let size = Math.floor(word / 1048576);
    if (size === 4095) {
      size = bytes.readUInt32LE(pos);
      pos += 4;
    }
    assert.ok(size <= bytes.length - pos);
    rows.push(
      word % 1024,
      Math.floor(word / 1024) % 1024,
      start,
      pos - start + size,
      size,
    );
    pos += size;
  }
  const out = Buffer.alloc(rows.length * 4);
  rows.forEach((v, i) => out.writeUInt32LE(v, i * 4));
  return out;
}
const rounds = [];
let begin = checks;
checkDocinfoEdges(call);
resourceEdges(call);
formattingEdges(call);
shapeEdges(call);
const referenceEdgeResults = referenceEdges(call);
bodyEdges(call);
const metadataEdgeResults = metadataEdges(call);
const controlEdgeResults = controlEdges(call);
const treeEdgeResults = treeEdges(call);
const sectionEdgeResults = sectionEdges(call);
const linkEdgeResults = linkEdges(call);
const columnEdgeResults = columnEdges(call);
const listEdgeResults = listEdges(call);
const typeEdgeResults = typeEdges(call);
const objectEdgeResults = objectEdges(call);
const tableEdgeResults = tableEdges(call);
const gridEdgeResults = gridEdges(call);
const cellEdgeResults = cellEdges(call);
const cellPairResults = [0, 0, 0, 0, 0];
let cellPairs = 0;
const cellTails = [0, 0, 0];
const tableReport = [0, 0, 0, 0];
let tableZonePairResult;
const objectCounts = [0, 0, 0, 0, 0, 0, 0];
// Round 1: fixed header, byte order, unknown flags, incompatible versions, feature gates.
for (let n = 0; n < 256; n++)
  assert.throws(() => call(0, header().subarray(0, n)), /InvalidHeaderSize/);
assert.throws(() => call(0, Buffer.alloc(257)), /InvalidHeaderSize/);
for (let i = 0; i < 32; i++) {
  const b = header();
  b[i] ^= 1;
  assert.throws(() => call(0, b), /InvalidSignature/);
}
for (let bit = 0; bit < 32; bit++) {
  const b = header(0x05000307, (2 ** bit) >>> 0);
  b.writeUInt32LE(0x80000007, 40);
  b.writeUInt32LE(4, 44);
  b[48] = 15;
  b[255] = 123;
  const out = call(0, b);
  assert.deepEqual(
    [...new Uint32Array(out.buffer, out.byteOffset, 5)],
    [0x05000307, (2 ** bit) >>> 0, 0x80000007, 4, 15],
  );
}
for (const v of [0x04000000, 0x05020000, 0x06000000])
  assert.throws(() => call(3, header(v)), /UnsupportedVersion/);
for (const [flag, error] of [
  [2, "Encryption"],
  [4, "Distribution"],
  [16, "Drm"],
  [256, "Encryption"],
  [1024, "Drm"],
])
  assert.throws(
    () =>
      call(3, Buffer.concat([header(0x05000000, flag | 1), Buffer.from([7])])),
    new RegExp("Unsupported" + error),
  );
rounds.push({ round: 1, checks: checks - begin });
begin = checks;
// Round 2: stored/fixed/dynamic streams, window-size crossings, exact quotas, wrappers, tails.
let compressionCases = 0;
for (const n of [0, 1, 2, 3, 63, 64, 4095, 4096, 32767, 32768, 32769, 131072]) {
  const plain = Buffer.alloc(n);
  for (let i = 0; i < n; i++) plain[i] = (i * 17 + (i >> 7)) & 255;
  for (const options of [
    { level: 0 },
    { strategy: constants.Z_FIXED },
    { level: 9 },
  ]) {
    const compressed = deflateRawSync(plain, options);
    compressionCases++;
    assert.deepEqual(call(1, compressed, n), plain);
    assert.deepEqual(call(1, compressed, n + 1), plain);
    if (n) assert.throws(() => call(1, compressed, n - 1), /LimitExceeded/);
    assert.throws(
      () => call(1, Buffer.concat([compressed, Buffer.from([0])]), n),
      /TrailingData/,
    );
    for (const cut of new Set([
      0,
      1,
      Math.floor(compressed.length / 2),
      compressed.length - 1,
    ]))
      if (cut < compressed.length)
        assert.throws(
          () => call(1, compressed.subarray(0, cut), n),
          /InvalidDeflate/,
          JSON.stringify({
            n,
            options,
            cut,
            hex: compressed.subarray(0, cut).toString("hex"),
          }),
        );
  }
}
for (const b of [
  Buffer.from([7]),
  deflateSync(Buffer.from("abc")),
  gzipSync(Buffer.from("abc")),
])
  assert.throws(() => call(1, b), /InvalidDeflate|TrailingData/);
rounds.push({ round: 2, checks: checks - begin, compressionCases });
begin = checks;
// Round 3: every tag/level value, extended size boundaries and truncation.
for (let i = 0; i < 1024; i++) {
  const b = record(i, 1023 - i, Buffer.from([i & 255]), i % 2 === 0);
  assert.deepEqual(call(2, b), oracle(b));
}
for (const n of [0, 1, 4094, 4095, 4096, 65536]) {
  const b = record(16, 0, Buffer.alloc(n, 77));
  assert.deepEqual(call(2, b, 1), oracle(b));
  assert.throws(() => call(2, b, 0), /LimitExceeded/);
  for (let cut = 1; cut < Math.min(b.length, 12); cut++)
    assert.throws(() => call(2, b.subarray(0, cut)), /UnexpectedEnd/);
  for (let tail = 1; tail <= 3; tail++)
    assert.throws(
      () => call(2, Buffer.concat([b, Buffer.alloc(tail)])),
      /UnexpectedEnd/,
    );
}
assert.throws(() => call(2, Buffer.alloc(8, 255)), /UnexpectedEnd/);
rounds.push({ round: 3, checks: checks - begin });
begin = checks;
// Round 4: actual HWP CFB -> header -> DocInfo/BodyText -> raw framing vs Node zlib.
const cfb = await createCfbReader(
  readFileSync(new URL("../../zig-out/bin/hwpjs.wasm", import.meta.url)),
);
const fixtures = new URL(
  "../../legacy/rust/crates/hwp-core/tests/fixtures/",
  import.meta.url,
);
let files = 0,
  streams = 0,
  records = 0,
  totalBytes = 0;
const versions = new Set(),
  unsupported = [];
const resources = {
  binData: 0,
  faceNames: 0,
  decoded: 0,
  mismatches: [],
  missing: [],
};
const references = [0, 0, 0, 0];
const body = {
  headers: 0,
  texts: 0,
  units: 0,
  textRuns: 0,
  characterControls: 0,
  inlineControls: 0,
  extendedControls: 0,
  headersWithoutText: 0,
  controlHeaders: 0,
  listHeaders: 0,
};
const formatting = {
  tabDef: 0,
  numbering: 0,
  bullet: 0,
  style: 0,
  borderFill: 0,
  charShape: 0,
  paraShape: 0,
};
const metadata = { paragraphs: 0, runs: 0, lines: 0, ranges: 0 };
const paragraphReport = [0, 0, 0, 0, 0, 0];
const sectionReport = [0, 0, 0, 0, 0, 0];
let notePairResult;
let linkedControls = 0;
let pairedColumns = 0;
const listReport = [0, 0, 0];
const typeReport = [0, 0];
try {
  for (const name of readdirSync(fixtures).filter((n) => n.endsWith(".hwp"))) {
    cfb.parse(readFileSync(new URL(name, fixtures)), { strict: true });
    const hdr = Buffer.from(cfb.findExact("/FileHeader").content);
    assert.deepEqual(call(0, hdr).subarray(0, 16), hdr.subarray(32, 48));
    versions.add(hdr.readUInt32LE(32).toString(16));
    files++;
    if (hdr.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024)) {
      assert.throws(
        () => call(3, hdr),
        /UnsupportedEncryption|UnsupportedDistribution|UnsupportedDrm/,
      );
      unsupported.push(name);
      continue;
    }
    const docBytes = Buffer.from(cfb.findExact("/DocInfo").content);
    const docPlain =
      hdr.readUInt32LE(36) & 1 ? inflateRawSync(docBytes) : docBytes;
    const shapeCount = formattingCounts(docPlain).charShape;
    for (const entry of cfb.document().nodes) {
      if (
        entry.kind !== 2 ||
        !(entry.name === "DocInfo" || /^Section\d+$/.test(entry.name))
      )
        continue;
      const b = Buffer.from(entry.content);
      const plain = hdr.readUInt32LE(36) & 1 ? inflateRawSync(b) : b;
      assert.deepEqual(
        call(3, Buffer.concat([hdr, b]), plain.length),
        plain,
        `${name}/${entry.name}`,
      );
      const framed = call(2, plain);
      if (/^Section\d+$/.test(entry.name)) {
        const rawCells = tableCellLists(plain);
        for (const raw of rawCells) {
          const tail = raw.length - 34;
          assert.ok(tail === 4 || tail === 13);
          cellTails[tail === 4 ? 0 : 1]++;
          if (tail >= 5 && raw[38] === 255) cellTails[2]++;
        }
        const pairedPath = new URL(name.replace(/\.hwp$/, ".hwpx"), fixtures);
        if (
          entry.name === "Section0" &&
          rawCells.length &&
          existsSync(pairedPath)
        ) {
          cellPair(call, rawCells, readFileSync(pairedPath)).forEach((n, i) => {
            cellPairResults[i] += n;
          });
          cellPairs++;
        }
        if (name === "borderfill.hwp" && entry.name === "Section0")
          tableZonePairResult = tableZonePair(
            call,
            hdr.readUInt32LE(32),
            plain,
            readFileSync(new URL("borderfill.hwpx", fixtures)),
          );
        objectActual(plain).forEach((n, i) => {
          objectCounts[i] += n;
        });
        typeActual(call, hdr.readUInt32LE(32), plain).forEach(
          (n, i) => (typeReport[i] += n),
        );
        listsActual(call, hdr.readUInt32LE(32), plain).forEach(
          (n, i) => (listReport[i] += n),
        );
        if (name === "multicolumns-widths.hwp" && entry.name === "Section0")
          pairedColumns += columnPair(
            call,
            plain,
            readFileSync(new URL("multicolumns-widths.hwpx", fixtures)),
          );
        linkedControls += linksActual(call, hdr.readUInt32LE(32), plain);
        if (name === "footnote-endnote.hwp" && entry.name === "Section0")
          notePairResult = notePair(
            call,
            plain,
            readFileSync(new URL("footnote-endnote.hwpx", fixtures)),
          );
        const counts = formattingCounts(docPlain);
        tablesActual(
          call,
          hdr.readUInt32LE(32),
          counts.borderFill,
          plain,
        ).forEach((n, i) => {
          tableReport[i] += n;
        });
        sectionActual(
          call,
          hdr.readUInt32LE(32),
          [counts.numbering, counts.borderFill],
          plain,
        ).forEach((n, i) => (sectionReport[i] += n));
        treeActual(
          call,
          hdr.readUInt32LE(32),
          [counts.charShape, counts.paraShape, counts.style],
          plain,
        ).forEach((n, i) => (paragraphReport[i] += n));
        for (const [key, n] of Object.entries(
          metadataActual(call, hdr.readUInt32LE(32), plain, shapeCount),
        ))
          metadata[key] += n;
        for (const [key, n] of Object.entries(
          checkBody(call, hdr.readUInt32LE(32), plain, true),
        ))
          body[key] += n;
      }
      if (entry.name === "DocInfo") {
        checkDocinfo(call, hdr.readUInt32LE(32), plain);
        referenceActual(call, hdr.readUInt32LE(32), plain).forEach(
          (n, i) => (references[i] += n),
        );
        for (const [key, count] of Object.entries(formattingCounts(plain)))
          formatting[key] += count;
        const result = resourceActual(call, hdr, plain, cfb);
        for (const key of ["binData", "faceNames", "decoded"])
          resources[key] += result[key];
        if (result.mismatch) resources.mismatches.push(name);
        for (const path of result.missing)
          resources.missing.push({ file: name, path });
      }
      assert.deepEqual(framed, oracle(plain), `${name}/${entry.name}`);
      streams++;
      records += framed.length / 20;
      totalBytes += plain.length;
    }
  }
} finally {
  cfb.close();
}
assert.equal(files, 48);
assert.deepEqual(paragraphReport, [1481, 1076, 405, 313, 643, 134]);
assert.deepEqual(sectionReport, [47, 47, 141, 1, 94, 68]);
assert.ok(notePairResult);
assert.equal(linkedControls, 313);
assert.equal(pairedColumns, 3);
assert.deepEqual(listReport, [643, 792, 57]);
assert.deepEqual(typeReport, [313, 0]);
assert.deepEqual(metadata, {
  paragraphs: 1481,
  runs: 1740,
  lines: 1729,
  ranges: 0,
});
assert.deepEqual(body, {
  headers: 1481,
  texts: 1076,
  units: 23570,
  textRuns: 1040,
  characterControls: 1076,
  inlineControls: 50,
  extendedControls: 313,
  headersWithoutText: 405,
  controlHeaders: 313,
  listHeaders: 643,
});
assert.deepEqual(references, [7881, 0, 316, 138]);
assert.deepEqual(formatting, {
  tabDef: 138,
  numbering: 50,
  bullet: 25,
  style: 700,
  borderFill: 247,
  charShape: 525,
  paraShape: 792,
});
assert.ok(streams >= 90);
assert.equal(unsupported.length, 3);
assert.deepEqual(resources, {
  binData: 13,
  faceNames: 861,
  decoded: 13,
  mismatches: [],
  missing: [],
});
rounds.push({
  round: 4,
  checks: checks - begin,
  files,
  streams,
  records,
  totalBytes,
  unsupported,
  versions: [...versions].sort(),
  resources,
  references,
  body,
  metadata,
  paragraphReport,
  sectionReport,
  notePairResult,
  linkedControls,
  pairedColumns,
  listReport,
  typeReport,
  formatting,
});
begin = checks;
// Round 5: deterministic hostile mutations, bounded output and recovery after every attempt.
let seed = 0xc0ffee,
  accepted = 0,
  rejected = 0;
const next = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const base = deflateRawSync(Buffer.alloc(4096, 65));
for (let i = 0; i < 2000; i++) {
  const b = Buffer.from(base);
  b[next() % b.length] ^= 1 << (next() % 8);
  try {
    const out = call(1, b, 65536);
    assert.deepEqual(out, inflateRawSync(b));
    accepted++;
  } catch (e) {
    if (!/^(InvalidDeflate|TrailingData|LimitExceeded)$/.test(e.message))
      throw e;
    rejected++;
  }
  assert.deepEqual(call(1, Buffer.from([3, 0]), 0), Buffer.alloc(0));
}
w.close();
rounds.push({
  round: 5,
  checks: checks - begin,
  mutations: 2000,
  accepted,
  rejected,
  recoveries: 2000,
});
const formattingMutationResults = formattingMutations(call);
const shapeMutationResults = shapeMutations(call);
const bodyMutationResults = bodyMutations(call);
assert.deepEqual(objectCounts, [60, 53, 20, 42, 82, 9, 5]);
assert.deepEqual(tableReport, [60, 578, 29, 2]);
assert.equal(cellPairs, 11);
assert.deepEqual(cellPairResults, [532, 96, 0, 0, 0]);
assert.deepEqual(cellTails, [71, 507, 0]);
assert.deepEqual(tableZonePairResult, [0, 0, 2, 0]);
console.log(
  JSON.stringify(
    {
      rounds,
      formattingMutationResults,
      shapeMutationResults,
      referenceEdgeResults,
      bodyMutationResults,
      metadataEdgeResults,
      controlEdgeResults,
      treeEdgeResults,
      sectionEdgeResults,
      linkEdgeResults,
      columnEdgeResults,
      listEdgeResults,
      typeEdgeResults,
      objectEdgeResults,
      objectCounts,
      tableEdgeResults,
      gridEdgeResults,
      cellEdgeResults,
      cellPairResults,
      cellPairs,
      cellTails,
      tableReport,
      tableZonePairResult,
      checks,
      imports: 0,
    },
    null,
    2,
  ),
);
