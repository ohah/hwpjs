import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createCfbReader } from "../../js/cfb.mjs";
import { deflateRawSync } from "node:zlib";
import { inspect, paragraphRecords, encodeRecord, verifyRaw } from "./style-preservation/text-record-oracle.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/software.hwp");

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
