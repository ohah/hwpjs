import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHwpxEditor} from "../../js/hwpx-editor.mjs";
import {execFileSync} from "../../tools/oracle-process.mjs";

test("plain prefix oracle preserves earliest empty run affinity in normal and optimized Python",()=>{
 for(const flags of [[],["-O"]]){
  const output=execFileSync("python3",[...flags,"tools/plain-prefix-oracle-self-test.py"],{encoding:"utf8",timeout:30000});
  assert.match(output,/'positive': 6, 'negative': 15/);
 }
});

test("actual example prefix keeps empty style run distinct from existing text through history and reopen",async()=>{
 assert(process.env.HWPJS_TEST_WASM,"ExplicitPlainPrefixCandidateRequired");
 const input=readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/example.hwpx");
 const editor=await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
 try{
  editor.open(input);editor.enableHistory();assert.equal(editor.canEdit(0,1),true);
  const original=editor.paragraphTextSnapshot(0)[0].text,marker="빈런😀<&";
  editor.splice(0,1,0,0,marker);
  const saved=Buffer.from(editor.save());
  const request={before:input.toString("base64"),after:saved.toString("base64"),section:0,paragraph:1,mode:"plain_text",text:marker};
  for(const flags of [[],["-O"]]){
   execFileSync("python3",[...flags,"tools/hwpx-anchor-prefix-oracle.py"],{input:JSON.stringify(request),timeout:30000});
   assert.throws(()=>execFileSync("python3",[...flags,"tools/hwpx-anchor-prefix-oracle.py"],{input:JSON.stringify({...request,text:"wrong"}),timeout:30000}),e=>e.status===1&&/complete XML mismatch/.test(String(e.stderr)));
  }
  assert.equal(editor.undo(),true);assert.deepEqual(Buffer.from(editor.save()),input);
  assert.equal(editor.redo(),true);assert.deepEqual(Buffer.from(editor.save()),saved);
  editor.open(saved);assert.equal(editor.paragraphTextSnapshot(0)[0].text,marker+original);
  assert.deepEqual(Buffer.from(editor.save()),saved);
 }finally{editor.close();}
});
