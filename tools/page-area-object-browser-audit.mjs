import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { closeOwnedBrowser } from "./browser/session-close.mjs";
import { verifyHwpxSourceTextRoundtrip } from "./browser/hwpx-source-text-roundtrip.mjs";

assert.equal(process.argv.length, 2);
assert.ok(process.env.HWPJS_TEST_WASM, "ExplicitCandidateRequired");
const wasm = resolve(process.env.HWPJS_TEST_WASM);
assert.ok(WebAssembly.Module.exports(new WebAssembly.Module(readFileSync(wasm))).some(e => e.name === "hwpx_edit_page_area_declarations"));
const fixture = resolve("reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx");
const input = readFileSync(fixture), hash = bytes => createHash("sha256").update(bytes).digest("hex");
const output = mkdtempSync(join(tmpdir(), "hwpjs-page-area-objects-"));
const session = execFileSync("agent-browser", ["session", "id", "--scope", "worktree", "--prefix", "hwpjs-page-area-objects"], { encoding: "utf8" }).trim();
const command = (...args) => {
  const reply = JSON.parse(execFileSync("agent-browser", ["--json", "--session", session, ...args], {
    encoding: "utf8", timeout: 65000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: "60000" },
  }));
  assert.equal(reply.success, true, JSON.stringify(reply.error)); return reply.data;
};
const evaluate = source => command("eval", source).result;
let server, owned = false;
try {
  assert.equal(command("session", "info").active, false);
  server = spawn(process.execPath, [resolve("tools/serve-preview.mjs"), "58886", wasm], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(Error("ServerStartTimeout")), 10000);
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(Error("ServerExited:" + code)); });
    server.stdout.once("data", () => { clearTimeout(timer); accept(); });
  });
  owned = true;
  command("open", "http://127.0.0.1:58886/web/preview/index.html");
  command("wait", "--fn", '!document.querySelector("#file").disabled');
  evaluate(`(() => {
    window.__areaDraws=[];window.__areaReplies=[];
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){
      window.__areaDraws.push({args:args.slice(1),scroll:document.querySelector('#viewport').scrollTop});
      return draw.apply(this,args);
    };
    const post=Worker.prototype.postMessage,watched=new WeakSet();
    Worker.prototype.postMessage=function(message,...rest){
      if(!watched.has(this)){watched.add(this);this.addEventListener('message',event=>{if(event.data.content)window.__areaContent=event.data.content;window.__areaReplies.push({kind:event.data.kind,error:event.data.error,declarations:event.data.content?.pageAreaDeclarations});});}
      return post.call(this,message,...rest);
    };
  })()`);
  command("upload", "#file", fixture);
  command("wait", "--fn", 'window.__areaReplies.some(r=>r.kind==="load")');
  const reply = evaluate('window.__areaReplies.find(r=>r.kind==="load")');
  assert.equal(reply.error, undefined); assert.equal(reply.declarations.length, 3);
  command("wait", "--fn", 'Number(document.querySelector("#canvas").dataset.rows)>0');
  const state = () => evaluate('({page:document.querySelector("#page-layout-status").textContent,data:{...document.querySelector("#canvas").dataset},draws:window.__areaDraws.length})');
  console.log(JSON.stringify({ phase: "loaded", session, output, ...state() }));
  console.log(JSON.stringify(evaluate(`(() => {const failure=JSON.parse(document.querySelector('#canvas').dataset.pageLayoutFailure||'null');if(!failure)return null;const p=window.__areaContent.paragraphs.find(p=>p.section===failure.section&&p.paragraph===failure.paragraph);return {length:p?.text.length,shape:p?.paragraphShape,tables:window.__areaContent.tables.filter(t=>t.section===failure.section&&t.hostParagraph===failure.paragraph).map(t=>({node:t.tableNode,pagination:t.pagination,geometry:t.sourceGeometry}))}})()`)));
  command("screenshot", join(output, "loaded.png"));
  assert.match(state().page, /측정 배치 \d+페이지/);
  command("wait", "--fn", 'document.querySelector("#picture-status").textContent.includes("대기 0개")');
  command("scrollintoview", "#viewport");
  command("screenshot", join(output, "first.png"));
  evaluate('window.__areaDraws=[]');
  const extent = evaluate('({height:document.querySelector("#viewport").scrollHeight,client:document.querySelector("#viewport").clientHeight})');
  assert.ok(extent.client > 0 && extent.height > extent.client);
  let captured = false;
  for (let top = Math.floor(extent.height * 0.65); top < extent.height; top += Math.max(1, Math.floor(extent.client / 2))) {
    evaluate(`new Promise(resolve=>{document.querySelector('#viewport').scrollTop=${top};requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)));})`);
    if (!captured && evaluate('window.__areaDraws.length') > 0) { command("screenshot", join(output, "tail-picture.png")); captured = true; }
  }
  assert.ok(evaluate('window.__areaDraws.length') > 0, "TailPagesMustPaintImages");
  command("screenshot", join(output, "last.png"));
  const cellEdited = verifyHwpxSourceTextRoundtrip({ command, evaluate }, input, output, { host: "cell" });
  command("screenshot", join(output, "cell-reopened.png"));
  evaluate("window.__areaReplies=[]"); command("upload", "#file", fixture);
  command("wait", "--fn", 'window.__areaReplies.some(r=>r.kind==="load"&&!r.error)');
  const footerEdited = verifyHwpxSourceTextRoundtrip({ command, evaluate }, input, output, { host: "footer" });
  command("screenshot", join(output, "footer-reopened.png"));
  assert.deepEqual(readFileSync(fixture), input);
  console.log(JSON.stringify({ session, output, cellEdited, footerEdited, wasmSha256: hash(readFileSync(wasm)), ...state() }));
} finally {
  try { if (owned) await closeOwnedBrowser(command); }
  finally { if (server && server.exitCode === null && server.signalCode === null) { const ended = once(server, "exit"); server.kill("SIGTERM"); await ended; } }
}
