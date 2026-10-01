import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { verifySplit } from "./style-preservation/structure-record-oracle.mjs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";
import { verifyMerge } from "./style-preservation/merge-record-oracle.mjs";
import { inspect, paragraphRecords, encodeRecord } from "./style-preservation/text-record-oracle.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { deflateRawSync } from "node:zlib";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);

test("merge handles an explicit zero-length right PARA_TEXT as a terminated empty paragraph", async () => {
  const preparation = await createExperimentalHwp5Editor(wasm, fixture("charshape"));
  let divided;
  try {
    preparation.splitParagraph({ section: 0, paragraph: 1, atUnit: preparation.text(0, 1).length - 1 });
    divided = preparation.save({ allowStaleLayout: true }).bytes;
  } finally { preparation.close(); }
  const parsed = inspect(divided), right = paragraphRecords(parsed.sections[0].bytes, 2);
  const textRecord = right.direct.find(r => r.tag === 67);
  assert.equal(textRecord.payload.length, 2);
  const header = Buffer.from(right.head.payload);
  header.writeUInt32LE(header.readUInt32LE(0) & 0x80000000, 0);
  const raw = Buffer.concat(right.all.map(r => r === textRecord ? encodeRecord(r.tag, r.level, Buffer.alloc(0)) : r === right.head ? encodeRecord(r.tag, r.level, header) : r.raw));
  const writer = await createCfbReader(wasm);
  let input;
  try {
    writer.parse(divided, { strict: true });
    const doc = writer.document();
    const node = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
    node.content = parsed.compressed ? deflateRawSync(raw) : raw;
    input = writer.write(doc);
  } finally { writer.close(); }
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.mergeParagraph({ section: 0, paragraph: 1 });
    verifyMerge(input, editor.save({ allowStaleLayout: true }).bytes, 0, 1);
  } finally { editor.close(); }
});

test("merge oracle rejects corrupted text style last-owner flag and unrelated stream", async () => {
  const input = fixture("charshape"), editor = await createExperimentalHwp5Editor(wasm, input);
  let saved;
  try {
    editor.mergeParagraph({ section: 0, paragraph: 1 });
    saved = editor.save({ allowStaleLayout: true }).bytes;
  } finally { editor.close(); }
  verifyMerge(input, saved, 0, 1);
  const parsed = inspect(saved), paragraph = paragraphRecords(parsed.sections[0].bytes, 1);
  for (const mutation of ["text", "style", "last", "other-stream"]) {
    const writer = await createCfbReader(wasm);
    let damaged;
    try {
      writer.parse(saved, { strict: true });
      const doc = writer.document();
      if (mutation === "other-stream") {
        const node = doc.nodes.find(n => n.name === "DocInfo");
        node.content = Buffer.from(node.content); node.content[0] ^= 1;
      } else {
        const target = mutation === "last" ? paragraph.head : paragraph.direct.find(r => r.tag === (mutation === "text" ? 67 : 68));
        const payload = Buffer.from(target.payload);
        if (mutation === "last") payload.writeUInt32LE((payload.readUInt32LE(0) ^ 0x80000000) >>> 0, 0);
        else if (mutation === "style") payload.writeUInt32LE(payload.readUInt32LE(4) ^ 1, 4);
        else payload[0] ^= 1;
        const raw = Buffer.concat(paragraph.all.map(r => r === target ? encodeRecord(r.tag, r.level, payload) : r.raw));
        const node = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
        node.content = parsed.compressed ? deflateRawSync(raw) : raw;
      }
      damaged = writer.write(doc);
    } finally { writer.close(); }
    assert.throws(() => verifyMerge(input, damaged, 0, 1), assert.AssertionError, mutation);
  }
});

test("public merge preserves independent complete records and atomic native history", async () => {
  for (const name of ["charshape", "software", "table"]) {
    let input = fixture(name);
    const paragraph = name === "software" ? 2 : 1;
    if (name !== "charshape") {
      const preparation = await createExperimentalHwp5Editor(wasm, input);
      try {
        preparation.splitParagraph({ section: 0, paragraph, atUnit: 0 });
        input = Buffer.from(preparation.save({ allowStaleLayout: true }).bytes);
      } finally { preparation.close(); }
    }
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const count = editor.paragraphCount(0);
      const expected = editor.text(0, paragraph).slice(0, -1) + editor.text(0, paragraph + 1);
      editor.enableHistory();
      editor.mergeParagraph({ section: 0, paragraph });
      assert.equal(editor.paragraphCount(0), count - 1);
      assert.equal(editor.text(0, paragraph), expected);
      assert.throws(() => editor.save(), { message: "LayoutReflowRequired" });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifyMerge(input, saved, 0, paragraph);
      assert.throws(() => verifyMerge(input, input, 0, paragraph), assert.AssertionError);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try {
        assert.equal(reopened.paragraphCount(0), count - 1);
        for (let p = 0; p < count - 1; p++) assert.deepEqual(reopened.copyText(0, p), editor.copyText(0, p));
      } finally { reopened.close(); }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.undo(), false);
      for (const field of ["section", "paragraph"])
        for (const value of [-1, 0.5, NaN, "0", null, 0x100000000])
          assert.throws(() => editor.mergeParagraph({ section: 0, paragraph, [field]: value }), { message: `Invalid ${field}` });
      assert.throws(() => editor.mergeParagraph({ section: 0, paragraph: count - 1 }));
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    } finally { editor.close(); }
    assert.throws(() => editor.mergeParagraph({ section: 0, paragraph }), { message: "EditorClosed" });
  }
});

