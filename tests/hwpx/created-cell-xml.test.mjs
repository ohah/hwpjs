import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("generated cell line breaks preserve XML semantics escaping CR history and other ZIP members", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const before = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
  const editor = await createHwpxEditor(wasm),
    reopened = await createHwpxEditor(wasm);
  const values = ["\n첫😀<&\n\n끝\n", "\r\nA\rB", "\n", "<hp:lineBreak/>&"];
  try {
    editor.open(before);
    editor.enableHistory();
    const identity = editor.insertTable(0, 2, 0, {
      rows: 2,
      columns: 2,
      width: 7200,
      rowHeight: 1800,
      resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 },
    });
    for (const [index, value] of values.entries())
      editor.setCreatedCellText(0, identity, Math.floor(index / 2), index % 2, value);
    const saved = editor.save();
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,json,base64,io,zipfile,xml.etree.ElementTree as E; d=json.load(sys.stdin); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after']))); ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; part='Contents/section0.xml'; root=E.fromstring(b.read(part)); tables=list(root.iter(ns+'tbl')); assert len(tables)==1; cells=list(tables[0].iter(ns+'tc')); assert len(cells)==4;\nfor cell,value in zip(cells,d['values']):\n ts=list(cell.iter(ns+'t')); assert len(ts)==1; t=ts[0]; children=list(t); assert len(children)==value.count('\\n'); assert all(c.tag==ns+'lineBreak' for c in children); assert (t.text or '')+''.join('\\n'+(c.tail or '') for c in children)==value; assert len(list(cell.iter(ns+'p')))==1\nassert a.namelist()==b.namelist(); assert all(a.read(n)==b.read(n) for n in a.namelist() if n!=part)",
      ],
      {
        input: JSON.stringify({
          before: before.toString("base64"),
          after: Buffer.from(saved).toString("base64"),
          values,
        }),
        timeout: 30000,
      },
    );
    reopened.open(saved);
    for (const [index, value] of values.entries())
      assert.equal(reopened.anchorText(0, 3 + index), value);
    for (let index = 0; index < 5; index++) assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), before);
    for (let index = 0; index < 5; index++) assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), Buffer.from(saved));
  } finally {
    reopened.close();
    editor.close();
  }
});
