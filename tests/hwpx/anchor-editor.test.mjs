import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

test("public HWPX automatic table numbers protect anchors and preserve complete XML", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwpx");
  const editor = await createHwpxEditor(readFileSync("zig-out/bin/hwpjs.wasm"));
  const paragraphs = [2, 5, 8, 11, 14, 17, 20, 23];
  const originals = [];
  try {
    editor.open(input);
    for (const paragraph of paragraphs) {
      const original = editor.anchorText(0, paragraph);
      originals.push(original);
      assert.equal(original.indexOf("\ufffc"), 2);
      assert.throws(() => editor.spliceAnchored(0, paragraph, 2, 1, ""), { message: "ProtectedInlineControl" });
      editor.spliceAnchored(0, paragraph, original.length, 0, "뒤😀");
      editor.spliceAnchored(0, paragraph, 0, 0, "앞😀");
      assert.equal(editor.anchorText(0, paragraph), "앞😀" + original + "뒤😀");
    }
    const output = editor.save();
    const oracle = `import io,json,sys,base64,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory')
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
for name in a.namelist():
 if name!='Contents/section0.xml':
  if a.read(name)!=b.read(name): raise ValueError(name)
  continue
 x=E.fromstring(a.read(name)); y=E.fromstring(b.read(name)); changed=0
 for paragraph in x.iter(p+'p'):
  runs=paragraph.findall(p+'run')
  if not any(run.find(p+'ctrl/'+p+'autoNum') is not None for run in runs): continue
  texts=[t for run in runs for t in run.findall(p+'t')]
  texts[0].text='앞😀'+(texts[0].text or ''); texts[-1].text=(texts[-1].text or '')+'뒤😀'; changed+=1
 def signature(e): return (e.tag,sorted(e.attrib.items()),e.text,e.tail,[signature(c) for c in e])
 if changed!=8 or signature(x)!=signature(y): raise ValueError('complete XML mismatch')`;
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(output).toString("base64") }) });
    // Verify that the independent checker rejects number, text and other-part corruption.
    for (const mutation of ["number", "text", "part"]) {
      const corrupted = execFileSync("python3", ["-c", `import io,sys,zipfile,xml.etree.ElementTree as E
source=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); target=io.BytesIO(); p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(target,'w') as out:
 out.comment=source.comment
 for item in source.infolist():
  data=source.read(item.filename)
  if item.filename=='Contents/section0.xml' and sys.argv[1]!='part':
   root=E.fromstring(data)
   if sys.argv[1]=='number': next(root.iter(p+'autoNum')).set('num','999')
   else: next(root.iter(p+'t')).text='wrong'
   data=E.tostring(root,encoding='utf-8')
  elif item.filename=='mimetype' and sys.argv[1]=='part': data+=b'wrong'
  out.writestr(item,data)
sys.stdout.buffer.write(target.getvalue())`, mutation], { input: Buffer.from(output), timeout: 30000 });
      for (const flags of [[], ["-O"]]) {
        const result = spawnSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: corrupted.toString("base64") }), timeout: 30000 });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1, mutation);
        assert.match(result.stderr.toString(), /ValueError: (complete XML mismatch|mimetype)/);
      }
    }
    editor.open(output);
    assert.deepEqual(editor.save(), output);
    for (const [i, paragraph] of paragraphs.entries()) {
      assert.equal(editor.anchorText(0, paragraph), "앞😀" + originals[i] + "뒤😀");
      editor.spliceAnchored(0, paragraph, originals[i].length + 3, 3, "");
      editor.spliceAnchored(0, paragraph, 0, 3, "");
    }
    execFileSync("python3", ["-c", `import io,json,sys,base64,zipfile
d=json.loads(sys.stdin.readline()); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory')
for name in a.namelist():
 if a.read(name)!=b.read(name): raise ValueError('restored payload '+name)`], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(editor.save()).toString("base64") }) + "\n", timeout: 30000 });
    // Reopening establishes a new immutable baseline: XML equivalence rather than ZIP byte identity.
    editor.open(input);
    for (const paragraph of paragraphs) {
      editor.spliceAnchored(0, paragraph, 0, 0, "검증😀");
      editor.spliceAnchored(0, paragraph, 0, 4, "");
    }
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); }
});

test("public HWPX anchored note references edit both sides preserve all XML and reject deletion", async () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx");
  const editor = await createHwpxEditor(readFileSync("zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(input);
    for (const paragraph of [1, 4]) {
      const original = editor.anchorText(0, paragraph);
      assert.equal(original.length, 6);
      assert(original.endsWith("\ufffc\ufffc"));
      editor.spliceAnchored(0, paragraph, 6, 0, "뒤😀");
      editor.spliceAnchored(0, paragraph, 0, 0, "앞😀");
      assert.equal(editor.anchorText(0, paragraph), "앞😀" + original + "뒤😀");
      const saved = editor.save();
      assert.throws(() => editor.spliceAnchored(0, paragraph, 7, 1, ""), { message: "ProtectedInlineControl" });
      assert.deepEqual(editor.save(), saved);
    }
    const output = editor.save();
    const oracle = `import io,json,sys,base64,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin); a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before']))); b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory')
for name in a.namelist():
 if name!='Contents/section0.xml' and a.read(name)!=b.read(name): raise ValueError(name)
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; x=E.fromstring(a.read('Contents/section0.xml')); y=E.fromstring(b.read('Contents/section0.xml'))
for paragraph in x.findall(p+'p'):
 texts=[t for run in paragraph.findall(p+'run') for t in run.findall(p+'t')]
 texts[0].text='앞😀'+(texts[0].text or ''); texts[-1].text=(texts[-1].text or '')+'뒤😀'
def signature(e): return (e.tag,sorted(e.attrib.items()),e.text,e.tail,[signature(c) for c in e])
if signature(x)!=signature(y): raise ValueError('complete XML mismatch')`;
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(output).toString("base64") }) });
    for (const paragraph of [1, 4]) {
      editor.spliceAnchored(0, paragraph, 9, 3, "");
      editor.spliceAnchored(0, paragraph, 0, 3, "");
    }
    assert.deepEqual(Buffer.from(editor.save()), input);
    editor.open(output);
    assert.deepEqual(editor.save(), output);
    assert.equal(editor.anchorText(0, 1), "앞😀각주참조\ufffc\ufffc뒤😀");
    editor.spliceAnchored(0, 1, 0, 0, "\ufeff");
    assert(editor.anchorText(0, 1).startsWith("\ufeff앞😀"));
  } finally { editor.close(); }
});
