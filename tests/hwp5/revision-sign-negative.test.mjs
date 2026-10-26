import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createCfbReader } from "../../js/cfb.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import {
  inspect,
  records,
  paragraphRecords,
  expectedSection,
  encodeRecord,
} from "./style-preservation/text-record-oracle.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit revision-sign retention candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const original = readFileSync(
  "reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp",
);

async function derivative(kind) {
  const before = inspect(original);
  let bytes = Buffer.from(before.sections[0].bytes);
  const row = records(bytes).find(
    (row) => row.tag === 71 && row.payload.readUInt32LE(0) === 0x25756e6b,
  );
  assert(row);
  const payloadAt = row.start + row.raw.length - row.payload.length;
  if (kind === "command") {
    const command = row.payload
      .subarray(11, 11 + row.payload.readUInt16LE(9) * 2)
      .toString("utf16le");
    assert.equal(command, "$RevisionSign;1;");
    bytes.writeUInt16LE(50, payloadAt + 11 + command.indexOf("1") * 2);
  } else if (kind === "attributes") bytes.writeUInt32LE(1, payloadAt + 4);
  else if (kind === "other") bytes[payloadAt + 8] = 1;
  else if (kind === "extension") bytes[payloadAt + row.payload.length - 1] = 1;
  else if (kind === "extension length") {
    bytes = Buffer.concat([
      bytes.subarray(0, row.start),
      encodeRecord(row.tag, row.level, row.payload.subarray(0, -4)),
      bytes.subarray(row.start + row.raw.length),
    ]);
  } else if (kind === "nonempty result") {
    bytes = expectedSection(bytes, 8980, 141, 141, "X", { skipLocalFieldAttributes: true });
  } else if (kind === "end identity") {
    const text = paragraphRecords(bytes, 8980).direct.find((row) => row.tag === 67);
    const at = text.start + text.raw.length - text.payload.length + 141 * 2 + 2;
    assert.equal(bytes.readUInt32LE(at), 0x736967);
    bytes.writeUInt32LE(0x01736967, at);
  } else throw Error("UnknownDerivative");
  assert(!bytes.equals(before.sections[0].bytes));
  const cfb = await createCfbReader(wasm);
  let output;
  try {
    cfb.parse(original);
    const doc = cfb.document(),
      body = doc.nodes.findIndex((row) => row.parent === 0 && row.name === "BodyText");
    assert(body >= 0);
    const target = doc.nodes.find((row) => row.parent === body && row.name === "Section0");
    assert(target);
    target.content = before.compressed ? deflateRawSync(bytes) : bytes;
    output = Buffer.from(cfb.write(doc));
    cfb.parse(output, { strict: true });
  } finally {
    cfb.close();
  }
  const after = inspect(output);
  assert.deepEqual(after.sections[0].bytes, bytes);
  for (const [path, value] of before.streams)
    if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), value);
  return output;
}

for (const [kind, expected, editError = expected] of [
  ["command", /UnsupportedSectionControl/, /FieldMarkerMismatch/],
  ["attributes", /UnsupportedSectionControl/],
  ["other", /UnsupportedSectionControl/],
  ["extension", /UnsupportedSectionControl/],
  ["extension length", /UnsupportedSectionControl/],
  ["nonempty result", /UnsupportedRetainedRevisionSign/],
  ["end identity", /FieldMarkerMismatch/],
])
  test(`revision-sign ${kind} counter-control retains original source and a real pending redo`, async () => {
    const input = await derivative(kind),
      editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 32 * 1024 * 1024 });
      const shape = editor.paragraphShapeId(0, 50000),
        count = editor.paragraphShapeCount();
      assert(count > 1);
      editor.setParagraphFormat({ section: 0, paragraph: 50000, paraShapeId: (shape + 1) % count });
      const formatted = editor.save({ allowStaleLayout: true }).bytes;
      assert.equal(editor.undo(), true);
      assert.throws(() => editor.validateTextSourcePolicy(0), expected);
      assert.throws(
        () =>
          editor.splice({ section: 0, paragraph: 50000, startUnit: 0, endUnit: 0, text: "거부" }),
        editError,
      );
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, formatted);
    } finally {
      editor.close();
    }
  });
