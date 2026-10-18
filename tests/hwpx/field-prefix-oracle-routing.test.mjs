import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectFieldPrefixOracle } from "../../tools/hwpx-field-prefix-oracle.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("field prefix oracle selection preserves section paragraph and native element identity", () => {
  const request = { before: "source", section: 2, paragraph: 2694, beginElement: 25779 };
  const target = { part: "Contents/section2.xml", paragraph: 2694, beginElement: 25779, beginId: "memo" };
  const calls = [];
  const run = (_command, [path], options) => {
    calls.push(path); assert.deepEqual(JSON.parse(options.input), { mode: "inventory", before: "source" });
    return JSON.stringify(path.endsWith("memo-label-oracle.py") ? [target] : [{ ...target, part: "Contents/section0.xml" }, { ...target, paragraph: 1 }, { ...target, beginElement: 7 }]);
  };
  assert.deepEqual(selectFieldPrefixOracle(request, run), { oracle: "tools/memo-label-oracle.py", beginId: "memo" });
  assert.equal(calls.length, 3);
  assert.throws(() => selectFieldPrefixOracle(request, () => "[]"), /MissingIndependentFieldFragment/);
  assert.throws(() => selectFieldPrefixOracle(request, () => JSON.stringify([target, target])), /must be unique/);
  assert.throws(() => selectFieldPrefixOracle(request, () => "{}"), /InvalidFieldOracleInventory/);
  assert.deepEqual(selectFieldPrefixOracle(request, () => JSON.stringify([target])), { oracle: "tools/hwpx-field-edit-oracle.py", beginId: "memo" });
});

test("actual aift MEMO target selects the independent annotation-preserving oracle", () => {
  const before = readFileSync("reference/rhwp/samples/hwpx/aift.hwpx").toString("base64");
  assert.deepEqual(selectFieldPrefixOracle({ before, section: 2, paragraph: 2694, beginElement: 25779 }), { oracle: "tools/memo-label-oracle.py", beginId: "2135782115" });
  for (const flags of [[], ["-O"]]) assert.match(execFileSync("python3", [...flags, "tools/memo-label-oracle.py", "--self-test"], { encoding: "utf8", timeout: 10000 }), /self-test verified/);
});

