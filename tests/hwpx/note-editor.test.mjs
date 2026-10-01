import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";

test("public HWPX four note bodies edit with independent complete XML and ZIP comparison", async () => {
  const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx");
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  const inserted = "검증😀<&";
  const oracle = `import io,json,sys,base64,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin)
a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before'])))
b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory')
for name in a.namelist():
 if name!='Contents/section0.xml' and a.read(name)!=b.read(name): raise ValueError(name)
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
x=E.fromstring(a.read('Contents/section0.xml')); y=E.fromstring(b.read('Contents/section0.xml'))
changed=0
for note in x.iter():
 if note.tag not in (p+'footNote',p+'endNote'): continue
 for paragraph in note.find(p+'subList').findall(p+'p'):
  text=next(paragraph.iter(p+'t')); text.text=d['inserted']+(text.text or ''); changed+=1
def signature(e): return (e.tag,sorted(e.attrib.items()),e.text,e.tail,[signature(c) for c in e])
if changed!=4 or signature(x)!=signature(y): raise ValueError('complete XML mismatch')
print('four bodies and all remaining XML unchanged')`;
  try {
    editor.open(input);
    const paragraphs = [2, 3, 5, 6];
    for (const paragraph of paragraphs) {
      assert(editor.canEdit(0, paragraph));
      editor.splice(0, paragraph, 0, 0, inserted);
    }
    const saved = editor.save();
    for (const flags of [[], ["-O"]]) {
      assert.match(execFileSync("python3", [...flags, "-c", oracle], {
        input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), inserted }),
      }).toString(), /four bodies/);
    }
    const mutations = `import io,json,sys,base64,zipfile,copy,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'; variants=[]
for kind in ('number','body','payload'):
 root=E.fromstring(z.read('Contents/section0.xml'))
 if kind=='number': next(root.iter(p+'autoNum')).set('num','99')
 if kind=='body': next(next(root.iter(p+'footNote')).iter(p+'t')).text='wrong'
 stream=io.BytesIO()
 with zipfile.ZipFile(stream,'w') as out:
  out.comment=z.comment
  for info in z.infolist():
   payload=E.tostring(root) if info.filename=='Contents/section0.xml' else z.read(info)
   if kind=='payload' and info.filename=='mimetype': payload+=b'changed'
   out.writestr(copy.copy(info),payload)
 variants.append(base64.b64encode(stream.getvalue()).decode())
print(json.dumps(variants))`;
    const variants = JSON.parse(execFileSync("python3", ["-c", mutations], { input: saved }).toString());
    for (const after of variants) for (const flags of [[], ["-O"]]) {
      assert.throws(() => execFileSync("python3", [...flags, "-c", oracle], {
        input: JSON.stringify({ before: input.toString("base64"), after, inserted }), stdio: ["pipe", "pipe", "pipe"],
      }));
    }
    for (const paragraph of paragraphs) {
      const text = reader.readTextEvents(saved).events.filter(e => e.kind === "content" && e.paragraph === paragraph).map(e => e.value).join("");
      assert(text.startsWith(inserted));
    }
    assert(!editor.canEdit(0, 1));
    assert.throws(() => editor.splice(0, 1, 0, 0, "x"), { message: "UnsupportedParagraphControl" });
    assert.throws(() => editor.splice(0, 2, 3, 0, "x"), { message: "SplitSurrogatePair" });
    assert.deepEqual(editor.save(), saved);
    for (const paragraph of paragraphs) editor.splice(0, paragraph, 0, inserted.length, "");
    assert.deepEqual(Buffer.from(editor.save()), input);
    editor.open(saved);
    assert.deepEqual(editor.save(), saved);
  } finally { editor.close(); reader.close(); }
});

test("public HWPX note body delete all reopen and reinput keeps numbering", async () => {
  const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx");
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  try {
    for (const paragraph of [2, 3, 5, 6]) {
      editor.open(input);
      const contents = bytes => reader.readTextEvents(bytes).events.filter(e => e.kind === "content" && e.paragraph === paragraph).map(e => e.value).join("");
      const original = contents(input);
      editor.splice(0, paragraph, 0, original.length, "");
      const empty = editor.save();
      assert.equal(contents(empty), "");
      editor.open(empty);
      assert(editor.canEdit(0, paragraph));
      editor.splice(0, paragraph, 0, 0, "재입력😀");
      const saved = editor.save();
      assert.equal(contents(saved), "재입력😀");
      const oracle = `import io,json,sys,base64,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin); p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def numbers(key):
 root=E.fromstring(zipfile.ZipFile(io.BytesIO(base64.b64decode(d[key]))).read('Contents/section0.xml'))
 return [E.tostring(e) for e in root.iter(p+'autoNum')]
if numbers('before')!=numbers('after'): raise ValueError('number changed')`;
      execFileSync("python3", ["-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64") }) });
    }
  } finally { editor.close(); reader.close(); }
});
