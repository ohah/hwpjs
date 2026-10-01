import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";

test("public HWPX formula numeric edit saves synchronized result and rejects invalid input atomically", async () => {
  const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  try {
    editor.open(input);
    assert.deepEqual(Buffer.from(editor.save()), input);
    const numeric = reader.readTextEvents(input).events.find(e => e.kind === "content" && e.value === "11.2");
    assert(numeric);
    editor.splice(numeric.section, numeric.paragraph, 0, 4, "100");
    const saved = editor.save();
    assert(reader.readTextEvents(saved).events.some(e => e.kind === "content" && e.value === "156.3"));
    assert.throws(() => editor.splice(numeric.section, numeric.paragraph, 0, 3, "bad"), { message: "InvalidFormulaNumber" });
    assert.deepEqual(editor.save(), saved);
    const oracle = `import io,json,sys,base64,zipfile,xml.etree.ElementTree as E
d=json.load(sys.stdin)
a=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['before'])))
b=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['after'])))
if a.namelist()!=b.namelist() or a.comment!=b.comment: raise ValueError('ZIP inventory')
for name in a.namelist():
 if name!='Contents/section0.xml' and a.read(name)!=b.read(name): raise ValueError(name)
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
r=E.fromstring(b.read('Contents/section0.xml'))
fields=[f for f in r.iter(p+'fieldBegin') if f.get('type')=='FORMULA']
if len(fields)!=13: raise ValueError('field count')
f=fields[0]
values={v.get('name'):v.text for v in f.find(p+'parameters')}
if values['LastResult']!='156.3' or not values['Command'].endswith(',;;156.3') or f.get('dirty')!='1': raise ValueError('stored result')
parents={child:parent for parent in r.iter() for child in parent}
owner=f
while owner.tag!=p+'p': owner=parents[owner]
if ''.join(t.text or '' for t in owner.iter(p+'t'))!='156.3': raise ValueError('display result')
print('synchronized result and unchanged ZIP payloads')`;
    const output = execFileSync("python3", ["-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64") }) }).toString();
    assert.match(output, /synchronized result/);
    const mutations = `import io,json,sys,base64,zipfile,copy,xml.etree.ElementTree as E
data=sys.stdin.buffer.read(); z=zipfile.ZipFile(io.BytesIO(data)); p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
variants=[]
for kind in ('result','dirty','label','payload'):
 root=E.fromstring(z.read('Contents/section0.xml')); f=next(f for f in root.iter(p+'fieldBegin') if f.get('type')=='FORMULA')
 if kind=='result': next(v for v in f.find(p+'parameters') if v.get('name')=='LastResult').text='0'
 if kind=='dirty': f.set('dirty','0')
 if kind=='label':
  parents={child:parent for parent in root.iter() for child in parent}; owner=f
  while owner.tag!=p+'p': owner=parents[owner]
  next(owner.iter(p+'t')).text='0'
 stream=io.BytesIO()
 with zipfile.ZipFile(stream,'w') as out:
  out.comment=z.comment
  for info in z.infolist():
   payload=E.tostring(root) if info.filename=='Contents/section0.xml' else z.read(info)
   if kind=='payload' and info.filename=='mimetype': payload+=b'corrupted'
   out.writestr(copy.copy(info),payload)
 variants.append(base64.b64encode(stream.getvalue()).decode())
print(json.dumps(variants))`;
    const variants = JSON.parse(execFileSync("python3", ["-c", mutations], { input: saved }).toString());
    for (const after of variants) {
      for (const flags of [[], ["-O"]]) {
        assert.throws(() => execFileSync("python3", [...flags, "-c", oracle], { input: JSON.stringify({ before: input.toString("base64"), after }), stdio: ["pipe", "pipe", "pipe"] }));
      }
    }
    editor.open(saved);
    assert.deepEqual(editor.save(), saved);
  } finally { editor.close(); reader.close(); }
});

test("all forty-eight actual formula input paragraphs support numeric edit with independent recalculation", async () => {
  const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx");
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  // Import the hyphenated standalone oracle explicitly; its XML/Decimal
  // evaluation does not consume LastResult or native reader output.
  const comparison = `import io,sys,zipfile,decimal,xml.etree.ElementTree as E,importlib.util
spec=importlib.util.spec_from_file_location('independent','tools/hwpx-formula-cell-oracle.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
data=sys.stdin.buffer.read()
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
root=E.fromstring(zipfile.ZipFile(io.BytesIO(data)).read('Contents/section0.xml'))
fields={f.get('id'):f for f in root.iter(p+'fieldBegin') if f.get('type')=='FORMULA'}
parents={child:parent for parent in root.iter() for child in parent}
count=0
for identifier,formula,value,cells in module.results(io.BytesIO(data)):
 f=fields[identifier]; values={v.get('name'):v.text for v in f.find(p+'parameters')}
 expected=value.quantize(decimal.Decimal('0.01')) if values['ResultFormat'].startswith('%.2f') else value
 if decimal.Decimal(values['LastResult'].replace(',',''))!=expected: raise ValueError(identifier+' result')
 if not values['Command'].endswith(',;;'+values['LastResult']): raise ValueError(identifier+' command')
 owner=f
 while owner.tag!=p+'p': owner=parents[owner]
 if ''.join(t.text or '' for t in owner.iter(p+'t'))!=values['LastResult']: raise ValueError(identifier+' label')
 count+=1
if count!=13: raise ValueError('count')
print(count)`;
  let numericInputs = 0;
  try {
    const paragraphs = reader.readTextEvents(input).events.filter(e => e.kind === "paragraph_start");
    for (const paragraph of paragraphs) {
      editor.open(input);
      if (!editor.canEdit(paragraph.section, paragraph.paragraph)) continue;
      let numeric = false;
      try { editor.splice(paragraph.section, paragraph.paragraph, 0, 0, "X"); }
      catch (error) { assert.equal(error.message, "InvalidFormulaNumber"); numeric = true; }
      if (!numeric) continue;
      assert.deepEqual(Buffer.from(editor.save()), input);
      const original = reader.readTextEvents(input).events.filter(e => e.kind === "content" && e.section === paragraph.section && e.paragraph === paragraph.paragraph).map(e => e.value).join("");
      editor.splice(paragraph.section, paragraph.paragraph, 0, original.length, "100");
      const saved = editor.save();
      const updatedText = reader.readTextEvents(saved).events.filter(e => e.kind === "content" && e.section === paragraph.section && e.paragraph === paragraph.paragraph).map(e => e.value).join("");
      assert.equal(updatedText, "100");
      assert.equal(execFileSync("python3", ["-c", comparison], { input: saved }).toString().trim(), "13");
      editor.open(saved);
      assert.deepEqual(editor.save(), saved);
      numericInputs++;
    }
    assert.equal(numericInputs, 48);
  } finally { editor.close(); reader.close(); }
});