test("merge refuses cross-cell ownership and missing optional ABI without model or redo changes", async () => {
  const input = fixture("software");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    editor.enableHistory();
    editor.splitParagraph({ section: 0, paragraph: 2, atUnit: 0 });
    const split = editor.save({ allowStaleLayout: true }).bytes;
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.mergeParagraph({ section: 0, paragraph: 2 }), { message: "ParagraphOwnerMismatch" });
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, split);
  } finally { editor.close(); }
  const older = Buffer.from(wasm), name = "hwp5_edit_merge";
  const at = older.indexOf(Buffer.from(name));
  assert(at >= 0);
  older[at] = "x".charCodeAt(0);
  const module = await WebAssembly.compile(older);
  assert.equal(WebAssembly.Module.exports(module).some(e => e.name === name), false);
  const legacy = await createExperimentalHwp5Editor(module, input);
  try {
    legacy.enableHistory();
    assert.throws(() => legacy.mergeParagraph({ section: 0, paragraph: 2 }), { message: "Hwp5StructureAbiUnavailable" });
    assert.deepEqual(Buffer.from(legacy.save().bytes), input);
    assert.equal(legacy.undo(), false);
    legacy.splitParagraph({ section: 0, paragraph: 2, atUnit: 0 });
    assert.equal(legacy.undo(), true);
  } finally { legacy.close(); }
  assert.throws(() => legacy.mergeParagraph({ section: 0, paragraph: 2 }), { message: "EditorClosed" });
});

test("repeated generated paragraph split merge and history match independent saved-state oracle", async () => {
  const editor = await createExperimentalHwp5Editor(wasm, fixture("charshape"));
  try {
    editor.enableHistory();
    const count = editor.paragraphCount(0), originalText = editor.copyText(0, 1);
    for (let iteration = 0; iteration < 12; iteration++) {
      const before = editor.save({ allowStaleLayout: true }).bytes;
      const end = editor.text(0, 1).length - 1;
      const atUnit = iteration % 3 === 0 ? 0 : iteration % 3 === 1 ? end : Math.floor(end / 2);
      editor.splitParagraph({ section: 0, paragraph: 1, atUnit });
      const divided = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(before, divided, 0, 1, atUnit);
      editor.mergeParagraph({ section: 0, paragraph: 1 });
      const merged = editor.save({ allowStaleLayout: true }).bytes;
      verifyMerge(divided, merged, 0, 1);
      assert.equal(editor.paragraphCount(0), count);
      assert.deepEqual(editor.copyText(0, 1), originalText);
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, divided);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, merged);
    }
  } finally { editor.close(); }
});

test("older WASM without optional split exports still opens edits and saves without partial mutations", async () => {
  const input = fixture("charshape");
  for (const names of [["hwp5_edit_split_range"], ["hwp5_edit_split_range", "hwp5_edit_split"]]) {
    const older = Buffer.from(wasm);
    for (const name of names) {
      const at = older.indexOf(Buffer.from(name));
      assert(at >= 0);
      older[at] = "x".charCodeAt(0); // Equal-length export rename leaves code/types untouched.
    }
    const module = await WebAssembly.compile(older);
    for (const name of names) assert.equal(WebAssembly.Module.exports(module).some(e => e.name === name), false);
    const editor = await createExperimentalHwp5Editor(module, input);
    try {
      const before = editor.text(0, 1);
      editor.enableHistory();
      assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1, endUnit: 3 }), { message: "Hwp5StructureAbiUnavailable" });
      assert.equal(editor.text(0, 1), before);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.undo(), false);
      if (names.includes("hwp5_edit_split"))
        assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1 }), { message: "Hwp5StructureAbiUnavailable" });
      else {
        editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1 });
        assert.equal(editor.undo(), true);
      }
      editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "기존" });
      assert.ok(editor.text(0, 1).startsWith("기존"));
      assert.ok(editor.save({ allowStaleLayout: true }).bytes.length);
    } finally { editor.close(); }
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1, endUnit: 3 }), { message: "EditorClosed" });
  }
});

