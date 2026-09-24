// Read-only wire census. CFB lookup uses the product reader; the property-set
// directory and TypedPropertyValue header are interpreted independently here.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createCfbReader } from "../js/cfb.mjs";

const args = process.argv.slice(2);
const probeEnabled = args[0] === "--probe";
const roots = probeEnabled ? args.slice(1) : args;
const hwpFmtid = Buffer.from("60b6a29f6110d411b4c6006097c09d8c", "hex");
const emptyResult = () => ({
  files: 0, cfb_rejected: 0, cfb_rejection_reasons: {}, summary_present: 0, malformed_summary: 0,
  one_set: 0, two_sets: 0, other_set_count: 0, other_fmtid: 0,
  version_0: 0, version_1: 0, other_version: 0,
  typed_properties: 0, nonzero_reserved: 0,
  code_page_present: 0, code_page_missing: 0, dictionary_present: 0,
  dictionary_empty: 0, dictionary_nonempty: 0,
  dictionary_wide_only: 0, dictionary_byte_only: 0,
  dictionary_both: 0, dictionary_neither: 0,
  dictionary_hwp_placeholder: 0,
  code_page_values: {}, typed_type_values: {},
  dictionary_entry_counts: {},
  dictionary_ids: {}, dictionary_name_lengths: {}, dictionary_raw_lengths: {},
  summary_probe_parsed: 0, summary_probe_errors: {},
});

function probeSummary(wasm, bytes, result) {
  const ptr = wasm.alloc(bytes.length);
  if (!ptr) throw new Error("OutOfMemory");
  try {
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
    if (wasm.probe(27, ptr, bytes.length, 1024)) result.summary_probe_parsed++;
    else {
      const reason = Buffer.from(wasm.memory.buffer, wasm.error_ptr(), wasm.error_len()).toString();
      result.summary_probe_errors[reason] = (result.summary_probe_errors[reason] ?? 0) + 1;
    }
  } finally {
    wasm.free(ptr, bytes.length);
    wasm.close();
  }
}

function dictionaryShape(raw, width) {
  if (raw.length < 4) return false;
  const count = raw.readUInt32LE(0);
  if (count > (raw.length - 4) / (8 + width)) return false;
  let pos = 4;
  for (let i = 0; i < count; i++) {
    if (pos > raw.length - 8) return false;
    const id = raw.readUInt32LE(pos);
    const len = raw.readUInt32LE(pos + 4);
    pos += 8;
    if (id < 2 || id > 0x7fffffff || len < 1 || len > (raw.length - pos) / width) return false;
    const nameEnd = pos + len * width;
    if (raw.subarray(nameEnd - width, nameEnd).some((byte) => byte !== 0)) return false;
    pos = nameEnd;
    if (width === 2) {
      const pad = (4 - (len * 2) % 4) % 4;
      if (pad > raw.length - pos || raw.subarray(pos, pos + pad).some((byte) => byte !== 0)) return false;
      pos += pad;
    }
  }
  const pad = (4 - pos % 4) % 4;
  return raw.length - pos === pad && raw.subarray(pos).every((byte) => byte === 0);
}

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
  let codePageOffset;
  let dictionaryOffset;
  for (let i = 0; i < count; i++) {
    const id = bytes.readUInt32LE(offset + 8 + i * 8);
    const propertyOffset = bytes.readUInt32LE(offset + 12 + i * 8);
    if (propertyOffset < directoryEnd || propertyOffset > size - 4) {
      result.malformed_summary++;
      return;
    }
    if (id === 1) codePageOffset = propertyOffset;
    if (id === 0) dictionaryOffset = propertyOffset;
  }
  if (dictionaryOffset !== undefined) {
    result.dictionary_present++;
    const entries = bytes.readUInt32LE(offset + dictionaryOffset);
    result.dictionary_entry_counts[entries] = (result.dictionary_entry_counts[entries] ?? 0) + 1;
    if (entries === 0) result.dictionary_empty++;
    else {
      result.dictionary_nonempty++;
      let end = size;
      for (let i = 0; i < count; i++) {
        const propertyOffset = bytes.readUInt32LE(offset + 12 + i * 8);
        if (propertyOffset > dictionaryOffset && propertyOffset < end) end = propertyOffset;
      }
      const raw = bytes.subarray(offset + dictionaryOffset, offset + end);
      if (raw.length === 13 && raw.readUInt32LE(0) === 1 && raw.readUInt32LE(4) === 0 && raw.readUInt32LE(8) === 1 && raw[12] === 0) result.dictionary_hwp_placeholder++;
      if (raw.length >= 12) {
        const id = raw.readUInt32LE(4);
        const len = raw.readUInt32LE(8);
        result.dictionary_ids[id] = (result.dictionary_ids[id] ?? 0) + 1;
        result.dictionary_name_lengths[len] = (result.dictionary_name_lengths[len] ?? 0) + 1;
      }
      result.dictionary_raw_lengths[raw.length] = (result.dictionary_raw_lengths[raw.length] ?? 0) + 1;
      const wide = dictionaryShape(raw, 2);
      const byte = dictionaryShape(raw, 1);
      if (wide && byte) result.dictionary_both++;
      else if (wide) result.dictionary_wide_only++;
      else if (byte) result.dictionary_byte_only++;
      else result.dictionary_neither++;
    }
  }
  if (codePageOffset === undefined) result.code_page_missing++;
  else {
    result.code_page_present++;
    if (codePageOffset <= size - 8 && bytes.readUInt16LE(offset + codePageOffset) === 2) {
      const value = bytes.readUInt16LE(offset + codePageOffset + 4);
      result.code_page_values[value] = (result.code_page_values[value] ?? 0) + 1;
    }
  }
  for (let i = 0; i < count; i++) {
    const id = bytes.readUInt32LE(offset + 8 + i * 8);
    const propertyOffset = bytes.readUInt32LE(offset + 12 + i * 8);
    if (id === 0) continue; // Dictionary is not TypedPropertyValue.
    result.typed_properties++;
    const type = bytes.readUInt16LE(offset + propertyOffset);
    result.typed_type_values[type] = (result.typed_type_values[type] ?? 0) + 1;
    result.nonzero_reserved += Number(bytes.readUInt16LE(offset + propertyOffset + 2) !== 0);
  }
}

