import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";

for (const [script, message] of [
  ["recheck-reference-refusals.mjs", "ExplicitRecheckInputsRequired"],
  ["edit-refused-formula-results.mjs", "ExplicitFormulaCorpusInputsRequired"],
]) {
  for (const extra of [false, true]) test(`${script} rejects ${extra ? "extra arguments" : "missing explicit WASM"} before input loading`, () => {
    const env = {...process.env};
    delete env.HWPJS_TEST_WASM;
    if (extra) env.HWPJS_TEST_WASM = "/unavailable.wasm";
    const args = extra ? ["/unavailable.jsonl", "unexpected"] : ["/unavailable.jsonl"];
    const result = spawnSync(process.execPath, [`tools/${script}`, ...args], {env, encoding:"utf8", timeout:10000});
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(message));
    assert.doesNotMatch(result.stderr, /ENOENT/);
    assert.equal(result.stdout, "");
  });
}

test("manual result audit rejects duplicate coordinates before WASM compilation", () => {
  const directory=mkdtempSync(join(tmpdir(),"hwpjs-formula-audit-duplicate-"));
  try {
    const wasm=Buffer.from("not a WASM module"),path=join(directory,"invalid.wasm"),input=join(directory,"duplicate.jsonl");
    writeFileSync(path,wasm);
    const wasmHash=createHash("sha256").update(wasm).digest("hex");
    const row={kind:"coordinate",status:"formulaResult",path:"unavailable.hwpx",section:0,paragraph:1};
    writeFileSync(input,[...Array.from({length:35},()=>row),{kind:"recheck-summary",wasmHash}].map(JSON.stringify).join("\n"));
    const result=spawnSync(process.execPath,["tools/edit-refused-formula-results.mjs",input],{
      env:{...process.env,HWPJS_TEST_WASM:path},encoding:"utf8",timeout:10000,
    });
    assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
    assert.match(result.stderr,/DuplicateFormulaCoordinate/);
    assert.doesNotMatch(result.stderr,/CompileError|ENOENT/);assert.equal(result.stdout,"");
  }finally{rmSync(directory,{recursive:true,force:true});}
});