test("independent prefix site crosses only zero-width metadata and preserves object order", () => {
  const program = String.raw`
import sys,xml.etree.ElementTree as E
sys.path.insert(0,'tools')
from hwpx_field_prefix_site import leading_object_site
P='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
begin="<p:ctrl><p:fieldBegin id='7'/></p:ctrl>"
end="<p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl>"
def check(body,expected):
 tree=E.fromstring("<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>"+body+"</r>")
 marker=next(tree.iter(P+'fieldBegin'));site=list(tree.iter(P+'t'))[-1]
 chosen=leading_object_site(tree,marker,site);chosen.text='X'+(chosen.text or '')
 wanted=E.fromstring("<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>"+expected+"</r>")
 if E.tostring(tree)!=E.tostring(wanted):raise ValueError('Incorrect source prefix site')
for obj in ['tbl','pic','container','ellipse','line','rect','checkBtn']:
 body='<p:p><p:run>'+begin+'<p:secPr/></p:run><p:run><p:'+obj+'/></p:run><p:run><p:t>A</p:t>'+end+'</p:run></p:p>'
 check(body,body.replace('<p:'+obj+'/>','<p:t>X</p:t><p:'+obj+'/>'))
 body='<p:p><p:run>'+begin+'<p:'+obj+'/><p:t>A</p:t>'+end+'</p:run></p:p>'
 check(body,body.replace('<p:'+obj+'/>','<p:t>X</p:t><p:'+obj+'/>'))
for preceding in ['<p:t/>','<p:t>before</p:t>',"<p:ctrl><p:footNote/></p:ctrl>",'<p:future/>',"<x:ellipse xmlns:x='urn:foreign'/>","<p:ctrl><p:pageNum/><p:future/></p:ctrl>","<p:ctrl><x:pageNum xmlns:x='urn:foreign'/></p:ctrl>"]:
 body='<p:p><p:run>'+begin+preceding+'<p:tbl/><p:t>A</p:t>'+end+'</p:run></p:p>'
 check(body,body.replace('<p:t>A</p:t>','<p:t>XA</p:t>'))
for metadata in ['', '<p:secPr/>']:
 body='<p:p><p:run>'+begin+metadata+'</p:run><p:run><p:ctrl><p:autoNum num="1" numType="PAGE"/></p:ctrl><p:t>A</p:t>'+end+'</p:run></p:p>'
 check(body,body.replace('<p:ctrl><p:autoNum','<p:t>X</p:t><p:ctrl><p:autoNum'))
for count in [1,2]:
 body='<p:p><p:run>'+begin+('<p:ctrl><p:pageNum pos="BOTTOM_CENTER"/></p:ctrl>'*count)+'<p:tbl/><p:t>A</p:t>'+end+'</p:run></p:p>'
 check(body,body.replace('<p:tbl/>','<p:t>X</p:t><p:tbl/>'))
body='<p:p><p:run>'+begin+'</p:run><p:run/><p:run><p:tbl/><p:t>A</p:t>'+end+'</p:run></p:p>'
check(body,body.replace('<p:t>A</p:t>','<p:t>XA</p:t>'))
body='<p:p><p:run><p:tbl/>'+begin+'<p:t>A</p:t>'+end+'</p:run></p:p>'
try:check(body,body)
except ValueError as error:
 if str(error)!='Leading object is outside selected field':raise
else:raise ValueError('Accepted object outside the chosen field')
print('27 prefix site cases verified')
`;
  for (const flags of [[], ["-O"]]) assert.match(execFileSync("python3", [...flags, "-c", program], { encoding: "utf8", timeout: 10000 }), /27 prefix site cases verified/);
});

test("object-only field inventory preserves the outer paragraph and independent saved XML", () => {
  const program = String.raw`
import sys,io,zipfile,runpy,xml.etree.ElementTree as E
sys.path.insert(0,'tools')
base=runpy.run_path('tools/hwpx-field-edit-oracle.py')
P=base['P']
source="<r xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='7' type='CLICK_HERE' dirty='0'/></p:ctrl><p:tbl><p:subList><p:p><p:run><p:t>inside</p:t></p:run></p:p></p:subList></p:tbl><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:run></p:p></r>"
tree=E.fromstring(source)
rows=base['fragments'](tree)
if sorted((p,n.tag) for _,p,n in rows)!=[(1,P+'tbl'),(2,P+'t')]:raise ValueError('Missing independent outer object paragraph')
with_text=E.fromstring(source);tail=E.Element(P+'t');tail.text='existing'
next(with_text.iter(P+'run')).insert(2,tail)
chosen=[n for _,p,n in base['fragments'](with_text) if p==1]
if chosen!=[tail]:raise ValueError('Object fallback displaced an existing text site')
def archive(root,other=b'keep'):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as z:
  z.writestr(zipfile.ZipInfo('Contents/section0.xml'),E.tostring(root))
  z.writestr(zipfile.ZipInfo('other.bin'),other)
 return out.getvalue()
before=archive(tree)
next(tree.iter(P+'fieldBegin')).set('dirty','1')
text=E.Element(P+'t');text.text='X'
next(tree.iter(P+'run')).insert(1,text)
base['compare'](before,archive(tree),'X','7',1)
try:base['compare'](before,archive(tree),'X','7',1,1)
except ValueError as error:
 if str(error)!='Object-only field oracle supports prefix insertion only':raise
else:raise ValueError('Accepted object-only non-prefix operation')
blocked=E.fromstring(source);next(blocked.iter(P+'run')).insert(1,E.Element(P+'future'))
blocked_before=archive(blocked)
next(blocked.iter(P+'fieldBegin')).set('dirty','1');next(blocked.iter(P+'tbl')).text='X'
try:base['compare'](blocked_before,archive(blocked),'X','7',1)
except ValueError as error:
 if str(error)!='Validated object prefix site required':raise
else:raise ValueError('Invented an insertion inside an object after unknown control')
for mode in ['inner','style','payload']:
 bad=E.fromstring(E.tostring(tree));run=next(bad.iter(P+'run'))
 if mode=='inner':run.remove(run[1]);next(bad.iter(P+'subList')).find(P+'p').find(P+'run').find(P+'t').text='Xinside'
 if mode=='style':next(bad.iter(P+'p')).set('paraPrIDRef','999')
 try:base['compare'](before,archive(bad,b'wrong' if mode=='payload' else b'keep'),'X','7',1)
 except ValueError:pass
 else:raise ValueError('Accepted misplaced text or non-target mutation')
for replacement in ['future','ctrl']:
 bad=E.fromstring(source);next(bad.iter(P+'tbl')).tag=P+replacement
 if any(p==1 for _,p,_ in base['fragments'](bad)):raise ValueError('Invented unsupported outer object')
print('object-only inventory and three corruptions verified')
`;
  for (const flags of [[], ["-O"]]) assert.match(execFileSync("python3", [...flags, "-c", program], { encoding: "utf8", timeout: 10000 }), /object-only inventory and three corruptions verified/);
});

