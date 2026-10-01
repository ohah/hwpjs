import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";

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
