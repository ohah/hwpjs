import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { clickBrowserTarget } from "./browser/click-target.mjs";
import { moveBrowserInputToStart } from "./browser/input-origin.mjs";
import { openBrowserRibbonPage } from "./browser/ribbon-page.mjs";
import { closeOwnedBrowser } from "./browser/session-close.mjs";

assert.equal(process.argv.length, 2, "UnexpectedBrowserAuditArguments");
assert(process.env.HWPJS_TEST_WASM, "ExplicitBrowserCandidateRequired");
const wasmPath = resolve(process.env.HWPJS_TEST_WASM), wasm = readFileSync(wasmPath);
const fixture = resolve("reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx"), input = readFileSync(fixture);
const required = ["hwpx_edit_picture_caption", "hwpx_edit_picture_caption_bindings"];
const exports = WebAssembly.Module.exports(new WebAssembly.Module(wasm));
assert(required.every(name => exports.some(e => e.name === name && e.kind === "function")), "CaptionCandidateRequired");
let original;
const marker = "브라우저검증😀";
const output = mkdtempSync(join(tmpdir(), "hwpjs-caption-canvas-"));
const session = execFileSync("agent-browser", ["session", "id", "--scope", "worktree", "--prefix", "hwpjs-caption-canvas"], { encoding: "utf8", timeout: 10000 }).trim();
assert(/^[a-zA-Z0-9_-]+$/.test(session));
const origin = "http://127.0.0.1:58884";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = ["tools/captioned-picture-browser-audit.mjs", "web/preview/index.html", "web/preview/preview.css", "web/preview/reader-worker.mjs", "web/preview/hwpx-picture-captions.mjs", "js/hwpx-editor.mjs",
  "web/preview/app.mjs", "web/preview/renderer.mjs", "web/preview/page-content-layout.mjs", "web/preview/drawing-body-content-layout.mjs",
  "web/preview/table-body-content-layout.mjs", "web/preview/picture-page-projection.mjs", "web/preview/picture-paragraph-page-fragment.mjs", "web/preview/reserved-picture-page-flow.mjs", "web/preview/canvas-editor.mjs"];