if (roots.length === 1 && roots[0] === "--self-test") {
  const placeholder = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  if (dictionaryShape(placeholder, 1) || dictionaryShape(placeholder, 2)) throw new Error("HWP marker accepted as OLEPS dictionary");
  const byteDictionary = Buffer.from([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 65, 66, 0, 0]);
  if (!dictionaryShape(byteDictionary, 1) || dictionaryShape(byteDictionary, 2)) throw new Error("byte dictionary shape failed");
  const wideDictionary = Buffer.from([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 65, 0, 66, 0, 0, 0, 0, 0]);
  if (!dictionaryShape(wideDictionary, 2) || dictionaryShape(wideDictionary, 1)) throw new Error("wide dictionary shape failed");
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
  if (roots.length === 0) throw new Error("usage: hwp5-summary-reserved-survey.mjs [--self-test|--probe] DIR [DIR ...]");
  const cfb = await createCfbReader(readFileSync(new URL("../zig-out/bin/hwpjs.wasm", import.meta.url)));
  const probe = probeEnabled
    ? (await WebAssembly.instantiate(await WebAssembly.compile(readFileSync(new URL("../zig-out/bin/hwp5-probe.wasm", import.meta.url))), {})).exports
    : null;
  const result = emptyResult();
  for (const root of roots) {
    for (const path of hwpPaths(root)) {
      result.files++;
      try {
        cfb.parse(readFileSync(path), { strict: true });
      } catch (error) {
        const expected = error instanceof Error && (
          ["InvalidFat", "InvalidUnusedEntry", "InvalidRoot"].includes(error.message) ||
          error.message.startsWith("Header Signature: Expected d0cf11e0a1b11ae1 saw ")
        );
        if (!expected) throw error;
        result.cfb_rejected++;
        result.cfb_rejection_reasons[error.message] = (result.cfb_rejection_reasons[error.message] ?? 0) + 1;
        continue;
      }
      const node = cfb.findExact("/\x05HwpSummaryInformation");
      if (node) {
        const bytes = Buffer.from(node.content);
        surveySummary(bytes, result);
        if (probe) probeSummary(probe, bytes, result);
      }
    }
  }
  cfb.close();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (Object.keys(result.summary_probe_errors).length) process.exitCode = 1;
}
