import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("title roundtrip oracle rejects lost moved and mutated metadata and ZIP payloads", () => {
  const generate = `
import base64,io,json,zipfile
def archive(xml,header="keep"):
    data=io.BytesIO()
    with zipfile.ZipFile(data,"w") as z:
        z.writestr("Contents/section0.xml",xml)
        z.writestr("Contents/header.xml",header)
    return base64.b64encode(data.getvalue()).decode()
source='<s:sec xmlns:s="http://www.hancom.co.kr/hwpml/2011/section" xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:p id="1"><p:run charPrIDRef="1"><p:t>A<p:titleMark ignore="0"/>B</p:t></p:run></p:p></s:sec>'
before=archive(source)
cases=[("positive",source,"keep"),("lost",source.replace('<p:titleMark ignore="0"/>',''),"keep"),("moved",source.replace('A<p:titleMark ignore="0"/>B','AB<p:titleMark ignore="0"/>'),"keep"),("changed",source.replace('ignore="0"','ignore="1"'),"keep"),("style",source.replace('charPrIDRef="1"','charPrIDRef="2"'),"keep"),("outside",source,"changed")]
cases.extend([("paragraph-tail",source.replace('</p:p>','</p:p>forged'),"keep"),("paragraph-text",source.replace('<p:p id="1">','<p:p id="1">forged'),"keep")])
print(json.dumps([{ "name":name,"paragraph":1,"before":before,"after":archive(xml,header)} for name,xml,header in cases]))
`;
  const cases = JSON.parse(execFileSync("python3", ["-c", generate], { timeout: 30000 }));
  for (const flags of [[], ["-O"]]) {
    for (const item of cases) {
      const run = () => execFileSync("python3", [...flags, "tools/hwpx-title-roundtrip-oracle.py"], { input: JSON.stringify(item), timeout: 30000 });
      if (item.name === "positive") run();
      else assert.throws(run, error => error.status === 1 && error.signal === null && /ValueError: (Merged metadata position\/source mismatch|Merged text\/style\/anchor mismatch|Non-target payload|Paragraph surrounding text)/.test(String(error.stderr)), item.name);
    }
    for (const paragraph of [true, 0, 2]) {
      assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-title-roundtrip-oracle.py"], { input: JSON.stringify({ ...cases[0], paragraph }), timeout: 30000 }), error => error.status === 1 && /ValueError: (Invalid paragraph|Paragraph out of range)/.test(String(error.stderr)));
    }
  }
});
