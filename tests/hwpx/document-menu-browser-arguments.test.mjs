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

for(const [args,env,pattern] of [
  [[],{HWPJS_TEST_WASM:""},/ExplicitBrowserCandidateRequired/],
  [["--skip-history"],{HWPJS_TEST_WASM:"/nonexistent-menu-audit.wasm"},/UnexpectedBrowserAuditArguments/],
])test(`unknown object browser refuses invalid inputs before starting external processes: ${pattern}`,()=>{
  const result=spawnSync(process.execPath,["tools/unknown-object-browser-audit.mjs",...args],{
    encoding:"utf8",timeout:10000,env:{...process.env,PATH:"/nonexistent-menu-audit-bin",...env},
  });
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
  assert.equal(result.stdout,"");assert.match(result.stderr,pattern);assert.doesNotMatch(result.stderr,/ENOENT/);
});

test("shared browser flow refuses unknown and prototype case names before any artifact or CLI",()=>{
  for(const name of ["missing","__proto__","toString"]){
    const source=`import {runDocumentMenuBrowserAudit} from './tools/browser/document-menu-roundtrip.mjs'; await runDocumentMenuBrowserAudit(${JSON.stringify(name)});`;
    const result=spawnSync(process.execPath,["--input-type=module","-e",source],{
      encoding:"utf8",timeout:10000,env:{...process.env,PATH:"/nonexistent-menu-audit-bin",HWPJS_TEST_WASM:""},
    });
    assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
    assert.equal(result.stdout,"");assert.match(result.stderr,/UnknownDocumentMenuBrowserCase/);
  }
});
