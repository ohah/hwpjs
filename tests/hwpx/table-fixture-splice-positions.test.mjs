import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { createHash } from "node:crypto";

assert([undefined, "1"].includes(process.env.HWPJS_FULL_SPLICE_AUDIT), "InvalidFullSpliceAuditMode");
const full = process.env.HWPJS_FULL_SPLICE_AUDIT === "1";

const inventory = `import base64,io,json,sys,zipfile,xml.etree.ElementTree as E
n='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
d=json.load(sys.stdin)
with zipfile.ZipFile(io.BytesIO(base64.b64decode(d['bytes']))) as z:r=E.fromstring(z.read('Contents/section0.xml'))
parents={c:p for p in r.iter() for c in p};groups={}
for index,p in enumerate(r.iter(n+'p')):
 runs=p.findall(n+'run');leaves=[c for run in runs for c in run]
 if not leaves or any(c.tag!=n+'t' or len(c) for c in leaves) or any(c.tag not in (n+'run',n+'linesegarray') for c in p):continue
 text=''.join(c.text or '' for c in leaves)
 if not text:continue
 owner=parents.get(p);kind='body'
 while owner is not None:
  if owner.tag==n+'tbl':kind='cell';break
  if owner.tag==n+'rect':kind='drawing';break
  owner=parents.get(owner)
 groups.setdefault(kind,[]).append({'index':index,'text':text,'kind':kind})
selected=[]
for kind,rows in groups.items():
 for index in (range(len(rows)) if d['full'] else sorted(set([0,len(rows)//2,len(rows)-1]))):selected.append(rows[index])
print(json.dumps({'counts':{k:len(v) for k,v in groups.items()},'selected':selected},ensure_ascii=False))`;

for (const path of ["legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx", "reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx"]) {
  test(`${path}: source-selected beginning middle end replacement and deletion retain complete XML`, async t => {
    assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
    const input = readFileSync(path), wasm = readFileSync(process.env.HWPJS_TEST_WASM);
    const originalInput = Buffer.from(input);
    const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
    const source = JSON.parse(execFileSync("python3", ["-c", inventory], {
      input: JSON.stringify({ bytes: input.toString("base64"), full }), encoding: "utf8", timeout: 30000,
    }));
    if (full) assert.equal(source.selected.length, Object.values(source.counts).reduce((sum, value) => sum + value, 0));
    const scope = full ? "all nonempty source plain-leaf paragraphs; not protected/empty/control paragraphs or every character position" : "first middle last source plain paragraph per present body cell drawing";
    console.log(JSON.stringify({ kind: "splice-audit-start", path, scope, selected: source.selected.length, counts: source.counts,
      inputSha256: sha256(input), wasmSha256: sha256(wasm) }));
    assert(source.counts.cell > 0);
    if (path.endsWith("table-bug.hwpx")) assert(source.counts.body > 0 && source.counts.drawing > 0);
    else assert.equal(source.counts.body ?? 0, 0, "medical document's plain text is inside tables");
    const editor = await createHwpxEditor(wasm), reopened = await createHwpxEditor(wasm);
    let checks = 0, completed = 0;
    try {
      editor.open(input); editor.enableHistory();
      for (const sample of source.selected) {
        assert.equal(editor.canEdit(0, sample.index + 1), true);
        const boundaries = [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(sample.text)].map(part => part.index);
        boundaries.push(sample.text.length);
        const positions = [...new Set([0, boundaries[Math.floor((boundaries.length - 1) / 2)], sample.text.length])];
        const edits = positions.map(start => ({ start, end: start, text: "치환😀<&" }));
        for (const ordinal of new Set([0, Math.floor((boundaries.length - 2) / 2), boundaries.length - 2]))
          edits.push({ start: boundaries[ordinal], end: boundaries[ordinal + 1], text: "교체😀<&" });
        edits.push({ start: boundaries.at(-2), end: sample.text.length, text: "" });
        for (const edit of edits) {
          editor.splice(0, sample.index + 1, edit.start, edit.end - edit.start, edit.text);
          const saved = Buffer.from(editor.save());
          const request = { before: input.toString("base64"), after: saved.toString("base64"), part: "Contents/section0.xml", index: sample.index, ...edit };
          for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-plain-splice-oracle.py"], { input: JSON.stringify(request), timeout: 30000 });
          if (checks === 0) assert.throws(() => execFileSync("python3", ["tools/hwpx-plain-splice-oracle.py"], {
            input: JSON.stringify({ ...request, text: "wrong" }), timeout: 30000,
          }), error => error.status === 1 && /Whole XML mismatch/.test(String(error.stderr)));
          reopened.open(saved); assert.deepEqual(Buffer.from(reopened.save()), saved);
          assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
          assert.equal(editor.redo(), true); assert.deepEqual(Buffer.from(editor.save()), saved);
          assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), input);
          checks++;
        }
        completed++;
        assert.deepEqual(input, originalInput);
        if (full && (completed % 25 === 0 || completed === source.selected.length)) console.log(JSON.stringify({ kind: "splice-audit-progress", path, completed, selected: source.selected.length, edits: checks }));
      }
      assert.deepEqual(readFileSync(path), originalInput);
      assert.equal(sha256(readFileSync(process.env.HWPJS_TEST_WASM)), sha256(wasm));
      t.diagnostic(JSON.stringify({ scope, positions: "beginning middle end insertion and grapheme replacement, last-grapheme deletion", counts: source.counts, samples: source.selected.length, edits: checks, xmlOracleModes: 2 }));
    } finally { editor.close(); reopened.close(); }
  });
}
