import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { verifyHwpxInsertion } from "../../tools/hwpx-insertion-oracle.mjs";
function fixtures(kind) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        String.raw`
import io,zipfile,base64,json,sys
kind=sys.argv[1]
if kind=='markpen':
 inner='<p:run><p:t><p:markpenBegin color="#A0B0C0"/>label<p:markpenEnd/></p:t></p:run>'
 good=inner.replace('/>label','/>검증😀label');wrong=inner.replace('<p:t>','<p:t>검증😀',1)
 badmetadata=good.replace('#A0B0C0','#010203');invalid=inner.replace('markpenEnd','unknown')
else:
 inner='<p:run><p:secPr/></p:run><p:run><p:t><p:titleMark ignore="1"/></p:t><p:ctrl><p:fieldBegin id="12" fieldid="3" type="BOOKMARK" name="label"><p:parameters cnt="1"><p:integerParam name="Prop">2</p:integerParam></p:parameters></p:fieldBegin></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef="12" fieldid="3"/></p:ctrl><p:t/></p:run>'
 good=inner.replace('<p:t>label','<p:t>검증😀label');wrong=inner.replace('<p:t>','<p:t>검증😀',1)
 badmetadata=good.replace('name="Prop">2','name="Prop">3');invalid=inner.replace('beginIDRef="12"','beginIDRef="99"')
def package(body,other='keep'):
 o=io.BytesIO()
 with zipfile.ZipFile(o,'w') as z:
  z.writestr('Contents/section0.xml','<s xmlns:p="http://www.hancom.co.kr/hwpml/2011/paragraph"><p:p>'+body+'</p:p></s>');z.writestr('guard',other)
 return base64.b64encode(o.getvalue()).decode()
print(json.dumps({k:package(v) for k,v in [('before',inner),('good',good),('wrong',wrong),('badmetadata',badmetadata),('invalid',invalid)]}|{'badother':package(good,'changed')}))
`,
        kind,
      ],
      { encoding: "utf8" },
    ),
  );
}
for (const kind of ["markpen", "bookmark"])
  test(`${kind} independent source slot rejects wrong location metadata and non-target payload`, () => {
    const f = fixtures(kind),
      request = {
        before: Buffer.from(f.before, "base64"),
        after: Buffer.from(f.good, "base64"),
        section: 0,
        sectionIndex: 0,
        startUnit: 0,
        text: "검증😀",
      };
    const result = verifyHwpxInsertion(request);
    assert.equal(result.state, "verified");
    assert.equal(result.kind, `${kind}-owned-prefix`);
    assert(result.controls.every((r) => r.wrongExpectedRejected));
    for (const bad of ["wrong", "badmetadata", "badother"])
      assert.equal(
        verifyHwpxInsertion({ ...request, after: Buffer.from(f[bad], "base64") }).state,
        "mismatch",
        bad,
      );
    assert.equal(verifyHwpxInsertion({ ...request, text: "WRONG" }).state, "mismatch");
    const unsupported = verifyHwpxInsertion({
      ...request,
      before: Buffer.from(f.invalid, "base64"),
    });
    assert.equal(unsupported.state, "unsupported");
  });
