import assert from "node:assert/strict";
import { spawn, execFileSync as cli } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { clickBrowserTarget } from "./click-target.mjs";
import { moveBrowserInputToStart } from "./input-origin.mjs";
import { closeOwnedBrowser } from "./session-close.mjs";
import { verifyBrowserSourceResponses } from "./audit-origin.mjs";
import { writeAuditRow } from "../audit-jsonl-output.mjs";
import { inspect, paragraphRecords } from "../../tests/hwp5/style-preservation/text-record-oracle.mjs";
import { expectedSplitSection } from "../../tests/hwp5/style-preservation/structure-record-oracle.mjs";
import { openBrowserRibbonPage } from "./ribbon-page.mjs";

export async function runFlowBreakBrowserAudit({ inputMode = "keyboard" } = {}) {
  assert(["keyboard", "menu", "search", "ribbon"].includes(inputMode), "InvalidFlowBrowserInputMode");
  assert(process.env.HWPJS_TEST_WASM, "ExplicitFlowBreakCandidateRequired");
  assert.equal(process.argv.length, 2, "UnexpectedBrowserArguments");
  const root = resolve("."), port = 58879, origin = `http://127.0.0.1:${port}`;
  const wasmPath = resolve(process.env.HWPJS_TEST_WASM), wasm = readFileSync(wasmPath);
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const sourcePaths = ["web/preview/index.html", "web/preview/app.mjs", "web/preview/canvas-editor.mjs", "web/preview/reader-worker.mjs", "web/preview/paragraph-split-command.mjs", "web/preview/paragraph-break-shortcut.mjs", "web/preview/page-row-flow.mjs", "web/preview/page-content-layout.mjs", "js/hwp5-flow-sources.mjs", "js/hwp5-editor.mjs", "js/hwpx-editor.mjs", "js/paragraph-break-api.mjs", "tools/browser/flow-break-roundtrip.mjs", "tools/hwpx-flow-break-oracle.py"];
  if (inputMode === "menu") sourcePaths.push("tools/flow-break-menu-browser-audit.mjs", "web/preview/document-menu-controls.mjs");
  if (inputMode === "search") sourcePaths.push("tools/flow-break-search-browser-audit.mjs", "web/preview/document-menu-controls.mjs", "web/preview/command-search.mjs", "web/preview/command-search.css");
  if (inputMode === "ribbon") sourcePaths.push("tools/flow-break-ribbon-browser-audit.mjs", "web/preview/document-menu-controls.mjs", "web/preview/paragraph-break-controls.mjs", "web/preview/document-ribbon-controls.mjs", "web/preview/document-ribbon-pages.mjs", "tools/browser/ribbon-page.mjs");
  const sourceHashes = () => Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));
  const sourceSha256 = sourceHashes();
  const output = mkdtempSync(join(tmpdir(), "hwpjs-flow-break-browser-"));
  const session = cli("agent-browser", ["session", "id", "--scope", "worktree", "--prefix", `hwpjs-flow-${inputMode === "keyboard" ? "break" : inputMode}`], { encoding: "utf8", timeout: 10000 }).trim();
  assert(/^[a-zA-Z0-9_-]+$/.test(session));
  const command = (...args) => {
    const result = JSON.parse(cli("agent-browser", ["--json", "--session", session, ...args], { cwd: root, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 }));
    assert.equal(result.success, true, JSON.stringify(result.error));
    return result.data;
  };
  const evaluate = expression => { const data = command("eval", expression); assert(Object.hasOwn(data, "result")); return data.result; };
  const driver = { command, evaluate }, click = selector => clickBrowserTarget(driver, selector);
  const wait = expression => command("wait", "--fn", expression);
  let server, owned = false, closed = false, verified = false;
  try {
    assert.equal(command("session", "info").active, false, "RefuseActiveBrowserSession");
    server = spawn(process.execPath, [resolve("tools/serve-preview.mjs"), String(port), wasmPath], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(Error("ServerStartTimeout")), 10000);
      server.once("error", error => { clearTimeout(timer); reject(error); });
      server.once("exit", code => { clearTimeout(timer); reject(Error(`ServerExited:${code}`)); });
      server.stdout.once("data", bytes => { clearTimeout(timer); String(bytes).includes(origin) ? accept() : reject(Error("UnexpectedServer")); });
    });
    await verifyBrowserSourceResponses(origin, sourceSha256);
    const response = await fetch(`${origin}/zig-out/bin/hwpjs.wasm`);
    assert.equal(response.status, 200); assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(wasm));
    owned = true; command("open", `${origin}/web/preview/index.html`); command("snapshot", "-i");
    wait('!document.querySelector("#file").disabled');
    evaluate(`(() => {
      window.__flowAudit=[];window.__flowKeys=[];window.__flowMenu=[];const watched=new WeakSet(),post=Worker.prototype.postMessage;
      Worker.prototype.postMessage=function(message,...rest){
        if(!watched.has(this)){watched.add(this);this.addEventListener('message',event=>{const r=event.data;window.__flowAudit.push({direction:'reply',kind:r.kind,error:r.error,changed:r.changed,capability:r.paragraphBreakAvailable,splitTarget:r.splitTarget});});}
        window.__flowAudit.push({direction:'request',kind:message.kind,section:message.section,paragraph:message.paragraph,atUnit:message.atUnit,endUnit:message.endUnit,breakBefore:message.breakBefore});return post.call(this,message,...rest);
      };
      window.addEventListener('keydown',event=>window.__flowKeys.push({key:event.key,trusted:event.isTrusted,consumed:event.defaultPrevented,ctrl:event.ctrlKey,meta:event.metaKey,alt:event.altKey,shift:event.shiftKey}));
      window.addEventListener('click',event=>{const button=event.target.closest?.('button[id^="menu-insert-"][id$="-break"]');if(button)window.__flowMenu.push({id:button.id,trusted:event.isTrusted});});
      window.addEventListener('click',event=>{const button=event.target.closest?.('#insert-page-break,#insert-column-break');if(button)window.__flowMenu.push({id:button.id,trusted:event.isTrusted});});
    })()`);
    for (const format of ["hwp5", "hwpx"]) for (const kind of ["page", "column"]) {
      evaluate("window.__flowAudit=[];window.__flowKeys=[];window.__flowMenu=[]");
      const fixture = resolve(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`), input = readFileSync(fixture);
      command("upload", "#file", fixture);
      wait("window.__flowAudit.some(r=>r.direction==='reply'&&r.kind==='load')");
      command("snapshot", "-i"); click("#enable-edit");
      wait("window.__flowAudit.some(r=>r.direction==='reply'&&r.kind==='enable'&&r.capability===true)");
      if (!evaluate('document.querySelector("#find-options").open')) click("#find-options > summary");
      const originalText = format === "hwp5" ? "기울임진하게" : "가";
      command("fill", "#find-input", originalText); click('#find-form button[type="submit"]');
      wait('!document.querySelector("#canvas-input").disabled&&!document.querySelector("#canvas-input").readOnly');
      const paragraph = format === "hwp5" ? 1 : 0;
      assert.equal(evaluate('document.querySelector("#canvas-input").value'), originalText);
      assert(evaluate('document.querySelector("#canvas").dataset.caret').startsWith(`0:${paragraph}:`));
      const layoutBefore = evaluate('document.querySelector("#page-layout-status").textContent');
      moveBrowserInputToStart(driver);
      if (inputMode === "ribbon") {
        assert.equal(openBrowserRibbonPage(driver, "insert"), true);
        command("snapshot", "-i");
        assert.equal(evaluate(`document.querySelector('#insert-${kind}-break').disabled`), false);
        command("screenshot", join(output, `${format}-${kind}-ribbon.png`));
        click(`#insert-${kind}-break`);
      } else if (inputMode === "search") {
        command("press", "Control+Shift+p");
        wait('document.querySelector("#command-search").open');
        command("snapshot", "-i");
        command("fill", "#command-search-query", kind === "page" ? "쪽 나누기" : "단 나누기");
        assert.equal(evaluate('document.querySelectorAll("#command-search-results button").length'), 1);
        assert.equal(evaluate('document.querySelector("#command-search-results button").disabled'), false);
        assert.equal(evaluate('document.querySelector("#command-search-results button").dataset.commandId'), `menu-insert-${kind}-break`);
        command("screenshot", join(output, `${format}-${kind}-search.png`));
        command("press", "Enter");
        assert.equal(evaluate('document.querySelector("#command-search").open'), false);
      } else if (inputMode === "menu") {
        command("snapshot", "-i");
        click(`.document-menu details:has(#menu-insert-${kind}-break) > summary`);
        command("snapshot", "-i");
        assert.equal(evaluate(`document.querySelector('#menu-insert-${kind}-break').disabled`), false);
        command("screenshot", join(output, `${format}-${kind}-menu.png`));
        click(`#menu-insert-${kind}-break`);
      } else command("press", kind === "page" ? "Control+Enter" : "Control+Shift+Enter");
      wait("window.__flowAudit.some(r=>r.direction==='reply'&&r.kind==='split')");
      const sent = evaluate("window.__flowAudit.filter(r=>r.direction==='request'&&r.kind==='split')");
      assert.equal(sent.length, 1); assert.deepEqual([sent[0].section, sent[0].paragraph, sent[0].atUnit, sent[0].endUnit, sent[0].breakBefore], [0, paragraph, 0, 0, kind]);
      const reply = evaluate("window.__flowAudit.find(r=>r.direction==='reply'&&r.kind==='split')");
      assert.equal(reply.error, undefined); assert.deepEqual(reply.splitTarget, { section: 0, paragraph: paragraph + 1 });
      const layoutAfter = evaluate('document.querySelector("#page-layout-status").textContent');
      assert.match(layoutBefore, /^측정 배치 1페이지/);
      assert.match(layoutAfter, /^측정 배치 2페이지/);
      if (inputMode === "ribbon") assert(evaluate(`window.__flowMenu.some(e=>e.id==='insert-${kind}-break'&&e.trusted)`));
      else if (inputMode === "search") assert(evaluate("window.__flowKeys.some(e=>e.key==='Enter'&&e.trusted&&e.consumed&&!e.ctrl&&!e.meta&&!e.alt&&!e.shift)"));
      else if (inputMode === "menu") assert(evaluate(`window.__flowMenu.some(e=>e.id==='menu-insert-${kind}-break'&&e.trusted)`));
      else assert(evaluate("window.__flowKeys.some(e=>e.key==='Enter'&&e.trusted&&e.consumed&&e.ctrl&&!e.meta&&!e.alt&&e.shift===" + (kind === "column") + ")"));
      command("screenshot", join(output, `${format}-${kind}.png`));
      click("#undo"); wait("window.__flowAudit.some(r=>r.direction==='reply'&&r.kind==='undo'&&r.changed===true)");
      click("#redo"); wait("window.__flowAudit.some(r=>r.direction==='reply'&&r.kind==='redo'&&r.changed===true)");
      if (format === "hwp5") command("check", "#allow-stale-layout");
      click(".document-menu details:has(#menu-save) > summary");
      const downloaded = join(output, `${format}-${kind}.${format === "hwp5" ? "hwp" : "hwpx"}`);
      command("download", "#menu-save", downloaded);
      const saved = readFileSync(downloaded);
      if (format === "hwp5") {
        const before = inspect(input), after = inspect(saved), expected = expectedSplitSection(before.sections, 0, 1, 0), right = paragraphRecords(expected, 2).head;
        expected[right.start + right.raw.length - right.payload.length + 11] = kind === "page" ? 4 : 8;
        assert.deepEqual(after.sections[0].bytes, expected);
        for (const [path, bytes] of before.streams) if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes);
      } else {
        const payload = JSON.stringify({ before: input.toString("base64"), after: saved.toString("base64"), kind });
        for (const flags of [[], ["-O"]]) cli("python3", [...flags, "tools/hwpx-flow-break-oracle.py"], { input: payload });
      }
      evaluate("window.__flowAudit=[]"); command("upload", "#file", downloaded);
      wait("window.__flowAudit.some(r=>r.direction==='reply'&&r.kind==='load')");
      assert.equal(evaluate('document.querySelector("#status").textContent.includes("오류:")'), false);
      writeAuditRow({ kind: "flow-break-browser-case", inputMode, format, breakBefore: kind, session, output, layoutBefore, layoutAfter, inputSha256: hash(input), savedSha256: hash(saved), verified: true });
    }
    assert.deepEqual(sourceHashes(), sourceSha256); assert.equal(hash(readFileSync(wasmPath)), hash(wasm));
    verified = true; writeAuditRow({ kind: "flow-break-browser-verified", session, output, sourceSha256, wasmSha256: hash(wasm) });
  } finally {
    try { if (owned) { await closeOwnedBrowser(command); closed = true; } }
    finally {
      if (server?.pid && server.exitCode === null && server.signalCode === null) {
        const ended = once(server, "exit"), timer = setTimeout(() => server.kill("SIGKILL"), 3000);
        server.kill("SIGTERM"); try { await ended; } finally { clearTimeout(timer); }
      }
      const serverExited = !server?.pid || server.exitCode !== null || server.signalCode !== null;
      writeAuditRow({ kind: "flow-break-browser-cleanup", session, browserClosed: closed, serverExited, success: verified && closed && serverExited });
    }
  }
}
