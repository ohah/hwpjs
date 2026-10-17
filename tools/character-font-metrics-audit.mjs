/** Recheck the explicitly verified subset of an earlier font inventory. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createExperimentalHwp5Editor } from "../js/hwp5-editor.mjs";
import { createHwpxEditor } from "../js/hwpx-editor.mjs";
import { expectedCharacterFontMetrics } from "../tests/hwp5/character-font-metrics-oracle.mjs";
import { readStreams } from "../tests/hwp5/style-preservation/text-record-oracle.mjs";
const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = /^--(format|wasm|inventory)=(.+)$/.exec(arg);
  if (!match || args.has(match[1])) throw Error("Expected unique --format=hwp5|hwpx --wasm=PATH --inventory=PATH");
  args.set(match[1], match[2]);
}
const format = args.get("format");
if (!["hwp5", "hwpx"].includes(format) || !args.has("wasm") || !args.has("inventory")) throw Error("Missing audit arguments");
const input = JSON.parse(readFileSync(args.get("inventory"))), inventory = input.files ?? input;
if (!Array.isArray(inventory) || inventory.some(row => typeof row.path !== "string" || typeof row.state !== "string")) throw Error("InvalidInventory");
const eligible = inventory.filter(row => row.state === "verified");
const bytes = readFileSync(args.get("wasm")), module = await WebAssembly.compile(bytes), files = [];
for (const source of eligible) {
  let editor;
  const row = { path: source.path };
  try {
    const document = readFileSync(source.path);
    const expected = format === "hwp5" ? expectedCharacterFontMetrics(document) : JSON.parse(execFileSync("python3", ["tests/hwpx/character-font-metrics-oracle.py", source.path], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 }));
    const distribution = format === "hwp5" && Boolean(readStreams(document).get("FileHeader").readUInt32LE(36) & 4);
    editor = format === "hwp5" ? await createExperimentalHwp5Editor(module, document, { distribution }) : await createHwpxEditor(module);
    if (format === "hwpx") editor.open(document);
    const actual = editor.characterFontMetrics();
    assert.deepEqual(actual, expected);
    const saved = editor.save();
    assert.deepEqual(Buffer.from(format === "hwp5" ? saved.bytes : saved), document);
    row.state = "verified"; row.shapes = actual.length;
    row.nondefault = expected.some(({ values }) => Object.entries(values).some(([field, values]) => values?.some(value => value !== null && value !== (["ratio", "relativeSize"].includes(field) ? 100 : 0))));
  } catch (error) { row.state = "error"; row.error = error.message.slice(0, 1000); }
  finally { editor?.close(); files.push(row); globalThis.gc?.(); }
}
const verified = files.filter(row => row.state === "verified");
console.log(JSON.stringify({ format, wasmSha256: createHash("sha256").update(bytes).digest("hex"), counts: { inventoryPaths: inventory.length, eligible: eligible.length, excludedPriorUnverified: inventory.length - eligible.length, verified: verified.length, errors: files.length - verified.length, shapes: verified.reduce((sum, row) => sum + row.shapes, 0), nondefaultDocuments: verified.filter(row => row.nondefault).length, coverageComplete: eligible.length === inventory.length && verified.length === inventory.length }, files }));
if (eligible.length === 0 || verified.length !== eligible.length) process.exitCode = 1;
