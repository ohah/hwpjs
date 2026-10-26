import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createCfbReader } from "../../js/cfb.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { independentFieldSpans } from "./field-span-oracle.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit readable field-span candidate required");
test("actual revision-sign header alias is readable while its retained result stays protected", async () => {
  const path =
    "reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp";
  const input = readFileSync(path),
    source = inspect(input);
  const expected = independentFieldSpans(source.sections[0].bytes, {
    additionalKinds: [0x25756e6b, 0x25736967],
  });
  assert.equal(expected.length, 17);
  const signature = expected.find((row) => row.field_id === 0x25736967);
  assert.deepEqual(signature.begin, { paragraph: 8980, unit: 141 });
  assert.deepEqual(signature.end, signature.begin);
  const editor = await createExperimentalHwp5Editor(
    readFileSync(process.env.HWPJS_TEST_WASM),
    input,
  );
  try {
    editor.enableHistory();
    assert.deepEqual(editor.fieldSpans(0), expected);
    assert.deepEqual(editor.fieldSpans(0), expected);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    editor.validateTextSourcePolicy(0);
    assert.throws(
      () =>
        editor.splice({
          section: 0,
          paragraph: signature.begin.paragraph,
          startUnit: signature.begin.unit,
          endUnit: signature.begin.unit,
          text: "거부",
        }),
      /ReadOnlyRetainedFieldResult/,
    );
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false);
    assert.equal(editor.redo(), false);
  } finally {
    editor.close();
  }
  assert.throws(() => editor.fieldSpans(0), /EditorClosed/);
  assert.deepEqual(readFileSync(path), input);
});

test("revision-sign header alias rejects a same-length command mutation without altering source or history", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const original = readFileSync(
    "reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp",
  );
  const source = inspect(original),
    bytes = Buffer.from(source.sections[0].bytes);
  const header = records(bytes).find(
    (row) => row.tag === 71 && row.payload.readUInt32LE(0) === 0x25756e6b,
  );
  assert(header);
  const command = header.payload
    .subarray(11, 11 + header.payload.readUInt16LE(9) * 2)
    .toString("utf16le");
  assert.equal(command, "$RevisionSign;1;");
  const at =
    header.start + header.raw.length - header.payload.length + 11 + command.indexOf("1") * 2;
  assert.equal(bytes.readUInt16LE(at), 49);
  bytes.writeUInt16LE(50, at);
  const cfb = await createCfbReader(wasm);
  let input;
  try {
    cfb.parse(original);
    const doc = cfb.document(),
      body = doc.nodes.findIndex((row) => row.parent === 0 && row.name === "BodyText");
    assert(body >= 0);
    const section = doc.nodes.find((row) => row.parent === body && row.name === "Section0");
    assert(section);
    section.content = source.compressed ? deflateRawSync(bytes) : bytes;
    input = Buffer.from(cfb.write(doc));
    cfb.parse(input, { strict: true });
  } finally {
    cfb.close();
  }
  const changed = inspect(input);
  assert.deepEqual(changed.sections[0].bytes, bytes);
  for (const [path, content] of source.streams)
    if (path !== source.sections[0].path) assert.deepEqual(changed.streams.get(path), content);
  assert.throws(
    () => independentFieldSpans(bytes, { additionalKinds: [0x25756e6b, 0x25736967] }),
    /independent field header mismatch/,
  );
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    assert.throws(() => editor.fieldSpans(0), /FieldMarkerMismatch/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.undo(), false);
    assert.equal(editor.redo(), false);
  } finally {
    editor.close();
  }
});