const sourceHashes = () => Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));
assert(sourcePaths.every(path => existsSync(path)), "CaptionPreviewSourceRequired");
const beforeSources = sourceHashes();
const command = (...args) => {
  const value = JSON.parse(execFileSync("agent-browser", ["--json", "--session", session, ...args], {
    encoding: "utf8", timeout: 35000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "30000", AGENT_BROWSER_DOWNLOAD_PATH: output },
  }));
  assert.equal(value.success, true, JSON.stringify(value.error)); return value.data;
};
const evaluate = source => command("eval", source).result;
const driver = { command, evaluate }, click = selector => clickBrowserTarget(driver, selector);
const wait = source => command("wait", "--fn", source);
const replies = kind => `window.__captionAudit.filter(r=>r.direction==='reply'&&r.kind===${JSON.stringify(kind)}&&!r.error)`;
const status = () => evaluate('({status:document.querySelector("#status").textContent,page:document.querySelector("#page-layout-status").textContent,caret:document.querySelector("#canvas").dataset.caret,input:document.querySelector("#canvas-input").value})');
const phase = name => console.log(JSON.stringify({ kind: "caption-browser-phase", name, session, output }));
let server, owned = false, verified = false;
try {
  assert.equal(command("session", "info").active, false, "RefuseActiveSession");
  server = spawn(process.execPath, [resolve("tools/serve-preview.mjs"), "58884", wasmPath], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(Error("ServerStartTimeout")), 10000);
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(Error(`ServerExited:${code}`)); });
    server.stdout.once("data", bytes => { clearTimeout(timer); String(bytes).includes(origin) ? accept() : reject(Error("UnexpectedServer")); });
  });
  const served = await fetch(origin + "/zig-out/bin/hwpjs.wasm");
  assert.equal(served.status, 200); assert.equal(hash(Buffer.from(await served.arrayBuffer())), hash(wasm));
  owned = true;
  command("open", origin + "/web/preview/index.html"); command("snapshot", "-i");
  wait('!document.querySelector("#file").disabled');
  evaluate(`(() => {
    window.__captionAudit=[];window.__captionInput=[];
    const watched=new WeakSet(),post=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...rest){
      if(!watched.has(this)){watched.add(this);this.addEventListener('message',event=>{
        const r=event.data;window.__captionAudit.push({direction:'reply',kind:r.kind,error:r.error,revision:r.historyRevision,changed:r.changed});
        if(r.kind==='load'&&r.content){const p=r.content.paragraphs.find(p=>p.section===0&&p.paragraph===30);window.__captionSource={text:p?.text,editable:p?.editable};}
      });}
      window.__captionAudit.push({direction:'request',kind:message.kind,section:message.section,paragraph:message.paragraph,startUnit:message.startUnit,endUnit:message.endUnit,text:message.kind==='splice'?message.text:undefined});
      return post.call(this,message,...rest);
    };
    for(const type of ['beforeinput','input'])document.querySelector('#canvas-input').addEventListener(type,e=>window.__captionInput.push({type,trusted:e.isTrusted,inputType:e.inputType}));
  })()`);
  command("upload", "#file", fixture);
  wait(`${replies("load")}.length===1`);
  const source = evaluate("window.__captionSource");
  assert.equal(source.editable, true); assert.equal(typeof source.text, "string");
  original = source.text;
  const query = original.slice(1, 24).trim(); assert(query.length > 10);
  assert.match(status().page, /측정 배치 \d+페이지/);
  phase("loaded-physical-pages");
  click("#enable-edit"); wait(`${replies("enable")}.length===1`);
  openBrowserRibbonPage(driver, "view"); click("#find-options > summary");
  command("fill", "#find-input", query); click('#find-form button[type="submit"]');
  wait('!document.querySelector("#canvas-input").disabled&&!document.querySelector("#canvas-input").readOnly');
  assert.equal(status().input, original); assert.match(status().caret, /^0:30:/);
  command("scrollintoview", "#canvas-input");
  const pointer = evaluate(`(() => { const r=document.querySelector('#canvas-input').getBoundingClientRect(),x=Math.round(r.left+1),y=Math.round(r.top+r.height/2);
    return {x,y,inside:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,canvasHit:document.elementFromPoint(x,y)===document.querySelector('#canvas')}; })()`);
  assert.ok(pointer.inside && pointer.canvasHit, "NativeCaretPointMustHitCanvas");
  evaluate("window.__captionPointer=null;document.querySelector('#canvas').addEventListener('pointerdown',e=>window.__captionPointer={trusted:e.isTrusted,canvas:e.target===document.querySelector('#canvas')},{once:true})");
  command("mouse", "move", String(pointer.x), String(pointer.y));
  assert.equal(evaluate('getComputedStyle(document.querySelector("#canvas")).cursor'), "text");
  command("mouse", "down"); command("mouse", "up");
  assert.deepEqual(evaluate("window.__captionPointer"), { trusted: true, canvas: true });
  assert.match(status().caret, /^0:30:/); assert.equal(status().input, original);
  phase("trusted-canvas-pointer");
  command("screenshot", join(output, "before.png"));
  moveBrowserInputToStart(driver);
  command("keyboard", "inserttext", marker);
  wait(`${replies("splice")}.length===1`);
  assert.equal(status().input, marker + original);
  const request = evaluate("window.__captionAudit.find(r=>r.direction==='request'&&r.kind==='splice')");
  assert.deepEqual([request.section, request.paragraph, request.startUnit, request.endUnit, request.text], [0, 30, 0, 0, marker]);
  assert.ok(evaluate("window.__captionInput.some(r=>r.type==='input'&&r.trusted)"));
  assert.match(status().page, /측정 배치 \d+페이지/);
  phase("trusted-canvas-prefix");
  openBrowserRibbonPage(driver, "home"); click("#undo"); wait(`${replies("undo")}.some(r=>r.changed)`);
  assert.equal(status().input, original);
  click("#redo"); wait(`${replies("redo")}.some(r=>r.changed)`);
  assert.equal(status().input, marker + original);
  assert.match(status().page, /측정 배치 \d+페이지/);
  phase("trusted-history");
  const savedPath = join(output, "edited.hwpx");
  command("download", "#download", savedPath);
  const saved = readFileSync(savedPath);
  const payload = { before: input.toString("base64"), after: saved.toString("base64"), section: 0, paragraph: 31, text: marker, mode: "anchored" };
  for (const flags of [[], ["-O"]]) {
    execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(payload), timeout: 30000 });
    assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
      input: JSON.stringify({ ...payload, text: "wrong" }), timeout: 30000, stdio: ["pipe", "pipe", "pipe"],
    }), error => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)));
  }
  phase("download-independent-xml");
  evaluate("window.__captionAudit=[]"); command("upload", "#file", savedPath); wait(`${replies("load")}.length===1`);
  assert.match(status().page, /측정 배치 \d+페이지/);
  click("#enable-edit"); wait(`${replies("enable")}.length===1`);
  openBrowserRibbonPage(driver, "view");
  if (!evaluate('document.querySelector("#find-options").open')) click("#find-options > summary");
  command("fill", "#find-input", marker); click('#find-form button[type="submit"]');
  wait('document.querySelector("#canvas-input").value===' + JSON.stringify(marker + original));
  assert.match(status().caret, /^0:30:/);
  wait('document.querySelector("#picture-status").textContent.includes("대기 0개")');
  assert.match(status().page, /그림 배치 후보 6\/6 · 해독 6개 · 실패 0개 · 대기 0개/);
  command("screenshot", join(output, "reopened.png"));
  assert.deepEqual(sourceHashes(), beforeSources);
  verified = true;
  console.log(JSON.stringify({ kind: "caption-browser-result", verified, session, output, wasmSha256: hash(wasm), sourceSha256: beforeSources, savedSha256: hash(saved), pageStatus: status().page }));
} catch (error) {
  if (owned) {
    try { command("screenshot", join(output, "failure.png")); console.log(JSON.stringify({ kind: "caption-browser-state", ...status() })); } catch { /* Keep the original failure. */ }
  }
  console.log(JSON.stringify({ kind: "caption-browser-failure", error: error.message, session, output })); throw error;
} finally {
  try { if (owned) await closeOwnedBrowser(command); }
  finally {
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const ended = once(server, "exit"), timer = setTimeout(() => server.kill("SIGKILL"), 3000);
      server.kill("SIGTERM"); try { await ended; } finally { clearTimeout(timer); }
    }
    console.log(JSON.stringify({ kind: "caption-browser-cleanup", verified, session, browserInactive: command("session", "info").active === false,
      serverExited: !server?.pid || server.exitCode !== null || server.signalCode !== null }));
  }
}
