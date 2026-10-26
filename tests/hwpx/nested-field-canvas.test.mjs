import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

for (const [name, paragraph, beginId] of [
  ["80168", 3807, "1575661791"],
  ["86712", 1261, "1505851853"],
]) {
  test(`Canvas Worker chooses the owned nested label: ${name}`, async (t) => {
    assert(process.env.HWPJS_TEST_WASM, "requires explicit range-target candidate");
    const input = readFileSync(`reference/rhwp/samples/issue1891/${name}_regulatory_analysis.hwpx`);
    const h = await workerCanvasHarness(t);
    assert.equal((await h.send({ kind: "load", format: "hwpx", bytes: input })).error, undefined);
    assert.equal((await h.send({ kind: "enable" })).error, undefined);
    const before = await h.send({ kind: "set-edit-window", offset: paragraph - 1, count: 1 });
    assert.equal(before.error, undefined);
    const row = before.content.paragraphs.find(
      (p) => p.section === 0 && p.paragraph === paragraph - 1,
    );
    assert(row);
    assert.equal(row.fieldLabels.length, 2);
    const unit = row.fieldLabels[1].start,
      text = "중첩😀<&";
    const permission = await h.send({
      kind: "query-edit-range",
      requestId: 1,
      section: 0,
      paragraph: paragraph - 1,
      startUnit: unit,
      endUnit: unit,
    });
    assert.equal(permission.error, undefined);
    assert.equal(permission.allowed, true);
    assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
    assert.equal(
      h.controller.selectTextRange({
        section: 0,
        paragraph: paragraph - 1,
        startUnit: unit,
        endUnit: unit,
      }),
      true,
    );
    dispatchCanvasEvent(h.input, "beforeinput", {
      inputType: "insertText",
      data: text,
      isComposing: false,
    });
    h.input.value = row.text.slice(0, unit) + text + row.text.slice(unit);
    h.input.setSelectionRange(unit + text.length, unit + text.length);
    dispatchCanvasEvent(h.input, "input");
    const changed = await h.flush();
    assert.equal(changed.error, undefined);
    assert.equal(
      changed.content.paragraphs.find((p) => p.section === 0 && p.paragraph === paragraph - 1).text,
      h.input.value,
    );
    const saved = Buffer.from((await h.send({ kind: "save" })).bytes);
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "tools/hwpx-nested-field-edit-oracle.py"], {
        input: JSON.stringify({
          before: input.toString("base64"),
          after: saved.toString("base64"),
          paragraph,
          beginId,
          text,
        }),
        timeout: 30000,
      });
    assert.equal((await h.send({ kind: "undo" })).error, undefined);
    assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), input);
    assert.equal((await h.send({ kind: "redo" })).error, undefined);
    assert.deepEqual(Buffer.from((await h.send({ kind: "save" })).bytes), saved);
  });
}