test("actual graphic and automatic-number field prefixes preserve complete XML ZIP and history", async t => {
  if (!process.env.HWPJS_TEST_WASM) { t.skip("explicit candidate WASM required"); return; }
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    for (const [path, section, paragraph, local] of [
      ["reference/rhwp/samples/hwpx/opengov/36382669_결재문서본문_’26년 제3차 강사선정 심의회 운영결과.hwpx", 2, 114, 1],
      ["reference/rhwp/samples/hwpx/opengov/36385226_결재문서본문_제2처리장 슬러지인발용 에어리프트 브로워 2호기 소모품 교체 보고.hwpx", 0, 74, 74],
      ["reference/rhwp/samples/hwpx/opengov/36392900_결재문서본문_일일굴착복구공사현황보고.hwpx", 0, 90, 90],
      ["reference/rhwp/samples/hwpx/opengov/36382669_결재문서본문_’26년 제3차 강사선정 심의회 운영결과.hwpx", 2, 121, 8],
      ["reference/rhwp/samples/hwpx/opengov/36382669_결재문서본문_’26년 제3차 강사선정 심의회 운영결과.hwpx", 2, 129, 16],
      ["reference/rhwp/samples/issue2083_hide_fill_page.hwpx", 2, 121, 1],
      ["reference/rhwp/samples/issue2813/dangjik_dutylog.hwpx", 0, 141, 141],
      ["reference/rhwp/samples/issue2470/36341511_masked.hwpx", 0, 72, 72],
    ]) {
      const input = readFileSync(path); editor.open(input); editor.enableHistory();
      const target = editor.fieldRangeTarget(section, paragraph, 0, 0); assert(target);
      const selected = selectFieldPrefixOracle({ before: input.toString("base64"), section, paragraph: local, beginElement: target.beginElement });
      assert.equal(selected.oracle, "tools/hwpx-field-edit-oracle.py");
      const text = "경로😀<&"; editor.spliceFieldLabel(section, paragraph, target.beginElement, 0, 0, text);
      const saved = Buffer.from(editor.save());
      const request = { mode: "prefix", before: input.toString("base64"), after: saved.toString("base64"), section, paragraph: local, beginId: selected.beginId, text };
      for (const flags of [[], ["-O"]]) {
        execFileSync("python3", [...flags, selected.oracle], { input: JSON.stringify(request), timeout: 30000 });
        assert.throws(() => execFileSync("python3", [...flags, selected.oracle], { input: JSON.stringify({ ...request, text: "wrong" }), timeout: 30000 }), error => error.status === 1 && /Unexpected XML change/.test(String(error.stderr)));
      }
      assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved); assert.deepEqual(Buffer.from(editor.save()), saved);
      assert.deepEqual(readFileSync(path), input);
    }
  } finally { editor.close(); }
});
