import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("native created table save matches independent full XML/ZIP and rejects semantic mutations", () => {
  const before = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
  const args = ["test", "src/created_table_save_survey.zig", "-O", "ReleaseSafe", "--test-filter", "emit created table saved fixture"];
  if (process.env.HWPJS_TEST_ZIG_CACHE) args.push("--global-cache-dir", process.env.HWPJS_TEST_ZIG_CACHE);
  const after = execFileSync(process.env.HWPJS_TEST_ZIG ?? "zig", args, { timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  const payload = { before: before.toString("base64"), after: Buffer.from(after).toString("base64") };
  const oracle = (data, flags) => execFileSync("python3", [...flags, "tools/hwpx-created-table-save-oracle.py"], { input: JSON.stringify(data), timeout: 30000 });
  const mutate = kind => JSON.parse(execFileSync("python3", ["-c", `
import sys,json,base64,io,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin);p='{http://www.hancom.co.kr/hwpml/2011/paragraph}';out=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after']))) as z:
 root=E.fromstring(z.read('Contents/section0.xml'));tbl=next(n for n in root.iter(p+'tbl') if n.get('id')=='33')
 if d['kind']=='text': next(tbl.iter(p+'t')).text='wrong'
 elif d['kind']=='id': next(tbl.iter(p+'p')).set('id','1000001')
 elif d['kind']=='size': next(tbl.iter(p+'cellSz')).set('width','50')
 elif d['kind']=='outside': root.set('unexpected','1')
 elif d['kind']=='extra': E.SubElement(tbl,p+'unexpected')
 with zipfile.ZipFile(out,'w') as saved:
  for info in z.infolist():
   data=z.read(info.filename)
   if info.filename=='Contents/section0.xml': data=E.tostring(root,encoding='utf-8').replace(b'\\r',b'&#13;')
   if d['kind']=='header' and info.filename=='Contents/header.xml': data+=b' '
   if d['kind']=='inventory' and info.filename=='version.xml': continue
   saved.writestr(info,data)
print(json.dumps(base64.b64encode(out.getvalue()).decode()))
`], { input: JSON.stringify({ ...payload, kind }), encoding: "utf8", timeout: 30000 }));
  for (const flags of [[], ["-O"]]) {
    assert.equal(JSON.parse(oracle(payload, flags)).verified, true);
    const expected = { text: "wrong cell Unicode text", id: "wrong cell paragraph ID", size: "wrong cell dimensions", outside: "non-table section content changed", extra: "wrong table child inventory", header: "unselected ZIP payload changed", inventory: "ZIP inventory/order changed" };
    for (const [kind, message] of Object.entries(expected)) {
      assert.throws(() => oracle({ ...payload, after: mutate(kind) }, flags), error => error.status === 1 && error.signal === null && String(error.stderr).includes(`ValueError: ${message}`), `accepted or misclassified ${kind} mutant`);
    }
  }
});
