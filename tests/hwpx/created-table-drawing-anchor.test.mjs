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
        const corrupt = execFileSync("python3", ["-c", `
import io,sys,zipfile,xml.etree.ElementTree as E,base64
raw=sys.stdin.buffer.read();out=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(raw)) as z:
 root=E.fromstring(z.read('Contents/section0.xml'))
 next(root.iter('{http://www.hancom.co.kr/hwpml/2011/paragraph}line')).set('id','4294967295')
 with zipfile.ZipFile(out,'w') as saved:
  for info in z.infolist():
   saved.writestr(info,E.tostring(root,encoding='utf-8') if info.filename=='Contents/section0.xml' else z.read(info.filename))
print(base64.b64encode(out.getvalue()).decode())
`], { input: after, encoding: "utf8", timeout: 30000 }).trim();
        assert.throws(() => oracle({ ...data, after: corrupt }, flags), err => err.status === 1 && err.signal === null && String(err.stderr).includes("ValueError: Outside table XML changed"));
      }
      assert.equal(e.undo(), true); assert.deepEqual(Buffer.from(e.save()), before);
      assert.equal(e.redo(), true); assert.deepEqual(e.save(), after);
      e.spliceAnchored(0, 1, 0, 0, "앞😀<&");
      const edited = e.save();
      assert.equal(e.createdTables(0)[0].anchor_unit, unit + 5);
      for (const flags of [[], ["-O"]]) {
        const payload = { ...data, after: Buffer.from(edited).toString("base64"), prefix: "앞😀<&" };
        oracle(payload, flags);
        assert.throws(() => oracle({ ...payload, prefix: "wrong" }, flags), err => err.status === 1 && err.signal === null && String(err.stderr).includes("ValueError: Outside table XML changed"));
      }
      assert.equal(e.undo(), true); assert.deepEqual(e.save(), after);
      assert.throws(() => e.spliceAnchored(0, 1, 0, 1, ""), /ProtectedInlineControl|ProtectedCreatedTableAnchor/);
      assert.deepEqual(e.save(), after);
      assert.equal(e.redo(), true); assert.deepEqual(e.save(), edited);
      e.open(after); assert.deepEqual(e.save(), after);
    }
  } finally { e.close(); }
});
