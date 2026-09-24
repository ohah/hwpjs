// Read-only wire census. CFB lookup uses the product reader; the property-set
// directory and TypedPropertyValue header are interpreted independently here.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createCfbReader } from "../js/cfb.mjs";

const roots = process.argv.slice(2);
const hwpFmtid = Buffer.from("60b6a29f6110d411b4c6006097c09d8c", "hex");
const emptyResult = () => ({
  files: 0, cfb_rejected: 0, summary_present: 0, malformed_summary: 0,
  one_set: 0, two_sets: 0, other_set_count: 0, other_fmtid: 0,
  version_0: 0, version_1: 0, other_version: 0,
  typed_properties: 0, nonzero_reserved: 0,
});

function* hwpPaths(root) {
  const pending = [root];
  while (pending.length) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".hwp")) yield path;
    }
  }
}

function surveySummary(bytes, result) {
  result.summary_present++;
  if (bytes.length < 48) { result.malformed_summary++; return; }
  if (!bytes.subarray(28, 44).equals(hwpFmtid)) { result.other_fmtid++; return; }
  const version = bytes.readUInt16LE(2);
  if (version === 0) result.version_0++;
  else if (version === 1) result.version_1++;
  else result.other_version++;
  const sets = bytes.readUInt32LE(24);
  if (sets === 1) result.one_set++;
  else if (sets === 2) result.two_sets++;
  else result.other_set_count++;
  if (sets !== 1) return;
  const offset = bytes.readUInt32LE(44);
  if (offset > bytes.length - 8) { result.malformed_summary++; return; }
  const size = bytes.readUInt32LE(offset);
  const count = bytes.readUInt32LE(offset + 4);
  if (size < 8 || size > bytes.length - offset || count > (size - 8) / 8) {
    result.malformed_summary++;
    return;
  }
  const directoryEnd = 8 + count * 8;
  for (let i = 0; i < count; i++) {
    const propertyOffset = bytes.readUInt32LE(offset + 12 + i * 8);
    if (propertyOffset < directoryEnd || propertyOffset > size - 4) {
      result.malformed_summary++;
      return;
    }
  }
  for (let i = 0; i < count; i++) {
    const id = bytes.readUInt32LE(offset + 8 + i * 8);
    const propertyOffset = bytes.readUInt32LE(offset + 12 + i * 8);
    if (id === 0) continue; // Dictionary is not TypedPropertyValue.
    result.typed_properties++;
    result.nonzero_reserved += Number(bytes.readUInt16LE(offset + propertyOffset + 2) !== 0);
  }
}

if (roots.length === 1 && roots[0] === "--self-test") {
  const raw = Buffer.alloc(72);
  hwpFmtid.copy(raw, 28);
  raw.writeUInt32LE(1, 24);
  raw.writeUInt32LE(48, 44);
  raw.writeUInt32LE(24, 48);
  raw.writeUInt32LE(1, 52);
  raw.writeUInt32LE(14, 56);
  raw.writeUInt32LE(16, 60);
  raw.writeUInt16LE(3, 64);
  raw.writeUInt16LE(1, 66);
  const found = emptyResult();
  surveySummary(raw, found);
  if (found.one_set !== 1 || found.typed_properties !== 1 || found.nonzero_reserved !== 1) throw new Error("typed reserved census failed");
  raw.writeUInt32LE(0, 56);
  const dictionary = emptyResult();
  surveySummary(raw, dictionary);
  if (dictionary.typed_properties !== 0 || dictionary.nonzero_reserved !== 0) throw new Error("dictionary was typed");
  raw.writeUInt32LE(2, 24);
  const two = emptyResult();
  surveySummary(raw, two);
  if (two.two_sets !== 1 || two.typed_properties !== 0) throw new Error("two-set selection failed");
  process.stdout.write("summary reserved survey self-test passed\n");
} else {
  if (roots.length === 0) throw new Error("usage: hwp5-summary-reserved-survey.mjs [--self-test] DIR [DIR ...]");
  const cfb = await createCfbReader(readFileSync(new URL("../zig-out/bin/hwpjs.wasm", import.meta.url)));
  const result = emptyResult();
  for (const root of roots) {
    for (const path of hwpPaths(root)) {
      result.files++;
      try {
        cfb.parse(readFileSync(path), { strict: true });
      } catch {
        result.cfb_rejected++;
        continue;
      }
      const node = cfb.findExact("/\x05HwpSummaryInformation");
      if (node) surveySummary(Buffer.from(node.content), result);
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
