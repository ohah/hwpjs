import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {createHwpxEditor} from "../js/hwpx-editor.mjs";
import {execFileSync} from "./oracle-process.mjs";
import {writeAuditRow} from "./audit-jsonl-output.mjs";
assert(process.env.HWPJS_TEST_WASM && process.argv.length===3,"ExplicitFormulaCorpusInputsRequired");
const hash=b=>createHash("sha256").update(b).digest("hex");
const wasm=readFileSync(process.env.HWPJS_TEST_WASM),wasmHash=hash(wasm);
const rows=readFileSync(process.argv[2],"utf8").trim().split("\n").map(JSON.parse);
assert.equal(rows.at(-1).kind,"recheck-summary");assert.equal(rows.at(-1).wasmHash,wasmHash);
const targets=rows.filter(r=>r.kind==="coordinate"&&r.status==="formulaResult");
assert.equal(targets.length,35,"ObservedFormulaCoordinatesRequired");
assert.equal(new Set(targets.map(row=>JSON.stringify([row.path,row.section,row.paragraph]))).size,targets.length,"DuplicateFormulaCoordinate");
const module=await WebAssembly.compile(wasm),editor=await createHwpxEditor(module);
writeAuditRow({kind:"formula-edit-start",wasmHash,coordinates:targets.length});
let edited=0;
try {
 for(const row of targets){
  const input=readFileSync(row.path),inputHash=hash(input);
  assert.equal(inputHash,row.inputSha256,"RecheckedFormulaInputChanged");
  assert.equal(row.targets.length,1,"OneObservedFormulaResultRequired");
  editor.open(input);editor.enableHistory();
  const sources=editor.formulaSources(row.section);
  const ordinal=sources.findIndex(f=>f.begin_element===row.targets[0].beginElement);
  assert(ordinal>=0,"ObservedSourceFormulaRequired");
  const display="참조결과😀<&";
  editor.setManualFormulaResult(row.section,sources[ordinal].begin_element,display);
  const saved=Buffer.from(editor.save());
  const request={before:input.toString("base64"),after:saved.toString("base64"),section:row.section,ordinal,display,selfTest:true};
  for(const flags of [[],["-O"]]) {
   execFileSync("python3",[...flags,"tools/hwpx-manual-result-save-oracle.py"],{input:JSON.stringify(request),timeout:30000,maxBuffer:32*1024*1024});
   assert.throws(()=>execFileSync("python3",[...flags,"tools/hwpx-manual-result-save-oracle.py"],{input:JSON.stringify({...request,display:"wrong"}),timeout:30000,maxBuffer:32*1024*1024}),e=>e.status===1&&/XML|mismatch/.test(String(e.stderr)));
  }
  assert.equal(editor.undo(),true);assert.deepEqual(Buffer.from(editor.save()),input);
  assert.throws(()=>editor.setManualFormulaResult(row.section,sources[ordinal].begin_element,"\u0000"),/InvalidXmlCharacter/);
  assert.deepEqual(Buffer.from(editor.save()),input);
  assert.equal(editor.redo(),true);assert.deepEqual(Buffer.from(editor.save()),saved);
  editor.open(saved);
  assert.equal(editor.formulaCurrent(row.section)[ordinal].values.last_result,display);
  assert.deepEqual(Buffer.from(editor.save()),saved);
  assert.equal(hash(readFileSync(row.path)),inputHash);
  edited++;
  writeAuditRow({kind:"formula-edited",path:row.path,section:row.section,paragraph:row.paragraph,ordinal,inputHash,savedHash:hash(saved)});
 }
 assert.equal(hash(readFileSync(process.env.HWPJS_TEST_WASM)),wasmHash);
 writeAuditRow({kind:"formula-edit-summary",wasmHash,edited,expected:targets.length});
}finally{editor.close();}
