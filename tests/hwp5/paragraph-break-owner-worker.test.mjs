import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";

const wasm = process.env.HWPJS_TEST_WASM ? readFileSync(process.env.HWPJS_TEST_WASM) : null;
for (const kind of ["page", "column"]) {
  test(`HWPX Worker ${kind} target skips edited header footer descendants`, { skip: !wasm ? "explicit owner-fixed candidate required" : false }, async t => {
    const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx");
    const preparation = await createHwpxEditor(wasm);
    let input;
    try {
      preparation.open(source);
      preparation.spliceAnchored(0, 3, 0, 0, "머리😀");
      preparation.spliceAnchored(0, 4, 0, 0, "꼬리😀");
      input = Buffer.from(preparation.save());
    } finally { preparation.close(); }
    const { send } = await workerCanvasHarness(t);
    const loaded = await send({ kind: "load", format: "hwpx", bytes: input });
    assert.equal(loaded.error, undefined);
    assert.equal((await send({ kind: "enable" })).paragraphBreakAvailable, true);
    const split = await send({ kind: "split", section: 0, paragraph: 1, atUnit: 0, breakBefore: kind });
    assert.equal(split.error, undefined);
    assert.equal(split.splitTarget.section, 0);
    assert(split.splitTarget.paragraph > 2, "right sibling must not select a nested header");
    const target = split.splitTarget.paragraph;
    const row = split.content.paragraphFlows.find(value => value.section === 0 && value.paragraph === target);
    assert.equal(row.host, "body");
    assert.equal(row.page_break, kind === "page");
    assert.equal(row.column_break, kind === "column");
    for (const marker of ["머리😀", "꼬리😀"]) assert(split.content.paragraphs.some(value => value.text.includes(marker)), marker);
    const saved = await send({ kind: "save" });
    assert.equal(saved.error, undefined);
    assert(saved.bytes instanceof Uint8Array);
    const payload = { before: input.toString("base64"), after: Buffer.from(saved.bytes).toString("base64"), kind };
    for (const flags of [[], ["-O"]]) {
      assert.equal(execFileSync("python3", [...flags, "tools/hwpx-flow-owner-oracle.py"], { input: JSON.stringify(payload), encoding: "utf8" }).trim(), "verified");
      const wrong = spawnSync("python3", [...flags, "tools/hwpx-flow-owner-oracle.py"], { input: JSON.stringify({ ...payload, kind: kind === "page" ? "column" : "page" }), encoding: "utf8" });
      assert.equal(wrong.status, 1);
      assert.match(wrong.stderr, /Wrong explicit flow flags/);
    }
    assert.equal((await send({ kind: "undo" })).changed, true);
    const undone = await send({ kind: "save" });
    assert.equal(undone.error, undefined);
    assert.deepEqual(Buffer.from(undone.bytes), input);
    assert.equal((await send({ kind: "redo" })).changed, true);
    const redone = await send({ kind: "save" });
    assert.equal(redone.error, undefined);
    assert.deepEqual(redone.bytes, saved.bytes);
    const reopened = await send({ kind: "load", format: "hwpx", bytes: saved.bytes });
    assert.equal(reopened.error, undefined);
    assert.deepEqual(reopened.content.paragraphs.map(value => value.text), split.content.paragraphs.map(value => value.text));
  });
}
