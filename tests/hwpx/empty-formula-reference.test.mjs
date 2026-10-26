import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

for (const [suffix, unmatched] of [
  ["issue1891/80168_regulatory_analysis.hwpx", 1],
  ["issue1891/86712_regulatory_analysis.hwpx", 4],
  ["issue5729/stacked_tac_band_om_top.hwpx", 1],
]) {
  test(`empty formula query preserves unmatched source fields: ${suffix}`, async () => {
    const path = `reference/rhwp/samples/${suffix}`;
    const input = readFileSync(path);
    const inspect = `import json,sys,zipfile,xml.etree.ElementTree as E
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(sys.argv[1]) as z:
 r=E.fromstring(z.read('Contents/section0.xml'))
 starts=list(r.iter(p+'fieldBegin')); ends={e.get('beginIDRef') for e in r.iter(p+'fieldEnd')}
 print(json.dumps({'formulas':sum(e.get('type')=='FORMULA' for e in starts),'unmatched':sum(e.get('id') not in ends for e in starts)}))`;
    assert.deepEqual(
      JSON.parse(
        execFileSync("python3", ["-c", inspect, path], { encoding: "utf8", timeout: 30000 }),
      ),
      { formulas: 0, unmatched },
    );
    const editor = await createHwpxEditor(
      readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
    );
    try {
      editor.open(input);
      editor.enableHistory();
      const snapshot = editor.paragraphTextSnapshot(0);
      assert(snapshot.length > 0);
      assert.deepEqual(editor.formulaCurrent(0), []);
      assert.deepEqual(editor.formulaCurrent(0), []);
      assert.deepEqual(editor.paragraphTextSnapshot(0), snapshot);
      assert(Buffer.from(editor.save()).equals(input));
      assert.equal(editor.undo(), false);
      assert.equal(editor.redo(), false);
      editor.open(input);
      assert.deepEqual(editor.formulaCurrent(0), []);
      assert(Buffer.from(editor.save()).equals(input));
      assert(readFileSync(path).equals(input));
    } finally {
      editor.close();
    }
  });
}
