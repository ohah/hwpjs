import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("generated table outside crossing field preserves independent XML linked spans and redo", async () => {
  const e = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  const source = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx");
  try {
    e.open(source); e.enableHistory();
    const resources = Object.fromEntries(Object.entries(e.tableCreationResources()).map(([key, ids]) => [key, ids[0]]));
    const options = { rows: 1, columns: 1, width: 100, rowHeight: 17, resources };
    assert.throws(() => e.insertTable(0, 2, 7, options), /ProtectedFieldRange/);
    assert.deepEqual(Buffer.from(e.save()), source);
    e.insertTable(0, 2, 0, options);
    const before = e.save(), old = e.fieldLabels(0, 2)[0];
    e.splice(0, 2, 0, 0, "앞😀<&");
    const after = e.save(), now = e.fieldLabels(0, 2)[0];
    assert.equal(now.start, old.start + 5); assert.equal(now.end, old.end + 5);
    assert.equal(e.createdTables(0)[0].anchor_unit, 5);
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-field-outside-oracle.py"], {
      input: JSON.stringify({ before: Buffer.from(before).toString("base64"), after: Buffer.from(after).toString("base64"), part: "Contents/section0.xml", paragraph: 2, prefix: "앞😀<&" }), timeout: 30000,
    });
    assert.equal(e.undo(), true); assert.deepEqual(e.save(), before);
    assert.throws(() => e.splice(0, 2, 7, 0, "x"), /ProtectedFieldRange/);
    assert.deepEqual(e.save(), before);
    assert.equal(e.redo(), true); assert.deepEqual(e.save(), after);
    e.open(after); assert.deepEqual(e.save(), after);
    assert.equal(e.fieldLabels(0, 2)[0].start, now.start);
    assert.equal(e.fieldLabels(0, 2)[0].end, now.end);
  } finally { e.close(); }
});
