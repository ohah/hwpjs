import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";

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
