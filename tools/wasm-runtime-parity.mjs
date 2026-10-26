// Stronger than export-name parity: compare every runtime section byte for byte.
// Only DWARF and the optional function-name section may be removed or changed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function sectionRecords(input) {
  const bytes = new Uint8Array(input);
  if (!WebAssembly.validate(bytes)) throw new Error("InvalidWasmModule");
  let offset = 8;
  function u32(end) {
    let value = 0;
    for (let index = 0; index < 5 && offset < end; index++) {
      const byte = bytes[offset++];
      if (index === 4 && byte & 0xf0) throw new Error("InvalidWasmSectionLength");
      value += (byte & 0x7f) * 2 ** (index * 7);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("InvalidWasmSectionLength");
  }
  const sections = [];
  while (offset < bytes.length) {
    const sectionStart = offset;
    const id = bytes[offset++],
      size = u32(bytes.length),
      start = offset,
      end = offset + size;
    if (end > bytes.length) throw new Error("InvalidWasmSectionLength");
    let name = null;
    if (id === 0) {
      const length = u32(end);
      if (offset + length > end) throw new Error("InvalidWasmCustomName");
      name = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(offset, offset + length),
      );
    }
    const section = { id, name, size, sha256: hash(bytes.subarray(start, end)) };
    sections.push({
      section,
      raw: bytes.subarray(sectionStart, end),
      debug: id === 0 && (name === "name" || name.startsWith(".debug_")),
    });
    offset = end;
  }
  return { bytes, sections };
}

export function wasmRuntimeSections(input) {
  const { sections } = sectionRecords(input);
  return {
    runtime: sections.filter((row) => !row.debug).map((row) => row.section),
    debug: sections.filter((row) => row.debug).map((row) => row.section),
  };
}

export function stripWasmDebug(input) {
  const { bytes, sections } = sectionRecords(input);
  const retained = sections.filter((row) => !row.debug);
  const result = new Uint8Array(8 + retained.reduce((sum, row) => sum + row.raw.length, 0));
  result.set(bytes.subarray(0, 8));
  let offset = 8;
  for (const row of retained) {
    result.set(row.raw, offset);
    offset += row.raw.length;
  }
  if (!compareWasmRuntime(bytes, result).identicalRuntime) throw new Error("WasmRuntimeChanged");
  return result;
}

export function compareWasmRuntime(baseline, candidate) {
  const before = wasmRuntimeSections(baseline),
    after = wasmRuntimeSections(candidate);
  return {
    identicalRuntime: JSON.stringify(before.runtime) === JSON.stringify(after.runtime),
    baselineSha256: hash(baseline),
    candidateSha256: hash(candidate),
    baselineBytes: baseline.byteLength,
    candidateBytes: candidate.byteLength,
    baseline: before,
    candidate: after,
    scope:
      "exact ordered runtime section payloads; DWARF and optional names excluded; not whole fixture or browser coverage",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2)
      throw new Error("Usage: node tools/wasm-runtime-parity.mjs BASELINE.wasm CANDIDATE.wasm");
    const result = compareWasmRuntime(readFileSync(args[0]), readFileSync(args[1]));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.identicalRuntime ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