test("selected text replacement split is one history transaction with independent complete records", async () => {
  for (const [name, paragraph] of [["charshape", 1], ["software", 2]]) {
    const input = fixture(name), editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const before = editor.text(0, paragraph);
      const endUnit = Math.min(3, before.length - 1);
      editor.enableHistory();
      editor.splitParagraph({ section: 0, paragraph, atUnit: 1, endUnit });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(input, saved, 0, paragraph, 1, endUnit);
      assert.equal(editor.text(0, paragraph), before.slice(0, 1) + "\r");
      assert.equal(editor.text(0, paragraph + 1), before.slice(endUnit));
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.undo(), false, "deletion and split must be one native history entry");
      assert.throws(() => editor.splitParagraph({ section: 0, paragraph, atUnit: 3, endUnit: 1 }), { message: "InvalidTextPosition" });
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    } finally { editor.close(); }
  }
});

test("public HWP5 split saves, reopens and restores native history on real root and table paragraphs", async () => {
  for (const [name, paragraph, atUnit] of [["charshape", 1, 1], ["software", 2, 1], ["table", 1, 0]]) {
    const input = fixture(name), editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const before = editor.text(0, paragraph), count = editor.paragraphCount(0);
      editor.enableHistory();
      editor.splitParagraph({ section: 0, paragraph, atUnit });
      assert.equal(editor.paragraphCount(0), count + 1);
      assert.equal(editor.text(0, paragraph), before === "" ? "" : before.slice(0, atUnit) + "\r");
      assert.equal(editor.text(0, paragraph + 1), before.slice(atUnit) || "\r");
      assert.throws(() => editor.save(), { message: "LayoutReflowRequired" });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(input, saved, 0, paragraph, atUnit);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try {
        assert.equal(reopened.paragraphCount(0), count + 1);
        for (let p = 0; p < count + 1; p++) assert.deepEqual(reopened.copyText(0, p), editor.copyText(0, p));
      } finally { reopened.close(); }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      editor.splice({ section: 0, paragraph: paragraph + 1, startUnit: 0, endUnit: 0, text: "후속😀" });
      assert.ok(editor.text(0, paragraph + 1).startsWith("후속😀"));
      const typed = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(saved, typed, 0, paragraph + 1, 0, 0, "후속😀");
      editor.splitParagraph({ section: 0, paragraph: paragraph + 1, atUnit: 2 });
      assert.equal(editor.paragraphCount(0), count + 2);
      const splitAgain = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(typed, splitAgain, 0, paragraph + 1, 2);
      editor.splitParagraph({ section: 0, paragraph: paragraph + 2, atUnit: 0, endUnit: 2 });
      const selectedAgain = editor.save({ allowStaleLayout: true }).bytes;
      verifySplit(splitAgain, selectedAgain, 0, paragraph + 2, 0, 2);
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, splitAgain);
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, typed);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, splitAgain);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, selectedAgain);
    } finally { editor.close(); }
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph, atUnit }), { message: "EditorClosed" });
  }
});

test("public split rejects invalid integers and surrogate cuts without changing model or redo", async () => {
  const editor = await createExperimentalHwp5Editor(wasm, fixture("charshape"));
  try {
    editor.enableHistory();
    editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: "😀" });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    const count = editor.paragraphCount(0);
    for (const field of ["section", "paragraph", "atUnit"])
      for (const value of [-1, 0.5, NaN, "0", null, 0x100000000])
        assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 0, [field]: value }), { message: `Invalid ${field}` });
    assert.throws(() => editor.splitParagraph({ section: 0, paragraph: 1, atUnit: 1 }));
    assert.equal(editor.paragraphCount(0), count);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    assert.equal(editor.undo(), true);
    assert.throws(() => editor.splitParagraph({ section: 0xffffffff, paragraph: 1, atUnit: 0 }));
    assert.equal(editor.redo(), true);
    assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
  } finally { editor.close(); }
});

test("independent whole-record split oracle covers beginning middle end and rejects ignored edits", async () => {
  for (const [name, paragraph] of [["charshape", 1], ["software", 2], ["table", 1]]) {
    const input = fixture(name);
    const probe = await createExperimentalHwp5Editor(wasm, input);
    let end;
    try { end = Math.max(0, probe.text(0, paragraph).length - 1); }
    finally { probe.close(); }
    for (const atUnit of new Set([0, Math.floor(end / 2), end])) {
      const editor = await createExperimentalHwp5Editor(wasm, input);
      try {
        editor.splitParagraph({ section: 0, paragraph, atUnit });
        verifySplit(input, editor.save({ allowStaleLayout: true }).bytes, 0, paragraph, atUnit);
        assert.throws(() => verifySplit(input, input, 0, paragraph, atUnit), assert.AssertionError);
      } finally { editor.close(); }
    }
  }
});
