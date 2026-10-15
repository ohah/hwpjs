import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("manual result oracle selects section two and rejects wrong or invalid section in both Python modes", () => {
  const make = `import base64,io,json,zipfile
p='http://www.hancom.co.kr/hwpml/2011/paragraph'
def document(result):
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:
  z.writestr('Contents/section0.xml','<root><untouched>same</untouched></root>')
  z.writestr('Contents/header.xml','<header/>')
  z.writestr('Contents/section2.xml','<root xmlns:p="'+p+'"><p:p><p:fieldBegin type="FORMULA" id="7"><p:parameters><p:stringParam name="LastResult">2</p:stringParam></p:parameters></p:fieldBegin><p:t>'+result+'</p:t><p:fieldEnd beginIDRef="7"/><p:t>other</p:t></p:p></root>')
 return base64.b64encode(b.getvalue()).decode()
print(json.dumps({'before':document('2'),'after':document('changed'),'ordinal':0,'display':'changed','section':2}))`;
  const data = JSON.parse(execFileSync("python3", ["-c", make], { encoding: "utf8" }));
  for (const flags of [[], ["-O"]]) {
    const inventory = JSON.parse(execFileSync("python3", [...flags, "tools/hwpx-manual-result-inventory.py"], { input: Buffer.from(data.before, "base64"), encoding: "utf8", timeout: 30000 }));
    assert.deepEqual(inventory, [{ section: 2, ordinal: 0, localParagraph: 1 }]);
    const verify = value => execFileSync("python3", [...flags, "tools/hwpx-manual-result-save-oracle.py"], { input: JSON.stringify(value), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 });
    assert.match(verify(data), /Manual result complete XML and ZIP verified/);
    assert.match(verify({ ...data, selfTest: true }), /Five manual-result mutations rejected/);
    for (const section of [0, -1, true, "2", 2.5]) {
      assert.throws(() => verify({ ...data, section }), error => error.status !== 0 && /Section index|Non-target payload|Formula ordinal/.test(error.stderr.toString()));
    }
    assert.throws(() => verify({ ...data, display: "wrong" }), error => error.status !== 0 && /Complete XML differs/.test(error.stderr.toString()));
  }
});

test("manual result audit rejects missing duplicate empty and unknown arguments before opening files", () => {
  for (const args of [[], ["--wasm="], ["--wasm=a", "--wasm=b"], ["--fixture=x"], ["--history"], ["--root=x"]]) {
    assert.throws(() => execFileSync(process.execPath, ["tools/hwpx-manual-result-input-audit.mjs", ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }), error => error.status !== 0 && /MissingAuditWasm|DuplicateAuditArgument|Unknown argument/.test(error.stderr.toString()));
  }
});
