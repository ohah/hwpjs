import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
test("actual aift section-one field exterior stays editable through Canvas range permission", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit aift candidate required");
  const path = "reference/rhwp/samples/hwpx/aift.hwpx",
    input = readFileSync(path);
  const h = await workerCanvasHarness(t, { rangeQueries: true });
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const view = await h.send({ kind: "set-edit-window", offset: 195, count: 1 });
  assert.equal(view.error, undefined);
  const row = view.content.paragraphs.find((p) => p.section === 1 && p.paragraph === 195);
  assert(row);
  assert.equal(row.plainEditable, false);
  const query = {
    kind: "query-edit-range",
    requestId: 1,
    section: 1,
    paragraph: 195,
    startUnit: 0,
    endUnit: 0,
  };
  assert.equal((await h.send(query)).allowed, true);
  assert.equal(
    h.controller.selectTextRange({ section: 1, paragraph: 195, startUnit: 0, endUnit: 0 }),
    true,
  );
  await h.flushQueries();
  const prefix = "외부입력😀<&";
  assert.equal(h.controller.replaceSelectedText(prefix), true);
  assert.equal((await h.flush()).error, undefined);
  const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
  const request = {
    before: input.toString("base64"),
    after: saved.toString("base64"),
    part: "Contents/section1.xml",
    paragraph: 9,
    prefix,
  };
  for (const flags of [[], ["-O"]])
    execFileSync("python3", [...flags, "tools/hwpx-field-outside-oracle.py"], {
      input: JSON.stringify(request),
      timeout: 30000,
    });
  assert.equal((await h.send({ kind: "undo" })).changed, true);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal((await h.send({ kind: "redo" })).changed, true);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
  assert.deepEqual(readFileSync(path), input);
});
test("actual MEMO label uses Canvas Worker native permission without changing annotation ownership", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit MEMO candidate required");
  const input = readFileSync("reference/rhwp/samples/hwpx/aift.hwpx"),
    h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const view = await h.send({ kind: "set-edit-window", offset: 3007, count: 1 });
  assert.equal(view.error, undefined);
  const row = view.content.paragraphs.find((p) => p.section === 2 && p.paragraph === 3007);
  assert(row);
  assert.equal(row.fieldLabels.length, 1);
  assert.equal(row.editable, true);
  const permission = await h.send({
    kind: "query-edit-range",
    requestId: 1,
    section: 2,
    paragraph: 3007,
    startUnit: 0,
    endUnit: 0,
  });
  assert.equal(permission.error, undefined);
  assert.equal(permission.allowed, true);
  assert.equal(
    h.controller.selectTextRange({ section: 2, paragraph: 3007, startUnit: 0, endUnit: 0 }),
    true,
  );
  const marker = "화면메모😀<&";
  dispatchCanvasEvent(h.input, "beforeinput", {
    inputType: "insertText",
    data: marker,
    isComposing: false,
  });
  h.input.value = marker + row.text;
  h.input.setSelectionRange(marker.length, marker.length);
  dispatchCanvasEvent(h.input, "input");
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
  const request = {
    before: input.toString("base64"),
    after: saved.toString("base64"),
    section: 2,
    paragraph: 2694,
    beginId: "2135782115",
    text: marker,
  };
  for (const flags of [[], ["-O"]])
    execFileSync("python3", [...flags, "tools/memo-label-oracle.py"], {
      input: JSON.stringify(request),
      timeout: 30000,
    });
  assert.equal(h.controller.history("undo"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
  assert.equal(h.controller.history("redo"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
});
