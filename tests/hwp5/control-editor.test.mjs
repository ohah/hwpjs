import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { deflateRawSync } from "node:zlib";
import { inspect, paragraphRecords, encodeRecord, verifyRaw, expectedSection, records } from "./style-preservation/text-record-oracle.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/software.hwp");

test("cross-paragraph hyperlink text updates its start owner while preserving all independent records", async () => {
  const fixture = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp");
  const original = inspect(fixture), cfb = await createCfbReader(wasm);
  let input;
  try {
    cfb.parse(fixture, { strict: true });
    const doc = cfb.document(), section = original.sections[0];
    const reset = Buffer.concat(records(section.bytes).map(r => {
      if (r.tag !== 71 || r.payload.readUInt32LE(0) !== 0x25686c6b) return r.raw;
      const raw = Buffer.from(r.raw), offset = raw.length - r.payload.length + 4;
      raw.writeUInt32LE(raw.readUInt32LE(offset) & ~0x8000, offset); return raw;
    }));
    doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText").content = deflateRawSync(reset);
    input = cfb.write(doc);
  } finally { cfb.close(); }
  for (const [paragraph, start, end, text, modified] of [[1, 0, 0, "外😀", false], [1, 15, 15, "한😀", true], [2, 0, 0, "한😀", true], [2, 0, 4, "", true], [2, 12, 12, "밖", false]]) {
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      editor.splice({ section: 0, paragraph, startUnit: start, endUnit: end, text });
      const saved = editor.save({ allowStaleLayout: true }).bytes, before = inspect(input), after = inspect(saved);
      let expected = expectedSection(before.sections[0].bytes, paragraph, start, end, text, { skipLocalFieldAttributes: true });
      const owner = paragraphRecords(expected, 1).direct.find(r => r.tag === 71 && r.payload.readUInt32LE(0) === 0x25686c6b);
      if (modified) expected = Buffer.concat(records(expected).map(r => {
        if (r.start !== owner.start) return r.raw;
        const raw = Buffer.from(r.raw), offset = raw.length - r.payload.length + 4;
        raw.writeUInt32LE(raw.readUInt32LE(offset) | 0x8000, offset); return raw;
      }));
      assert.deepEqual(after.sections[0].bytes, expected);
      assert.deepEqual([...after.streams.keys()].sort(), [...before.streams.keys()].sort());
      for (const [path, bytes] of before.streams) if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try { for (let p = 0; p < 3; p++) assert.deepEqual(reopened.copyText(0, p), editor.copyText(0, p)); }
      finally { reopened.close(); }
    } finally { editor.close(); }
  }
});

test("cross-paragraph malformed ends and marker deletion reject without any committed changes", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input);
  try {
    assert.throws(() => editor.splice({ section: 0, paragraph: 2, startUnit: 4, endUnit: 12, text: "" }), { message: "UnsupportedControlDeletion" });
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
    editor.splice({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0, text: "" });
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally { editor.close(); }
  const owner = paragraphRecords(inspect(input).sections[0].bytes, 2);
  const text = owner.direct.find(r => r.tag === 67);
  for (const error of ["FieldMarkerMismatch", "UnsupportedCrossParagraphField"]) {
    const cfb = await createCfbReader(wasm); let damaged;
    try {
      cfb.parse(input, { strict: true }); const doc = cfb.document();
      const raw = Buffer.concat(owner.all.map(r => {
        if (r === text) {
          const payload = Buffer.from(r.payload);
          if (error === "FieldMarkerMismatch") payload.writeUInt32LE(0x09686c6b, 10);
          else return encodeRecord(r.tag, r.level, Buffer.concat([payload.subarray(0, 8), payload.subarray(24)]));
          return encodeRecord(r.tag, r.level, payload);
        }
        if (r === owner.head && error === "UnsupportedCrossParagraphField") {
          const raw = Buffer.from(r.raw), at = raw.length - r.payload.length;
          raw.writeUInt32LE((raw.readUInt32LE(at) - 8) >>> 0, at); return raw;
        }
        return r.raw;
      }));
      doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText").content = deflateRawSync(raw);
      damaged = cfb.write(doc);
    } finally { cfb.close(); }
    const rejected = await createExperimentalHwp5Editor(wasm, damaged);
    try {
      const before = [0, 1, 2].map(p => rejected.copyText(0, p));
      assert.throws(() => rejected.splice({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0, text: "한😀" }), { message: error });
      for (let p = 0; p < 3; p++) assert.deepEqual(rejected.copyText(0, p), before[p]);
      assert.deepEqual(Buffer.from(rejected.save().bytes), Buffer.from(damaged));
    } finally { rejected.close(); }
  }
});

