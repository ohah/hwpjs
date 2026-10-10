import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { hwpxParagraphCoordinates } from "../../tools/hwpx-paragraph-coordinates.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("large reference clipped tail is reachable in the actual Renderer edit window", async t => {
  const h = await workerCanvasHarness(t);
  const input = readFileSync("reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx");
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const navigation = { kind: "set-edit-window", offset: 8853, count: 1 };
  h.controller.external(navigation);
  const shown = await h.send(navigation);
  assert.equal(shown.error, undefined);
  const row = shown.content.paragraphs.find(p => p.section === 11 && p.paragraph === 8853);
  assert.ok(row);
  assert.equal(row.clipped, undefined);
  assert.equal(row.text.length, 116);
  assert.equal(row.editable, true);
  assert(h.renderer.layout().rows.some(p => p.section === row.section && p.paragraph === row.paragraph));
  assert.equal(h.controller.selectTextRange({ section: row.section, paragraph: row.paragraph, startUnit: 0, endUnit: 0 }), true);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal((await h.send({ kind: "undo" })).changed, false);
  assert.equal(row.plainEditable, true);
  const text = "후반😀<&";
  h.input.value = text + h.input.value;
  h.input.setSelectionRange(text.length, text.length);
  dispatchCanvasEvent(h.input, "input", { inputType: "insertText", data: text });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].paragraph, 8853);
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.paragraphs.find(p => p.section === 11 && p.paragraph === 8853).text, text + row.text);
  const saved = (await h.send({ kind: "save" })).bytes;
  const reader = await createHwpxReader(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  let coordinate;
  try {
    coordinate = hwpxParagraphCoordinates(reader.readTextEvents(input).events).find(p => p.section === 11 && p.paragraph === 8854);
  } finally { reader.close(); }
  assert.ok(coordinate);
  for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-plain-splice-oracle.py"], {
    input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"),
      part: "Contents/section11.xml", index: coordinate.localParagraph - 1, start: 0, end: 0, text }), timeout: 30000,
  });
  assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, saved);
});
