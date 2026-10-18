import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

test("menu browser audit requires an explicit WASM before starting external processes",()=>{
  const result=spawnSync(process.execPath,["tools/document-menu-browser-audit.mjs"],{
    encoding:"utf8",timeout:10000,env:{...process.env,PATH:"/nonexistent-menu-audit-bin",HWPJS_TEST_WASM:""},
  });
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
  assert.equal(result.stdout,"");assert.match(result.stderr,/ExplicitBrowserCandidateRequired/);
});

test("menu browser audit rejects partial-scope arguments before reading a candidate",()=>{
  const result=spawnSync(process.execPath,["tools/document-menu-browser-audit.mjs","--skip-history"],{
    encoding:"utf8",timeout:10000,env:{...process.env,PATH:"/nonexistent-menu-audit-bin",HWPJS_TEST_WASM:"/nonexistent-menu-audit.wasm"},
  });
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
  assert.equal(result.stdout,"");assert.match(result.stderr,/UnexpectedBrowserAuditArguments/);assert.doesNotMatch(result.stderr,/ENOENT/);
});
