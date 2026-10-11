import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("generated table insertion preserves exact two drawing anchors at every boundary", async () => {
  const e = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  const before = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx");
  try {
    for (const unit of [0, 1, 2]) {
      e.open(before); e.enableHistory();
      const resources = Object.fromEntries(Object.entries(e.tableCreationResources()).map(([k, ids]) => [k, ids[0]]));
      e.insertTable(0, 1, unit, { rows: 1, columns: 1, width: 100, rowHeight: 17, resources });
      const after = e.save(), table = e.createdTables(0)[0];
      const data = { before: before.toString("base64"), after: Buffer.from(after).toString("base64"), unit, table_id: table.instance_id };
      const oracle = (payload, flags) => execFileSync("python3", [...flags, "tools/hwpx-drawing-table-insertion-oracle.py"], { input: JSON.stringify(payload), timeout: 30000 });
      for (const flags of [[], ["-O"]]) {
        oracle(data, flags);
        assert.throws(() => oracle({ ...data, unit: (unit + 1) % 3 }, flags), err => err.status === 1 && err.signal === null && String(err.stderr).includes("ValueError: Wrong table anchor order"));
      }
      assert.equal(e.undo(), true); assert.deepEqual(Buffer.from(e.save()), before);
      assert.equal(e.redo(), true); assert.deepEqual(e.save(), after);
      e.open(after); assert.deepEqual(e.save(), after);
    }
  } finally { e.close(); }
});
