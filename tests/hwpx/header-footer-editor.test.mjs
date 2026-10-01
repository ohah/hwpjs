import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("public HWPX header footer owner and bodies edit independently and preserve whole XML", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx");
  const editor = await createHwpxEditor(readFileSync("zig-out/bin/hwpjs.wasm"));
  const paragraphs = [2, 3, 4];
  try {
    editor.open(input);
    assert.equal(editor.canEdit(0, 2), true);
    const originals = paragraphs.map(p => editor.anchorText(0, p));
    assert.equal(originals[0], "");
    assert.equal(originals[1], "Header 이것은 머리말입니다\ufffc.");
    assert.equal(originals[2], "Footer 이것은 꼬리말입니다.");
    for (const [i, paragraph] of paragraphs.entries()) {
      editor.spliceAnchored(0, paragraph, 0, 0, "검증😀");
      for (const [j, target] of paragraphs.entries()) assert.equal(editor.anchorText(0, target), (j <= i ? "검증😀" : "") + originals[j]);
    }
    const output = editor.save();
    const oracle = `import io,json,sys,base64,zipfile,xml.etree.ElementTree as E
d=json.loads(sys.stdin.readline()); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory')
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
for name in a.namelist():
 if name!='Contents/section0.xml':
  if a.read(name)!=b.read(name): raise ValueError(name)
  continue
 x=E.fromstring(a.read(name)); y=E.fromstring(b.read(name)); paragraphs=list(x.iter(p+'p'))
 for index in [2,3,4]:
  t=next(t for run in paragraphs[index-1].findall(p+'run') for t in run.findall(p+'t')); t.text='검증😀'+(t.text or '')
 def signature(e): return (e.tag,sorted(e.attrib.items()),e.text,e.tail,[signature(c) for c in e])
 if signature(x)!=signature(y): raise ValueError('complete XML mismatch')`;
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(output).toString("base64") }) + "\n", timeout: 30000 });
    for (const mutation of ["header-id", "footer-text", "other-body"]) {
      const corrupted = execFileSync("python3", ["-c", `import io,sys,base64,zipfile,xml.etree.ElementTree as E
source=zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.readline()))); target=io.BytesIO(); p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(target,'w') as out:
 out.comment=source.comment
 for item in source.infolist():
  data=source.read(item.filename)
  if item.filename=='Contents/section0.xml':
   root=E.fromstring(data)
   if sys.argv[1]=='header-id': next(root.iter(p+'header')).set('id','999')
   elif sys.argv[1]=='footer-text': next(next(root.iter(p+'footer')).iter(p+'t')).text='wrong owner'
   else: next(root.iter(p+'t')).text='wrong body'
   data=E.tostring(root,encoding='utf-8')
  out.writestr(item,data)
sys.stdout.buffer.write(target.getvalue())`, mutation], { input: Buffer.from(output).toString("base64") + "\n", timeout: 30000 });
      for (const flags of [[], ["-O"]]) {
        const result = spawnSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: corrupted.toString("base64") }) + "\n", timeout: 30000 });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1, mutation);
        assert.match(result.stderr.toString(), /ValueError: complete XML mismatch/);
      }
    }
    for (const paragraph of paragraphs) editor.spliceAnchored(0, paragraph, 0, 4, "");
    assert.deepEqual(Buffer.from(editor.save()), input);
    editor.open(output);
    assert.deepEqual(editor.save(), output);
    for (const [i, paragraph] of paragraphs.entries()) assert.equal(editor.anchorText(0, paragraph), "검증😀" + originals[i]);
  } finally { editor.close(); }
});