test("actual chart formula paragraphs permit outside text but protect derived labels atomically", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp");
  for (const paragraph of [23, 29, 35, 64, 70, 76, 129, 130, 131, 132, 156, 162, 168]) {
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: "앞😀" });
      const saved = editor.save({ allowStaleLayout: true });
      verifyRaw(input, saved.bytes, 0, paragraph, 0, 0, "앞😀");
      const raw = editor.copyText(0, paragraph), labelStart = 11;
      const rawBuffer = Buffer.from(raw);
      let labelEnd = labelStart;
      while (rawBuffer.readUInt16LE(labelEnd * 2) !== 4) labelEnd++;
      assert.throws(() => editor.splice({ section: 0, paragraph, startUnit: labelStart, endUnit: labelStart, text: "X" }), { message: "ReadOnlyFormulaResult" });
      assert.throws(() => editor.splice({ section: 0, paragraph, startUnit: labelEnd, endUnit: labelEnd, text: "X" }), { message: "ReadOnlyFormulaResult" });
      assert.throws(() => editor.splice({ section: 0, paragraph, startUnit: labelStart, endUnit: labelEnd, text: "" }), { message: "ReadOnlyFormulaResult" });
      assert.throws(() => editor.splice({ section: 0, paragraph, startUnit: labelStart, endUnit: labelStart + 1, text: "X" }), { message: "ReadOnlyFormulaResult" });
      assert.throws(() => editor.splice({ section: 0, paragraph, startUnit: 3, endUnit: 11, text: "" }), { message: "UnsupportedControlDeletion" });
      assert.deepEqual(editor.copyText(0, paragraph), raw);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved.bytes);
      editor.splice({ section: 0, paragraph, startUnit: labelStart, endUnit: labelStart, text: "" });
      const unchanged = Buffer.from(raw).subarray(labelStart * 2, (labelStart + 1) * 2).toString("utf16le");
      editor.splice({ section: 0, paragraph, startUnit: labelStart, endUnit: labelStart + 1, text: unchanged });
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved.bytes);
      const end = raw.length / 2 - 1;
      editor.splice({ section: 0, paragraph, startUnit: end, endUnit: end, text: "뒤" });
      const second = editor.save({ allowStaleLayout: true });
      verifyRaw(saved.bytes, second.bytes, 0, paragraph, end, end, "뒤");
      const reopened = await createExperimentalHwp5Editor(wasm, second.bytes);
      try { assert.deepEqual(reopened.copyText(0, paragraph), editor.copyText(0, paragraph)); }
      finally { reopened.close(); }
    } finally { editor.close(); }
  }
});

