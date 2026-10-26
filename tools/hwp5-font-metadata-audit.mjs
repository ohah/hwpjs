/** Read-only corpus audit. A partial inventory is not a whole-parser pass. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createExperimentalHwp5Editor } from "../js/hwp5-editor.mjs";
import { readStreams } from "../tests/hwp5/style-preservation/text-record-oracle.mjs";
import { expectedFontMetadata } from "../tests/hwp5/font-face-metadata-oracle.mjs";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = /^--(wasm|root|baseline-wasm)=(.+)$/.exec(arg);
  if (!match || args.has(match[1]))
    throw Error("Expected unique --wasm=PATH --root=PATH [--baseline-wasm=PATH]");
  args.set(match[1], match[2]);
}
if (!args.has("wasm") || !args.has("root")) throw Error("Required --wasm=PATH --root=PATH");
const binary = readFileSync(args.get("wasm"));
const module = await WebAssembly.compile(binary);
const baseline = args.has("baseline-wasm")
  ? await WebAssembly.compile(readFileSync(args.get("baseline-wasm")))
  : null;
const walk = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(`${path}/${entry.name}`)
      : entry.isFile()
        ? [`${path}/${entry.name}`]
        : [],
  );
const files = [];
for (const path of walk(resolve(args.get("root")))
  .filter((path) => [".hwp", ".hwpx"].includes(extname(path).toLowerCase()))
  .sort()) {
  const row = { path };
  let editor;
  try {
    if (statSync(path).size > 64 * 1024 * 1024) {
      row.state = "input-limit";
      continue;
    }
    const input = readFileSync(path);
    if (input.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") {
      row.state = "excluded-format";
      continue;
    }
    let flags, expected;
    try {
      flags = readStreams(input).get("FileHeader").readUInt32LE(36);
      if (flags & 2) {
        row.state = "encrypted";
        continue;
      }
      expected = expectedFontMetadata(input);
    } catch (error) {
      row.state = "oracle-error";
      row.error = error.message;
      continue;
    }
    row.hasSubstitute = expected.some((font) => font.substitute !== null);
    let openError = null;
    try {
      editor = await createExperimentalHwp5Editor(module, input, {
        distribution: Boolean(flags & 4),
      });
    } catch (error) {
      openError = error.message;
    }
    if (baseline) {
      let baselineEditor,
        baselineError = null;
      try {
        baselineEditor = await createExperimentalHwp5Editor(baseline, input, {
          distribution: Boolean(flags & 4),
        });
      } catch (error) {
        baselineError = error.message;
      } finally {
        baselineEditor?.close();
      }
      row.baselineMatches = baselineError === openError;
      if (!row.baselineMatches) row.baselineError = baselineError;
    }
    if (openError !== null) {
      row.state = "open-error";
      row.error = openError;
      continue;
    }
    assert.deepEqual(editor.fontFaceMetadata(), expected);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    row.state = "verified";
    row.resources = expected.length;
  } catch (error) {
    row.state = "verification-error";
    row.error = error.message.slice(0, 2000);
  } finally {
    editor?.close();
    files.push(row);
    globalThis.gc?.();
  }
}
const states = {};
for (const file of files) states[file.state] = (states[file.state] ?? 0) + 1;
const verified = files.filter((file) => file.state === "verified");
const baselineDifferences = files.filter((file) => file.baselineMatches === false).length;
const counts = {
  paths: files.length,
  states,
  coverageComplete: files.every((file) =>
    ["verified", "excluded-format", "encrypted"].includes(file.state),
  ),
  verifiedResources: verified.reduce((n, file) => n + file.resources, 0),
  substituteVerified: verified.filter((file) => file.hasSubstitute).length,
  baselineDifferences,
};
console.log(
  JSON.stringify({ wasmSha256: createHash("sha256").update(binary).digest("hex"), counts, files }),
);
if (states["verification-error"] || baselineDifferences) process.exitCode = 1;
