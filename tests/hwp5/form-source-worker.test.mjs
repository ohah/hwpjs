import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { inspect, expectedSection } from "./style-preservation/text-record-oracle.mjs";
import { formSourceFixtures } from "./form-source-fixtures.mjs";

test("observed HWP5 forms reach every Canvas paragraph with independent record preservation", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, "explicit form-retention candidate required");
  const h = await workerCanvasHarness(t);
  let verified = 0;
  for (const { name, paragraphs } of formSourceFixtures) {
    const input = readFileSync(`reference/rhwp/samples/${name}`),
      before = inspect(input);
    for (let paragraph = 0; paragraph < paragraphs; paragraph++) {
      const loaded = await h.send({ kind: "load", format: "hwp5", bytes: input });
      assert.equal(loaded.error, undefined);
      assert.equal((await h.send({ kind: "enable" })).error, undefined);
      const original = loaded.content.paragraphs.find(
        (row) => row.section === 0 && row.paragraph === paragraph,
      );
      assert(original?.editable);
      assert.equal(
        h.controller.selectTextRange({ section: 0, paragraph, startUnit: 0, endUnit: 0 }),
        true,
        `${name}:${paragraph} selection`,
      );
      const text = "화면양식😀";
      assert.equal(
        dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: text })
          .defaultPrevented,
        false,
      );
      h.input.value = text + original.text;
      h.input.setSelectionRange(text.length, text.length);
      dispatchCanvasEvent(h.input, "input");
      assert.deepEqual(h.requests.at(-1), {
        kind: "splice",
        origin: "canvas",
        section: 0,
        paragraph,
        startUnit: 0,
        endUnit: 0,
        text,
      });
      const changed = await h.flush();
      assert.equal(changed.error, undefined);
      assert.equal(
        changed.content.paragraphs.find((row) => row.paragraph === paragraph).text,
        text + original.text,
      );
      const saved = await h.send({ kind: "save", allowStaleLayout: true });
      assert.equal(saved.error, undefined);
      assert.deepEqual(
        inspect(saved.bytes).sections[0].bytes,
        expectedSection(before.sections[0].bytes, paragraph, 0, 0, text, {
          fieldIds: [0x25636c6b],
        }),
      );
      assert.equal(h.controller.history("undo"), true);
      assert.equal((await h.flush()).error, undefined);
      assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
      assert.equal(h.controller.history("redo"), true);
      assert.equal((await h.flush()).error, undefined);
      assert.deepEqual((await h.send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
      const reopened = await h.send({ kind: "load", format: "hwp5", bytes: saved.bytes });
      assert.equal(reopened.error, undefined);
      assert.equal(
        reopened.content.paragraphs.find((row) => row.paragraph === paragraph).text,
        text + original.text,
      );
      verified++;
    }
  }
  assert.equal(verified, 1446);
  t.diagnostic(
    "1446 original paragraph prefixes; real Worker/WASM and independent full Section, simulated DOM/Canvas, not browser or Hangul layout proof",
  );
});