test("chart formula modified bit survives repeated edits, length changes and restoration", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp");
  let editor = await createExperimentalHwp5Editor(wasm, input), current = "11.2";
  try {
    for (const [text, expected] of [["12.2", "68.5"], ["112.2", "168.5"], ["11.2", "67.5"]]) {
      editor.splice({ section: 0, paragraph: 19, startUnit: 0, endUnit: current.length, text });
      current = text;
      const saved = editor.save({ allowStaleLayout: true });
      const owner = paragraphRecords(inspect(saved.bytes).sections[0].bytes, 23);
      const field = owner.direct.find(r => r.tag === 71 && r.payload.readUInt32LE(0) === 0x25666d75);
      const len = field.payload.readUInt16LE(9);
      assert(field.payload.subarray(11, 11 + len * 2).toString("utf16le").endsWith(",;;" + expected));
      assert.equal(field.payload.readUInt32LE(4) & 0x8000, 0x8000);
    }
    const saved = editor.save({ allowStaleLayout: true });
    editor.close(); editor = await createExperimentalHwp5Editor(wasm, saved.bytes);
    editor.splice({ section: 0, paragraph: 19, startUnit: 0, endUnit: 4, text: "12.2" });
    const owner = paragraphRecords(inspect(editor.save({ allowStaleLayout: true }).bytes).sections[0].bytes, 23);
    assert(owner.direct.find(r => r.tag === 67 && r.level === owner.head.level + 1).payload.toString("utf16le").includes("68.5"));
  } finally { editor.close(); }
});

test("actual chart cell splice recalculates formula and preserves independently expected records and streams", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp");
  const original = inspect(input), section = original.sections[0];
  const numbers = [19, 20, 21, 22].map(index => {
    const owner = paragraphRecords(section.bytes, index);
    return Number(owner.direct.find(r => r.tag === 67 && r.level === owner.head.level + 1).payload.toString("utf16le").slice(0, -1));
  });
  numbers[0] = 12.2;
  const result = String(Number(numbers.reduce((sum, n) => sum + n, 0).toPrecision(6)));
  assert.equal(result, "68.5");
  let expected = expectedSection(section.bytes, 19, 1, 2, "2");
  expected = expectedSection(expected, 23, 8, 12, result);
  const selected = paragraphRecords(expected, 23).direct.find(r => r.tag === 71 && r.payload.readUInt32LE(0) === 0x25666d75);
  expected = Buffer.concat(records(expected).map(r => {
    if (r.start !== selected.start) return r.raw;
    const length = r.payload.readUInt16LE(9), oldCommand = r.payload.subarray(11, 11 + length * 2).toString("utf16le");
    const command = Buffer.from(oldCommand.slice(0, oldCommand.indexOf(",;;") + 3) + result, "utf16le");
    const prefix = Buffer.from(r.payload.subarray(0, 11));
    prefix.writeUInt32LE(prefix.readUInt32LE(4) | 0x8000, 4);
    prefix.writeUInt16LE(command.length / 2, 9);
    return encodeRecord(r.tag, r.level, Buffer.concat([prefix, command, r.payload.subarray(11 + length * 2)]));
  }));
  const e = await createExperimentalHwp5Editor(wasm, input);
  try {
    e.splice({ section: 0, paragraph: 19, startUnit: 1, endUnit: 2, text: "2" });
    const beforeFailure = e.copyText(0, 19);
    assert.throws(() => e.splice({ section: 0, paragraph: 19, startUnit: 1, endUnit: 2, text: "x" }), { message: "InvalidFormulaNumber" });
    assert.deepEqual(e.copyText(0, 19), beforeFailure);
    const saved = e.save({ allowStaleLayout: true }), actual = inspect(saved.bytes);
    assert.deepEqual(actual.sections[0].bytes, expected);
    assert.deepEqual([...actual.streams.keys()].sort(), [...original.streams.keys()].sort());
    for (const [path, bytes] of original.streams) if (path !== section.path) assert.deepEqual(actual.streams.get(path), bytes, path);
    const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
    try { assert.deepEqual(reopened.copyText(0, 23), e.copyText(0, 23)); } finally { reopened.close(); }
  } finally { e.close(); }
});

