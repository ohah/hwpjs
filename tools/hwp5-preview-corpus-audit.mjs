// Optional, read-only local corpus audit. Paths are emitted only with --files.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { createCfbReader } from "../js/cfb.mjs";
import { createHwp5Reader } from "../js/hwp5.mjs";
import { rawParagraphTexts } from "./hwp5-preview-record-oracle.mjs";

const ignored = new Set([".git", ".zig-cache", "node_modules"]);
function filesUnder(root) {
  const files = [];
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && !ignored.has(entry.name)) visit(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".hwp")) files.push(path);
    }
  };
  visit(root);
  return files;
}

function category(error, bytes) {
  if (!error) return "preview_ok";
  if (error === "InvalidSignature") {
    if (bytes.subarray(0, 8).toString() === "HWP Docu") return "legacy_signature_not_cfb";
    if (bytes.subarray(0, 2).toString() === "PK") return "zip_not_hwp5";
  }
  if (error === "Truncated" && bytes.length < 512) return "non_document_bytes";
  return error;
}

function compareText(cfb, bytes, preview) {
  cfb.parse(bytes);
  const header = cfb.findExact("/FileHeader")?.content;
  if (!header) throw new Error("oracle missing FileHeader");
  let compared = 0;
  for (const section of preview.sections) {
    const encoded = cfb.findExact(`/BodyText/Section${section.index}`)?.content;
    if (!encoded) throw new Error("oracle missing Section");
    const raw = header[36] & 1 ? inflateRawSync(encoded, { maxOutputLength: 32 * 1024 * 1024 }) : encoded;
    const expected = rawParagraphTexts(raw);
    if (expected.length !== section.paragraphs.length) throw new Error("oracle paragraph count mismatch");
    for (let i = 0; i < expected.length; i++) {
      const actual = section.paragraphs[i];
      const text = expected[i];
      if (actual.textPresent !== (text !== null) ||
          !Buffer.concat(actual.tokens.map(token => Buffer.from(token.raw))).equals(text ?? Buffer.alloc(0))) {
        throw new Error(`oracle text mismatch section=${section.index} paragraph=${i}`);
      }
      compared++;
    }
  }
  return compared;
}

const showFiles = process.argv.includes("--files");
const roots = process.argv.slice(2).filter(arg => arg !== "--files");
const paths = (roots.length ? roots : ["reference", "legacy"]).flatMap(filesUnder).sort();
const wasm = readFileSync(new URL("../zig-out/bin/hwpjs.wasm", import.meta.url));
const preview = await createHwp5Reader(wasm);
const cfb = await createCfbReader(wasm);
const groups = new Map();
const oracle = { matched: 0, paragraphs: 0, unavailable: 0, failures: [] };
try {
  for (const path of paths) {
    const bytes = readFileSync(path);
    let result;
    let error = null;
    try { result = preview.readText(bytes); } catch (err) { error = err.message; }
    const key = category(error, bytes);
    const group = groups.get(key) ?? [];
    group.push(path);
    groups.set(key, group);
    if (result) {
      try {
        oracle.paragraphs += compareText(cfb, bytes, result);
        oracle.matched++;
      } catch (err) {
        // The permissive CFB oracle cannot open one observed bad FAT marker.
        if (err.message === "InvalidFat") oracle.unavailable++;
        else oracle.failures.push({ path, error: err.message });
      }
    }
  }
} finally {
  cfb.close();
  preview.close();
}
const report = {
  paths: paths.length,
  categories: Object.fromEntries([...groups].sort().map(([name, paths]) => [name, showFiles && name !== "preview_ok" ? paths : paths.length])),
  oracle,
};
console.log(JSON.stringify(report, null, 2));
const known = new Set([
  "preview_ok", "legacy_signature_not_cfb", "zip_not_hwp5", "non_document_bytes",
  "UnsupportedDistribution", "UnsupportedEncryption", "UnsupportedVersion",
  "InvalidDeflate", "SectionCountMismatch",
]);
if (oracle.failures.length || [...groups.keys()].some(key => !known.has(key))) process.exitCode = 1;
