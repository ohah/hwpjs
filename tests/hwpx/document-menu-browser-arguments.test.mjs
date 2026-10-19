import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {documentMenuBrowserCases} from "../../tools/browser/document-menu-cases.mjs";
import {demoFixtures,fixtureUrl} from "../../web/preview/fixture-catalog.mjs";
import {parseBrowserAuditOrigin,verifyBrowserSourceResponses} from "../../tools/browser/audit-origin.mjs";
import {createHash} from "node:crypto";

test("external browser origins are explicit canonical HTTPS roots only",()=>{
  assert.equal(parseBrowserAuditOrigin(undefined),null);
  assert.equal(parseBrowserAuditOrigin("https://example.test:10001/"),"https://example.test:10001");
  for(const value of ["", " https://example.test", "http://example.test", "file:///tmp/a", "https://user:secret@example.test", "https://example.test/path", "https://example.test/?q=x", "https://example.test/#x", "https://example.test/../", "https://EXAMPLE.test"]){
    assert.throws(()=>parseBrowserAuditOrigin(value),/InvalidBrowserAuditOrigin/);
  }
  const result=spawnSync(process.execPath,["tools/numeric-input-browser-audit.mjs"],{encoding:"utf8",timeout:10000,env:{...process.env,PATH:"/nonexistent-menu-audit-bin",HWPJS_TEST_WASM:"/missing.wasm",HWPJS_BROWSER_ORIGIN:"http://example.test"}});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
  assert.equal(result.stdout,"");assert.match(result.stderr,/InvalidBrowserAuditOrigin/);assert.doesNotMatch(result.stderr,/ENOENT/);
});

test("remote browser source witnesses reject wrong bytes and HTTP status without fetching tool files",async()=>{
  const bytes=Buffer.from("source"),hash=createHash("sha256").update(bytes).digest("hex"),calls=[];
  const hashes={"web/preview/app.mjs":hash,"js/hwpx-editor.mjs":hash,"tools/browser/audit-origin.mjs":"not served"};
  await verifyBrowserSourceResponses("https://example.test",hashes,async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,"error");assert(options.signal instanceof AbortSignal);return new Response(bytes);
  });
  assert.deepEqual(calls,["https://example.test/web/preview/app.mjs","https://example.test/js/hwpx-editor.mjs"]);
  await assert.rejects(verifyBrowserSourceResponses("https://example.test",hashes,async()=>new Response("changed")),/BrowserRemoteSourceChanged/);
  await assert.rejects(verifyBrowserSourceResponses("https://example.test",hashes,async()=>new Response(null,{status:404})),/BrowserRemoteSourceUnavailable/);
});

for(const name of ["plain","numeric-input","manual-result","cascaded-sum-input","below-sum-input"])test(`${name} menu roundtrip exercises the real fixture picker with one exact public source`,()=>{
  const selected=documentMenuBrowserCases[name];
  assert.equal(selected.fixturePicker,true);
  const entries=demoFixtures.filter(item=>item.path===selected.fixturePath);
  assert.equal(entries.length,1);
  assert.match(fixtureUrl(entries[0].id),/^\/web\/preview\/demo-fixtures\/[^/]+$/);
  assert.equal(documentMenuBrowserCases["unknown-object"].fixturePicker,undefined);
});

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

for(const tool of ["unknown-object","manual-result","numeric-input","merged-sum-input","cascaded-sum-input","below-sum-input","field-interior"])for(const [args,env,pattern] of [
  [[],{HWPJS_TEST_WASM:""},/ExplicitBrowserCandidateRequired/],
  [["--skip-history"],{HWPJS_TEST_WASM:"/nonexistent-menu-audit.wasm"},/UnexpectedBrowserAuditArguments/],
])test(`${tool} browser refuses invalid inputs before starting external processes: ${pattern}`,()=>{
  const result=spawnSync(process.execPath,[`tools/${tool}-browser-audit.mjs`,...args],{
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

test("numeric SUM browser witnesses include shared independent oracle dependencies and a valid wrong target",()=>{
  for(const name of ["below-sum-input","cascaded-sum-input","merged-sum-input"]){
    const dependencies=documentMenuBrowserCases[name].oracleDependencies;
    assert.equal(new Set(dependencies).size,dependencies.length);
    assert(dependencies.includes("tools/hwpx_numeric_package.py"));
    assert(dependencies.includes("tools/hwpx_text_snapshot_order.py"));
    for(const path of dependencies)assert(readFileSync(path).length>0);
  }
  assert.equal(documentMenuBrowserCases["below-sum-input"].negativeParagraph,95);
  assert.deepEqual(documentMenuBrowserCases["below-sum-input"].expectedAffected,[0]);
});