test("actual software tab retains its payload through text splice, save and reopen", async () => {
  for (const [start, end, text] of [[0, 0, "한😀"], [8, 8, "뒤"], [8, 10, "교체😀"], [8, 10, ""]]) {
    const e = await createExperimentalHwp5Editor(wasm, source);
    try {
      const original = e.copyText(0, 33);
      e.splice({ section: 0, paragraph: 33, startUnit: start, endUnit: end, text });
      const raw = e.copyText(0, 33), offset = start === 0 ? text.length * 2 : 0;
      assert.deepEqual(raw.subarray(offset, offset + 16), original.subarray(0, 16));
      const saved = e.save({ allowStaleLayout: true });
      verifyRaw(source, saved.bytes, 0, 33, start, end, text);
      const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
      try { assert.deepEqual(reopened.copyText(0, 33), raw); } finally { reopened.close(); }
    } finally { e.close(); }
  }
});

test("tab interior and deletion fail atomically without touching the source", async () => {
  const e = await createExperimentalHwp5Editor(wasm, source);
  try {
    const before = e.copyText(0, 33);
    for (let unit = 1; unit < 8; unit++) assert.throws(() => e.splice({ section: 0, paragraph: 33, startUnit: unit, endUnit: unit, text: "X" }), { message: "SplitControlToken" });
    assert.throws(() => e.splice({ section: 0, paragraph: 33, startUnit: 0, endUnit: 8, text: "" }), { message: "UnsupportedControlDeletion" });
    assert.deepEqual(e.copyText(0, 33), before);
    assert.deepEqual(Buffer.from(e.save().bytes), source);
  } finally { e.close(); }
});

test("actual software retained object anchors preserve their nested records and reopen", async () => {
  for (const [paragraph, position] of [[0, 0], [42, 8], [44, 8], [80, 8], [88, 16], [93, 8], [98, 8]]) {
    const e = await createExperimentalHwp5Editor(wasm, source);
    try {
      e.splice({ section: 0, paragraph, startUnit: position, endUnit: position, text: "한😀" });
      const saved = e.save({ allowStaleLayout: true });
      verifyRaw(source, saved.bytes, 0, paragraph, position, position, "한😀");
      const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
      try { assert.deepEqual(reopened.copyText(0, paragraph), e.copyText(0, paragraph)); } finally { reopened.close(); }
    } finally { e.close(); }
  }
});

test("retained anchors reject mismatched identities and missing tokens atomically", async () => {
  const owner = paragraphRecords(inspect(source).sections[0].bytes, 42);
  const text = owner.direct.find(r => r.tag === 67 && r.level === owner.head.level + 1);
  for (const error of ["ControlIdMismatch", "MissingControlToken"]) {
    const cfb = await createCfbReader(wasm);
    let damaged;
    try {
      cfb.parse(source, { strict: true }); const doc = cfb.document();
      const section = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
      section.content = deflateRawSync(Buffer.concat(owner.all.map(r => {
        if (r === text) {
          const payload = Buffer.from(r.payload);
          if (error === "ControlIdMismatch") { payload.write(" osg", 2, "ascii"); return encodeRecord(r.tag, r.level, payload); }
          return encodeRecord(r.tag, r.level, payload.subarray(16));
        }
        if (r === owner.head && error === "MissingControlToken") {
          const payload = Buffer.from(r.payload); payload.writeUInt32LE(((payload.readUInt32LE(0) & 0x80000000) | 1) >>> 0);
          return encodeRecord(r.tag, r.level, payload);
        }
        return r.raw;
      })));
      damaged = cfb.write(doc);
    } finally { cfb.close(); }
    const e = await createExperimentalHwp5Editor(wasm, damaged);
    try {
      const before = e.copyText(0, 42);
      assert.throws(() => e.splice({ section: 0, paragraph: 42, startUnit: 0, endUnit: 0, text: "X" }), { message: error });
      assert.deepEqual(e.copyText(0, 42), before); assert.deepEqual(e.save().bytes, damaged);
    } finally { e.close(); }
  }
});

