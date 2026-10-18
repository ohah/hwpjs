// Real Chromium menu input; native editing remains in the existing Worker.
import assert from "node:assert/strict";
import {spawn, execFileSync as cli} from "node:child_process";
import {mkdtempSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve, join} from "node:path";
import {once} from "node:events";
import {createHash} from "node:crypto";
import {createHwpxEditor} from "../../js/hwpx-editor.mjs";
import {executeOracle} from "../oracle-process-async.mjs";
import {clickBrowserTarget} from "./click-target.mjs";
import {moveBrowserInputToStart} from "./input-origin.mjs";
import {closeOwnedBrowser} from "./session-close.mjs";
import {writeAuditRow} from "../audit-jsonl-output.mjs";
import {documentMenuBrowserCases} from "./document-menu-cases.mjs";
import {openBrowserRibbonPage,exerciseBrowserRibbonPages} from "./ribbon-page.mjs";
import {demoFixtures,fixtureUrl} from "../../web/preview/fixture-catalog.mjs";
import {parseBrowserAuditOrigin,verifyBrowserSourceResponses} from "./audit-origin.mjs";

export async function runDocumentMenuBrowserAudit(caseName) {
  assert(Object.hasOwn(documentMenuBrowserCases,caseName),"UnknownDocumentMenuBrowserCase");
  const config=documentMenuBrowserCases[caseName];
  assert(process.env.HWPJS_TEST_WASM, "ExplicitBrowserCandidateRequired");
  if (process.argv.length !== 2) throw Error("UnexpectedBrowserAuditArguments");
  const externalOrigin=parseBrowserAuditOrigin(process.env.HWPJS_BROWSER_ORIGIN);
  const root = resolve("."), {port,paragraph,marker,oraclePath,oracleMode,protectedAnchors}=config;
  const origin=externalOrigin??`http://127.0.0.1:${port}`;
  const editedText=config.replaceWhole?marker:marker+config.original;
  const wasmPath = resolve(process.env.HWPJS_TEST_WASM), wasm = readFileSync(wasmPath);
  const fixture = resolve(config.fixturePath), input = readFileSync(fixture);
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const sourcePaths = ["web/preview/index.html","web/preview/preview.css","web/preview/app.mjs","web/preview/document-menu-controls.mjs","web/preview/document-menu-mnemonic.mjs","web/preview/document-ribbon-controls.mjs","web/preview/document-ribbon-pages.mjs","web/preview/fixture-controls.mjs","web/preview/fixture-catalog.mjs","web/preview/fixture-inventory.mjs","tools/browser/ribbon-page.mjs","tools/document-menu-browser-audit.mjs","tools/unknown-object-browser-audit.mjs","tools/browser/document-menu-roundtrip.mjs","tools/browser/document-menu-cases.mjs","tools/hwpx-anchor-prefix-oracle.py",...(oraclePath==="tools/hwpx-anchor-prefix-oracle.py"?[]:[oraclePath])];
  if(config.entryPath)sourcePaths.push(config.entryPath);
  sourcePaths.push("web/preview/document-menu-keyboard.mjs");
  sourcePaths.push("tools/browser/audit-origin.mjs");
  const sourceHashes = () => Object.fromEntries(sourcePaths.map(path=>[path,hash(readFileSync(resolve(path)))]));
  const sourceSha256 = sourceHashes();
  const session = cli("agent-browser", ["session","id","--scope","worktree","--prefix",config.sessionPrefix], {cwd:root,encoding:"utf8",timeout:10000}).trim();
  assert(/^[a-zA-Z0-9_-]+$/.test(session));
  const output = mkdtempSync(join(tmpdir(),config.outputPrefix));
  const editor = await createHwpxEditor(wasm);
  let original;
  try { editor.open(input); original = oracleMode==="manual-result"?editor.manualFormulaResultDisplayText(0,paragraph):editor.anchorText(0,paragraph); assert.equal(original,config.original); }
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
  const progress = name => {phase=name;writeAuditRow({kind:"menu-browser-phase",caseName,phase,session,output});};
  try {
    assert.equal(command("session","info").active,false,"RefuseActiveSession");
    if(externalOrigin===null){
    server = spawn(process.execPath,[resolve("tools/serve-preview.mjs"),String(port),wasmPath],{cwd:root,stdio:["ignore","pipe","pipe"]});
    await new Promise((accept,reject) => {
      const timer=setTimeout(()=>reject(Error("ServerStartTimeout")),10000);
      server.once("error",error=>{clearTimeout(timer);reject(error);});
      server.once("exit",code=>{clearTimeout(timer);reject(Error(`ServerExited:${code}`));});
      server.stdout.once("data",bytes=>{clearTimeout(timer);String(bytes).includes(`127.0.0.1:${port}/web/preview/index.html`)?accept():reject(Error("UnexpectedServer"));});
    });
    }else await verifyBrowserSourceResponses(origin,sourceSha256);
    const response=await fetch(`${origin}/zig-out/bin/hwpjs.wasm`,{signal:AbortSignal.timeout(10000),redirect:"error"});
    assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(wasm));
    owned=true;command("open",`${origin}/web/preview/index.html`);command("snapshot","-i");
    wait('!document.querySelector("#file").disabled');
    evaluate(`(() => {
      window.__menuAudit=[];window.__menuKeys=[];window.__menuInput=[];const watched=new WeakSet(),post=Worker.prototype.postMessage;
      Worker.prototype.postMessage=function(message,...rest){
        if(!watched.has(this)){watched.add(this);this.addEventListener('message',event=>{
          const row=event.data;window.__menuAudit.push({direction:'reply',kind:row.kind,error:row.error,revision:row.historyRevision,changed:row.changed});
        });}
        window.__menuAudit.push({direction:'request',kind:message.kind,section:message.section,paragraph:message.paragraph,startUnit:message.startUnit,endUnit:message.endUnit});return post.call(this,message,...rest);
      };
      document.addEventListener('keydown',event=>window.__menuKeys.push({key:event.key,trusted:event.isTrusted,consumed:event.defaultPrevented}));
      for(const type of ['beforeinput','input'])document.querySelector('#canvas-input').addEventListener(type,event=>window.__menuInput.push({type,trusted:event.isTrusted,inputType:event.inputType}));
    })()`);
    if(exerciseBrowserRibbonPages(driver))progress("ribbon-keyboard-and-permissions");
    menuKey("menu-properties","p");assert.equal(evaluate('document.querySelector("#inspector-toggle").getAttribute("aria-expanded")'),"true");
    assert.equal(evaluate(`document.querySelector(${JSON.stringify(popup("menu-properties"))}).open`),false);
    command("press","p");assert.equal(evaluate('document.querySelector("#inspector-toggle").getAttribute("aria-expanded")'),"true","ClosedMenuMustNotDispatch");
    menuKey("menu-properties","p");assert.equal(evaluate('document.querySelector("#inspector-toggle").getAttribute("aria-expanded")'),"false");
    click(`${popup("menu-properties")} > summary`);
    const barOrigin=evaluate(`Array.from(document.querySelectorAll('.document-menu details')).indexOf(document.querySelector(${JSON.stringify(popup("menu-properties"))}))`);
    for(const [key,delta] of [["ArrowRight",1],["ArrowLeft",0]]){
      command("press",key);
      const state=evaluate("Array.from(document.querySelectorAll('.document-menu details')).map(p=>({open:p.open,focused:p.querySelector('summary')===document.activeElement}))");
      const expected=(barOrigin+delta)%state.length;
      assert.deepEqual(state.map(row=>row.open),state.map((_,index)=>index===expected));
      assert.deepEqual(state.map(row=>row.focused),state.map((_,index)=>index===expected));
    }
    command("press","Escape");assert.equal(evaluate(`document.querySelector(${JSON.stringify(popup("menu-properties"))}).open`),false);
    menuKey("menu-undo","u");assert.equal(evaluate('document.querySelector("#menu-undo").disabled'),true);
    assert.equal(evaluate('window.__menuAudit.length'),0);command("press","Escape");
    menuKey("menu-save","s");assert.equal(evaluate('document.querySelector("#menu-save").disabled'),true);
    assert.equal(evaluate('window.__menuAudit.length'),0);command("press","Escape");progress("view-and-disabled-commands");
    if(config.fixturePicker){
      const matches=demoFixtures.filter(item=>item.path===config.fixturePath);
      assert.equal(matches.length,1,"BrowserFixtureMustHaveUniqueCatalogEntry");
      const selected=matches[0];
      const fixtureResponse=await fetch(`${origin}${fixtureUrl(selected.id)}`,{signal:AbortSignal.timeout(10000),redirect:"error"});
      assert.equal(fixtureResponse.status,200);
      assert.equal(hash(Buffer.from(await fixtureResponse.arrayBuffer())),hash(input),"BrowserFixtureResponseMustMatchOracleInput");
      // Stall one response body at the browser boundary, then use the real file input.
      // This proves cancellation wiring, not physical network throughput.
      evaluate(`(() => {
        const originalBody=Response.prototype.arrayBuffer,originalAbort=AbortController.prototype.abort;
        const state=window.__fixtureFetchAudit={started:false,aborted:false,resumed:false};
        AbortController.prototype.abort=function(...args){
          const result=originalAbort.apply(this,args);
          state.aborted=this.signal.aborted;
          AbortController.prototype.abort=originalAbort;
          return result;
        };
        Response.prototype.arrayBuffer=function(...args){
          if(new URL(this.url,location.href).pathname!==${JSON.stringify(fixtureUrl(selected.id))})return originalBody.apply(this,args);
          Response.prototype.arrayBuffer=originalBody;
          state.started=true;
          return new Promise(resolve=>{state.release=resolve;}).then(value=>{state.resumed=true;return value;});
        };
      })()`);
      command("select","#demo-fixture",selected.id);
      click("#demo-fixture-open");
      wait("window.__fixtureFetchAudit.started");
      command("upload","#file",fixture);
      wait(`${replies("load")}.length===1`);
      assert.equal(evaluate("window.__fixtureFetchAudit.aborted"),true);
      evaluate("window.__fixtureFetchAudit.release(new Uint8Array([0]).buffer)");
      wait("window.__fixtureFetchAudit.resumed");
      assert.equal(evaluate(`${replies("load")}.length`),1,"CanceledFixtureMustNotStartAWorker");
      assert.equal(evaluate('document.querySelector("#status").textContent.includes("오류:")'),false);
      progress("fixture-fetch-canceled-by-upload");
      evaluate("window.__menuAudit=[]");
      command("select","#demo-fixture",selected.id);
      assert.equal(evaluate('document.querySelector("#demo-fixture").value'),selected.id);
      assert.equal(evaluate('document.querySelector("#demo-fixture-open").disabled'),false);
      click("#demo-fixture-open");
    }else command("upload","#file",fixture);
    wait(`${replies("load")}.length===1`);
    if(config.fixturePicker){
      assert.equal(evaluate('document.querySelector("#file").value'),"","FixtureOpenMustClearPreviousLocalFile");
      assert.equal(evaluate('document.querySelector("#file").files.length'),0,"FixtureOpenMustClearPreviousFileList");
      progress("fixture-picker-loaded");
    }
    click("#enable-edit");wait(`${replies("enable")}.some(r=>r.revision===0)`);
    openBrowserRibbonPage(driver,"view");
    click("#document-window-options > summary");command("fill","#document-window-start",String(paragraph));command("fill","#document-window-count","1");click("#document-window-apply");
    wait(`${replies("set-edit-window")}.length===1`);
    click("details:has(#find-input) > summary");command("fill","#find-input",original);click('#find-form button[type="submit"]');
    if(protectedAnchors){
      wait('!document.querySelector("#canvas-input").disabled&&document.querySelector("#canvas-input").value==='+JSON.stringify(original));
      command("focus","#canvas-input");command("press",evaluate('navigator.platform.includes("Mac")')?"Meta+ArrowUp":"Control+Home");
    }
    wait('!document.querySelector("#canvas-input").disabled&&!document.querySelector("#canvas-input").readOnly');
    assert.equal(evaluate('document.querySelector("#canvas-input").value'),original);
    moveBrowserInputToStart(driver);
    if(protectedAnchors){
      command("press","ArrowRight");
      assert.deepEqual(evaluate('({start:document.querySelector("#canvas-input").selectionStart,end:document.querySelector("#canvas-input").selectionEnd})'),{start:1,end:1});
      command("press","Delete");
      wait("window.__menuAudit.some(r=>r.direction==='reply'&&r.kind==='splice'&&/ProtectedInlineControl/.test(r.error??''))");
      const sent=evaluate("window.__menuAudit.find(r=>r.direction==='request'&&r.kind==='splice')");
      assert.deepEqual([sent.section,sent.paragraph,sent.startUnit,sent.endUnit],[0,paragraph-1,1,2]);
      assert.equal(evaluate('document.querySelector("#canvas-input").value'),original);
      menuKey("menu-undo","u");
      wait(`${replies("undo")}.some(r=>r.changed===false&&r.revision===0)`);
      assert.equal(evaluate('document.querySelector("#canvas-input").value'),original);
      progress("protected-unknown-deletion-refused");moveBrowserInputToStart(driver);
    }
    if(config.replaceWhole){
      command("press",evaluate('navigator.platform.includes("Mac")')?"Meta+Shift+ArrowDown":"Control+Shift+End");
      assert.deepEqual(evaluate('({start:document.querySelector("#canvas-input").selectionStart,end:document.querySelector("#canvas-input").selectionEnd})'),{start:0,end:original.length});
    }
    command("keyboard","inserttext",marker);
    wait(`${replies("splice")}.some(r=>r.revision===1)`);progress("trusted-text-edit");
    assert.deepEqual(evaluate("window.__menuInput.filter(r=>r.trusted&&r.inputType==='insertText').map(r=>r.type)"),["beforeinput","input"]);
    menuKey("menu-undo","u");wait(`${replies("undo")}.some(r=>r.changed&&r.revision===0)`);
    assert.equal(evaluate('document.querySelector("#canvas-input").value'),original);
    menuKey("menu-redo","r");wait(`${replies("redo")}.some(r=>r.changed&&r.revision===1)`);
    assert.equal(evaluate('document.querySelector("#canvas-input").value'),editedText);progress("mnemonic-history");
    command("check","#allow-stale-layout");menuKey("menu-save","s");wait(`${replies("save")}.length===1`);
    assert.equal(evaluate(`document.querySelector(${JSON.stringify(popup("menu-save"))}).open`),false);
    for(const kind of ["splice","undo","redo","save"])assert.equal(evaluate(`window.__menuAudit.filter(r=>r.direction==='request'&&r.kind===${JSON.stringify(kind)}).length`),["splice","undo"].includes(kind)&&protectedAnchors?2:1);
    const downloaded=join(output,"edited.hwpx");click(`${popup("menu-save")} > summary`);
    command("download","#menu-save",downloaded);const saved=readFileSync(downloaded);
    const request={before:input.toString("base64"),after:saved.toString("base64"),section:0,...(oracleMode==="manual-result"?{ordinal:config.formulaOrdinal,display:editedText}:{mode:oracleMode,paragraph,text:marker})};
    for(const flags of [[],["-O"]]){
      await executeOracle("python3",[...flags,oraclePath],{input:JSON.stringify(request),timeout:30000});
      const negative=oracleMode==="manual-result"?{...request,display:"wrong"}:oracleMode==="numeric-input"?{...request,paragraph:paragraph+1}:{...request,text:"wrong"};
      await assert.rejects(executeOracle("python3",[...flags,["manual-result","numeric-input"].includes(oracleMode)?oraclePath:"tools/hwpx-anchor-prefix-oracle.py"],{input:JSON.stringify(negative),timeout:30000}),error=>error.status===1&&error.signal===null&&/complete XML mismatch|Complete XML differs|Complete numeric input XML mismatch/.test(String(error.stderr)));
    }
    evaluate("window.__menuAudit=[]");command("upload","#file",downloaded);wait(`${replies("load")}.length===1`);
    click("#enable-edit");wait(`${replies("enable")}.some(r=>r.revision===0)`);
    if(config.replaceWhole){
      openBrowserRibbonPage(driver,"view");
      if(!evaluate('document.querySelector("#document-window-options").open'))click("#document-window-options > summary");
      command("fill","#document-window-start",String(paragraph));command("fill","#document-window-count","1");click("#document-window-apply");
      wait(`${replies("set-edit-window")}.length===1`);
    }
    command("fill","#find-input",marker);click('#find-form button[type="submit"]');
    // A numeric query can match other cells retained with the table owner.
    if(config.replaceWhole)for(let attempt=0;attempt<50&&evaluate('document.querySelector("#canvas-input").value')!==editedText;attempt++)click('#find-form button[type="submit"]');
    if(config.replaceWhole)assert.equal(evaluate('document.querySelector("#canvas-input").value'),editedText,"ReopenedNumericCellNotFound");
    wait('document.querySelector("#canvas-input").value==='+JSON.stringify(editedText));
    openBrowserRibbonPage(driver,"view");
    const keys=evaluate("window.__menuKeys");
    for(const key of ["p","u","r","s"])assert(keys.some(row=>row.key===key&&row.trusted&&row.consumed),`MissingTrustedMnemonic:${key}`);
    command("scrollintoview","#canvas-input");command("screenshot",join(output,"reopened.png"));
    assert.deepEqual(readFileSync(fixture),input);assert.deepEqual(readFileSync(wasmPath),wasm);assert.deepEqual(sourceHashes(),sourceSha256);
    if(externalOrigin!==null)await verifyBrowserSourceResponses(origin,sourceSha256);
    verified=true;
    writeAuditRow({kind:"menu-browser-result",caseName,verified,session,output,origin,sourceSha256,wasmSha256:hash(wasm),inputSha256:hash(input),savedSha256:hash(saved),scope:config.scope});
  }catch(error){
    writeAuditRow({kind:"menu-browser-failure",caseName,phase,error:error.message});throw error;
  }finally{
    try{if(owned){await closeOwnedBrowser(command);closed=true;}}
    finally{
      if(server?.pid&&server.exitCode===null&&server.signalCode===null){const ended=once(server,"exit"),timer=setTimeout(()=>server.kill("SIGKILL"),3000);server.kill("SIGTERM");try{await ended;}finally{clearTimeout(timer);}}
      const serverExited=!server?.pid||server.exitCode!==null||server.signalCode!==null;
      writeAuditRow({kind:"menu-browser-cleanup",session,browserClosed:closed,serverOwned:Boolean(server?.pid),serverExited,success:verified&&closed&&serverExited});
    }
  }
}
