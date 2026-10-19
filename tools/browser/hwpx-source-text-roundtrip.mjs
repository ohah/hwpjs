import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "../oracle-process.mjs";
import { join } from "node:path";
import { clickBrowserTarget } from "./click-target.mjs";
import { openBrowserRibbonPage } from "./ribbon-page.mjs";
import { moveBrowserInputToStart } from "./input-origin.mjs";
import { clickBlankFooter } from "./blank-footer-pointer.mjs";

/** Real find/pointer/input/history/download/reupload for one source paragraph. */
export function verifyHwpxSourceTextRoundtrip(driver, input, output, { host = "cell" } = {}) {
  assert.ok(["cell", "footer"].includes(host));
  const { command, evaluate } = driver, click = selector => clickBrowserTarget(driver, selector);
  const wait = source => command("wait", "--fn", source);
  click("#enable-edit");
  wait('window.__areaReplies.some(r=>r.kind==="enable"&&!r.error)');
  const target = evaluate(`(() => {const all=window.__areaContent.paragraphs,flows=window.__areaContent.paragraphFlows;
    const candidates=all.filter(p=>(p.editable||p.selectable)&&(${JSON.stringify(host)}==='cell'?p.tableCell&&!p.text.includes('\\ufffc'):flows.some(f=>f.section===p.section&&f.paragraph===p.paragraph&&f.host==='footer')));
    if(${JSON.stringify(host)}==='footer')candidates.reverse();
    for(const p of candidates){if(${JSON.stringify(host)}==='footer'&&p.text.length&&!p.text.trim())return {...p,query:null};const query=p.text.split('\\ufffc').map(s=>s.trim()).sort((a,b)=>b.length-a.length).find(s=>s.length>15&&(${JSON.stringify(host)}==='footer'||all.filter(other=>other.text.includes(s)).length===1));if(query)return {...p,query};}return null;})()`);
  assert.ok(target, "EditableSourceTargetRequired");
  const original = target.text, marker = "셀검증😀";
  const find = query => {
    openBrowserRibbonPage(driver, "view");
    if (!evaluate('document.querySelector("#find-options").open')) click("#find-options > summary");
    command("fill", "#find-input", query); click('#find-form button[type="submit"]');
  };
  if (target.query === null) clickBlankFooter(driver, target);
  else find(target.query);
  const targetCaret = `${target.section}:${target.paragraph}:`;
  for (let attempt = 0; target.query !== null && attempt < 4 && !evaluate('document.querySelector("#canvas").dataset.caret').startsWith(targetCaret); attempt++) click('#find-form button[type="submit"]');
  assert.ok(evaluate('document.querySelector("#canvas").dataset.caret').startsWith(targetCaret), "SourceSearchTargetNotReached");
  wait('document.querySelector("#canvas-input").value===' + JSON.stringify(original));
  if (target.query !== null) {
  command("scrollintoview", "#canvas-input");
  const point = evaluate(`(() => {const r=document.querySelector('#canvas-input').getBoundingClientRect(),x=Math.round(r.left+1),y=Math.round(r.top+r.height/2);return {x,y,canvas:document.elementFromPoint(x,y)===document.querySelector('#canvas')};})()`);
  assert.equal(point.canvas, true, "CellCaretMustHitCanvas");
  evaluate("window.__cellPointer=false;document.querySelector('#canvas').addEventListener('pointerdown',e=>window.__cellPointer=e.isTrusted&&e.target===document.querySelector('#canvas'),{once:true})");
  command("mouse", "move", String(point.x), String(point.y)); command("mouse", "down"); command("mouse", "up");
  assert.equal(evaluate("window.__cellPointer"), true);
  }
  assert.ok(evaluate('document.querySelector("#canvas").dataset.caret').startsWith(`${target.section}:${target.paragraph}:`));
  moveBrowserInputToStart(driver);
  command("keyboard", "inserttext", marker);
  wait('document.querySelector("#canvas-input").value===' + JSON.stringify(marker + original));
  wait('window.__areaReplies.some(r=>r.kind==="splice"&&!r.error)');
  openBrowserRibbonPage(driver, "home"); click("#undo");
  wait('document.querySelector("#canvas-input").value===' + JSON.stringify(original));
  click("#redo"); wait('document.querySelector("#canvas-input").value===' + JSON.stringify(marker + original));
  const savedPath = join(output, `${host}-edited.hwpx`); command("download", "#download", savedPath);
  const saved = readFileSync(savedPath), payload = { before: input.toString("base64"), after: saved.toString("base64"),
    section: target.section, paragraph: target.paragraph + 1, text: marker, mode: original.startsWith("\ufffc") ? "anchored" : "direct_text" };
  for (const flags of [[], ["-O"]]) {
    execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(payload), timeout: 30000 });
    assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
      input: JSON.stringify({ ...payload, text: "wrong" }), timeout: 30000,
    }), error => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)));
  }
  evaluate("window.__areaReplies=[]"); command("upload", "#file", savedPath);
  wait('window.__areaReplies.some(r=>r.kind==="load"&&!r.error)');
  assert.match(evaluate('document.querySelector("#page-layout-status").textContent'), /측정 배치 \d+페이지/);
  click("#enable-edit"); wait('window.__areaReplies.some(r=>r.kind==="enable"&&!r.error)');
  find(marker); wait('document.querySelector("#canvas-input").value===' + JSON.stringify(marker + original));
  return { section: target.section, paragraph: target.paragraph, savedPath };
}
