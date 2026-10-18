// Real Chromium menu input; native editing remains in the existing Worker.
import assert from "node:assert/strict";
import {spawn, execFileSync as cli} from "node:child_process";
import {mkdtempSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve, join} from "node:path";
import {once} from "node:events";
import {createHash} from "node:crypto";
import {createHwpxEditor} from "../js/hwpx-editor.mjs";
import {executeOracle} from "./oracle-process-async.mjs";
import {clickBrowserTarget} from "./browser/click-target.mjs";
import {moveBrowserInputToStart} from "./browser/input-origin.mjs";
import {closeOwnedBrowser} from "./browser/session-close.mjs";
import {writeAuditRow} from "./audit-jsonl-output.mjs";

assert(process.env.HWPJS_TEST_WASM, "ExplicitBrowserCandidateRequired");
if (process.argv.length !== 2) throw Error("UnexpectedBrowserAuditArguments");
const root = resolve("."), port = 58863;
const wasmPath = resolve(process.env.HWPJS_TEST_WASM), wasm = readFileSync(wasmPath);
const fixture = resolve("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx"), input = readFileSync(fixture);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = ["web/preview/index.html","web/preview/preview.css","web/preview/app.mjs","web/preview/document-menu-controls.mjs","web/preview/document-menu-mnemonic.mjs","tools/document-menu-browser-audit.mjs","tools/hwpx-anchor-prefix-oracle.py"];
const sourceHashes = () => Object.fromEntries(sourcePaths.map(path=>[path,hash(readFileSync(resolve(path)))]));
const sourceSha256 = sourceHashes();
const session = cli("agent-browser", ["session","id","--scope","worktree","--prefix","hwpjs-menu-mnemonic"], {cwd:root,encoding:"utf8",timeout:10000}).trim();
assert(/^[a-zA-Z0-9_-]+$/.test(session));
const output = mkdtempSync(join(tmpdir(),"hwpjs-menu-browser-")), marker = "메뉴검증😀<&";
const editor = await createHwpxEditor(wasm);
let original;
try { editor.open(input); original = editor.anchorText(0,1); assert.equal(original,"가"); }
finally { editor.close(); }
const command = (...args) => {
  const result = JSON.parse(cli("agent-browser", ["--json","--session",session,...args], {
    cwd:root, encoding:"utf8", timeout:60000, maxBuffer:8*1024*1024,
    env:{...process.env,AGENT_BROWSER_DEFAULT_TIMEOUT:"55000"},
  }));
  if (result.success !== true) throw Error(JSON.stringify(result.error ?? result));
  return result.data;
};
const evaluate = expression => {
  const value = command("eval",expression); assert(value && Object.hasOwn(value,"result")); return value.result;
};
const driver = {command,evaluate}, click = selector => clickBrowserTarget(driver,selector);
const wait = expression => command("wait","--fn",expression);
const popup = button => `.document-menu details:has(#${button})`;
const menuKey = (button,key) => {
  click(`${popup(button)} > summary`);
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(popup(button))}).open`),true);
  command("press",key);
};
const replies = kind => `window.__menuAudit.filter(r=>r.direction==='reply'&&r.kind===${JSON.stringify(kind)}&&!r.error)`;
let server, owned = false, closed = false, verified = false, phase = "preflight";
const progress = name => {phase=name;writeAuditRow({kind:"menu-browser-phase",phase,session,output});};
try {
  assert.equal(command("session","info").active,false,"RefuseActiveSession");
  server = spawn(process.execPath,[resolve("tools/serve-preview.mjs"),String(port),wasmPath],{cwd:root,stdio:["ignore","pipe","pipe"]});
  await new Promise((accept,reject) => {
    const timer=setTimeout(()=>reject(Error("ServerStartTimeout")),10000);
    server.once("error",error=>{clearTimeout(timer);reject(error);});
    server.once("exit",code=>{clearTimeout(timer);reject(Error(`ServerExited:${code}`));});
    server.stdout.once("data",bytes=>{clearTimeout(timer);String(bytes).includes(`127.0.0.1:${port}/web/preview/index.html`)?accept():reject(Error("UnexpectedServer"));});
  });
  const response=await fetch(`http://127.0.0.1:${port}/zig-out/bin/hwpjs.wasm`,{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(wasm));
  owned=true;command("open",`http://127.0.0.1:${port}/web/preview/index.html`);command("snapshot","-i");
  wait('!document.querySelector("#file").disabled');
  evaluate(`(() => {
    window.__menuAudit=[];window.__menuKeys=[];const watched=new WeakSet(),post=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...rest){
      if(!watched.has(this)){watched.add(this);this.addEventListener('message',event=>{
        const row=event.data;window.__menuAudit.push({direction:'reply',kind:row.kind,error:row.error,revision:row.historyRevision,changed:row.changed});
      });}
      window.__menuAudit.push({direction:'request',kind:message.kind});return post.call(this,message,...rest);
    };
    document.addEventListener('keydown',event=>window.__menuKeys.push({key:event.key,trusted:event.isTrusted,consumed:event.defaultPrevented}));
  })()`);
  menuKey("menu-properties","p");assert.equal(evaluate('document.querySelector("#inspector-toggle").getAttribute("aria-expanded")'),"true");
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(popup("menu-properties"))}).open`),false);
  command("press","p");assert.equal(evaluate('document.querySelector("#inspector-toggle").getAttribute("aria-expanded")'),"true","ClosedMenuMustNotDispatch");
  menuKey("menu-properties","p");assert.equal(evaluate('document.querySelector("#inspector-toggle").getAttribute("aria-expanded")'),"false");
  menuKey("menu-undo","u");assert.equal(evaluate('document.querySelector("#menu-undo").disabled'),true);
  assert.equal(evaluate('window.__menuAudit.length'),0);command("press","Escape");
  menuKey("menu-save","s");assert.equal(evaluate('document.querySelector("#menu-save").disabled'),true);
  assert.equal(evaluate('window.__menuAudit.length'),0);command("press","Escape");progress("view-and-disabled-commands");
  command("upload","#file",fixture);wait(`${replies("load")}.length===1`);
  click("#enable-edit");wait(`${replies("enable")}.some(r=>r.revision===0)`);
  click("#document-window-options > summary");command("fill","#document-window-start","1");command("fill","#document-window-count","1");click("#document-window-apply");
  wait(`${replies("set-edit-window")}.length===1`);
  click("details:has(#find-input) > summary");command("fill","#find-input",original);click('#find-form button[type="submit"]');
  wait('!document.querySelector("#canvas-input").disabled&&!document.querySelector("#canvas-input").readOnly');
  assert.equal(evaluate('document.querySelector("#canvas-input").value'),original);
  moveBrowserInputToStart(driver);command("keyboard","inserttext",marker);
  wait(`${replies("splice")}.some(r=>r.revision===1)`);progress("trusted-text-edit");
  menuKey("menu-undo","u");wait(`${replies("undo")}.some(r=>r.changed&&r.revision===0)`);
  assert.equal(evaluate('document.querySelector("#canvas-input").value'),original);
  menuKey("menu-redo","r");wait(`${replies("redo")}.some(r=>r.changed&&r.revision===1)`);
  assert.equal(evaluate('document.querySelector("#canvas-input").value'),marker+original);progress("mnemonic-history");
  command("check","#allow-stale-layout");menuKey("menu-save","s");wait(`${replies("save")}.length===1`);
  assert.equal(evaluate(`document.querySelector(${JSON.stringify(popup("menu-save"))}).open`),false);
  for(const kind of ["splice","undo","redo","save"])assert.equal(evaluate(`window.__menuAudit.filter(r=>r.direction==='request'&&r.kind===${JSON.stringify(kind)}).length`),1);
  const downloaded=join(output,"edited.hwpx");click(`${popup("menu-save")} > summary`);
  command("download","#menu-save",downloaded);const saved=readFileSync(downloaded);
  const request={mode:"plain_text",before:input.toString("base64"),after:saved.toString("base64"),section:0,paragraph:1,text:marker};
  for(const flags of [[],["-O"]]){
    await executeOracle("python3",[...flags,"tools/hwpx-anchor-prefix-oracle.py"],{input:JSON.stringify(request),timeout:30000});
    await assert.rejects(executeOracle("python3",[...flags,"tools/hwpx-anchor-prefix-oracle.py"],{input:JSON.stringify({...request,text:"wrong"}),timeout:30000}),error=>error.status===1&&error.signal===null&&/complete XML mismatch/.test(String(error.stderr)));
  }
  evaluate("window.__menuAudit=[]");command("upload","#file",downloaded);wait(`${replies("load")}.length===1`);
  click("#enable-edit");wait(`${replies("enable")}.some(r=>r.revision===0)`);
  command("fill","#find-input",marker);click('#find-form button[type="submit"]');
  wait('document.querySelector("#canvas-input").value==='+JSON.stringify(marker+original));
  const keys=evaluate("window.__menuKeys");
  for(const key of ["p","u","r","s"])assert(keys.some(row=>row.key===key&&row.trusted&&row.consumed),`MissingTrustedMnemonic:${key}`);
  command("scrollintoview","#canvas-input");command("screenshot",join(output,"reopened.png"));
  assert.deepEqual(readFileSync(fixture),input);assert.deepEqual(readFileSync(wasmPath),wasm);assert.deepEqual(sourceHashes(),sourceSha256);verified=true;
  writeAuditRow({kind:"menu-browser-result",verified,session,output,sourceSha256,wasmSha256:hash(wasm),inputSha256:hash(input),savedSha256:hash(saved),scope:"View P; disabled U/S; one real text edit with U/R/S and menu download, independent XML/ZIP, reupload; not all menus or layout equivalence"});
}catch(error){
  writeAuditRow({kind:"menu-browser-failure",phase,error:error.message});throw error;
}finally{
  try{if(owned){await closeOwnedBrowser(command);closed=true;}}
  finally{
    if(server?.pid&&server.exitCode===null&&server.signalCode===null){const ended=once(server,"exit"),timer=setTimeout(()=>server.kill("SIGKILL"),3000);server.kill("SIGTERM");try{await ended;}finally{clearTimeout(timer);}}
    const serverExited=!server?.pid||server.exitCode!==null||server.signalCode!==null;
    writeAuditRow({kind:"menu-browser-cleanup",session,browserClosed:closed,serverExited,success:verified&&closed&&serverExited});
  }
}