test("hyperlink label replacement retains both markers and the original command", async () => {
  for (const replacement of ["한😀", ""]) {
    const e = await createExperimentalHwp5Editor(wasm, source);
    try {
      e.splice({ section: 0, paragraph: 93, startUnit: 8, endUnit: 15, text: replacement });
      const saved = e.save({ allowStaleLayout: true });
      verifyRaw(source, saved.bytes, 0, 93, 8, 15, replacement);
      const reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
      try { assert.deepEqual(reopened.copyText(0, 93), e.copyText(0, 93)); } finally { reopened.close(); }
    } finally { e.close(); }
  }
});

test("field modified attributes follow label edits, preserve outside edits and survive restoration", async () => {
  const attributes = bytes => paragraphRecords(inspect(bytes).sections[0].bytes, 93).direct.find(r => r.tag === 71 && r.payload.readUInt32LE(0) === 0x25686c6b).payload.readUInt32LE(4);
  assert.equal(attributes(source), 0x2800);
  const outside = await createExperimentalHwp5Editor(wasm, source);
  try {
    outside.splice({ section: 0, paragraph: 93, startUnit: 0, endUnit: 0, text: "밖" });
    assert.equal(attributes(outside.save({ allowStaleLayout: true }).bytes), 0x2800);
  } finally { outside.close(); }
  const e = await createExperimentalHwp5Editor(wasm, source);
  try {
    const original = e.copyText(0, 93);
    e.splice({ section: 0, paragraph: 93, startUnit: 8, endUnit: 8, text: "" });
    assert.deepEqual(Buffer.from(e.save().bytes), source);
    e.splice({ section: 0, paragraph: 93, startUnit: 8, endUnit: 15, text: "한😀" });
    const first = e.save({ allowStaleLayout: true }).bytes;
    assert.equal(attributes(first), 0xA800); verifyRaw(source, first, 0, 93, 8, 15, "한😀");
    e.splice({ section: 0, paragraph: 93, startUnit: 8, endUnit: 11, text: "mozuAPI" });
    const restored = e.save({ allowStaleLayout: true }).bytes;
    assert.equal(attributes(restored), 0xA800); verifyRaw(first, restored, 0, 93, 8, 11, "mozuAPI");
    assert.deepEqual(e.copyText(0, 93), original);
  } finally { e.close(); }
});

test("mismatched and absent hyperlink ends are rejected without mutation", async () => {
  const owner = paragraphRecords(inspect(source).sections[0].bytes, 93);
  const text = owner.direct.find(r => r.tag === 67 && r.level === owner.head.level + 1);
  for (const error of ["FieldMarkerMismatch", "UnsupportedCrossParagraphField"]) {
    const cfb = await createCfbReader(wasm); let damaged;
    try {
      cfb.parse(source, { strict: true }); const doc = cfb.document();
      const section = doc.nodes.find(n => n.name === "Section0" && doc.nodes[n.parent]?.name === "BodyText");
      section.content = deflateRawSync(Buffer.concat(owner.all.map(r => {
        if (r === text) {
          const payload = Buffer.from(r.payload);
          if (error === "FieldMarkerMismatch") { payload[32] = 120; return encodeRecord(r.tag, r.level, payload); }
          return encodeRecord(r.tag, r.level, Buffer.concat([payload.subarray(0, 30), payload.subarray(46)]));
        }
        if (r === owner.head && error === "UnsupportedCrossParagraphField") {
          const payload = Buffer.from(r.payload); payload.writeUInt32LE(((payload.readUInt32LE(0) & 0x80000000) | 16) >>> 0);
          return encodeRecord(r.tag, r.level, payload);
        }
        return r.raw;
      })));
      damaged = cfb.write(doc);
    } finally { cfb.close(); }
    const e = await createExperimentalHwp5Editor(wasm, damaged);
    try {
      const before = e.copyText(0, 93);
      assert.throws(() => e.splice({ section: 0, paragraph: 93, startUnit: 0, endUnit: 0, text: "X" }), { message: error });
      assert.deepEqual(e.copyText(0, 93), before); assert.deepEqual(e.save().bytes, damaged);
    } finally { e.close(); }
  }
});
