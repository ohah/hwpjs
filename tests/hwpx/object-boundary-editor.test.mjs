import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("public HWPX object-only paragraph inserts at every boundary without changing objects", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx");
  const editor = await createHwpxEditor(readFileSync("zig-out/bin/hwpjs.wasm"));
  try {
    for (const position of [0, 1, 2]) {
      editor.open(input);
      assert.equal(editor.anchorText(0, 1), "\ufffc\ufffc");
      assert.throws(() => editor.spliceAnchored(0, 1, 0, 1, ""), { message: "ProtectedInlineControl" });
      assert.deepEqual(Buffer.from(editor.save()), input);
      editor.spliceAnchored(0, 1, position, 0, "앞😀<&");
      const expected = "\ufffc".repeat(position) + "앞😀<&" + "\ufffc".repeat(2 - position);
      assert.equal(editor.anchorText(0, 1), expected);
      const output = editor.save();
      const oracle = `import io,json,sys,base64,zipfile,xml.etree.ElementTree as E
d=json.loads(sys.stdin.readline()); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory')
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
for name in a.namelist():
 if name!='Contents/section0.xml':
  if a.read(name)!=b.read(name): raise ValueError(name)
  continue
 x=E.fromstring(a.read(name)); y=E.fromstring(b.read(name)); owner=next(x.iter(p+'p'))
 objects=[(run,child) for run in owner.findall(p+'run') for child in run if child.tag==p+'line']
 if len(objects)!=2: raise ValueError('fixture structure')
 run,child=objects[min(d['position'],1)]; index=list(run).index(child)+(d['position']==2)
 if d['position']==2:
  t=run.find(p+'t')
  if t is None: raise ValueError('fixture trailing text site')
  t.text='앞😀<&'
 else:
  t=E.Element(p+'t'); t.text='앞😀<&'; run.insert(index,t)
 def signature(e): return (e.tag,sorted(e.attrib.items()),e.text,e.tail,[signature(c) for c in e])
 if signature(x)!=signature(y): raise ValueError('complete XML mismatch')`;
      for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(output).toString("base64"), position }) + "\n", timeout: 30000 });
      const corrupted = execFileSync("python3", ["-c", `import io,sys,base64,zipfile,xml.etree.ElementTree as E
source=zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.readline()))); target=io.BytesIO(); p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(target,'w') as out:
 out.comment=source.comment
 for item in source.infolist():
  data=source.read(item.filename)
  if item.filename=='Contents/section0.xml':
   root=E.fromstring(data); next(root.iter(p+'line')).set('id','corrupted-object'); data=E.tostring(root,encoding='utf-8')
  out.writestr(item,data)
sys.stdout.buffer.write(target.getvalue())`], { input: Buffer.from(output).toString("base64") + "\n", timeout: 30000 });
      for (const flags of [[], ["-O"]]) {
        const result = spawnSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: corrupted.toString("base64"), position }) + "\n", timeout: 30000 });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.match(result.stderr.toString(), /ValueError: complete XML mismatch/);
      }
      editor.spliceAnchored(0, 1, position, 5, "");
      assert.deepEqual(Buffer.from(editor.save()), input);
      editor.open(output);
      assert.equal(editor.anchorText(0, 1), expected);
      assert.deepEqual(editor.save(), output);
    }
  } finally { editor.close(); }
});
