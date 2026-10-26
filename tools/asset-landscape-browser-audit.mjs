import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { closeOwnedBrowser } from "./browser/session-close.mjs";
import { clickBrowserTarget } from "./browser/click-target.mjs";
const origin = process.argv[2] ?? "https://macstudio.tailed42f2.ts.net:10000";
const expectCentered = process.argv.includes("--expect-centered");
assert(
  process.argv.slice(3).every((arg) => arg === "--expect-centered"),
  "UnexpectedArgument",
);
const output = resolve(
  "zig-out/verification/asset-landscape",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
await mkdir(output, { recursive: true });
const session = execFileSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "hwpjs-asset-landscape"],
  { encoding: "utf8" },
).trim();
const command = (...args) => {
  const r = JSON.parse(
    execFileSync("agent-browser", ["--session", session, "--json", ...args], {
      encoding: "utf8",
      timeout: 45000,
      maxBuffer: 6 * 1024 * 1024,
    }),
  );
  assert.equal(r.success, true, JSON.stringify(r.error));
  return r.data;
};
const evaluate = (s) => command("eval", s).result;
let result = {},
  cleanup;
assert.equal(command("session", "info").active, false);
try {
  command("set", "viewport", "1440", "1000");
  command("open", origin + "/demo/vanilla");
  command("wait", "--fn", 'document.querySelector("[data-role=fixture-picker]")?.disabled===false');
  evaluate(
    `(()=>{window.__asset={frames:[]};const p=CanvasRenderingContext2D.prototype,c=p.clearRect,s=p.strokeRect,f=p.fillRect;p.clearRect=function(...a){if(this.canvas.isConnected)window.__asset.frames=[];return c.apply(this,a)};p.fillRect=function(...a){if(this.canvas.isConnected&&this.fillStyle==='#e8edf2'&&a[0]===0&&a[1]===0)window.__asset.frames=[];return f.apply(this,a)};p.strokeRect=function(x,y,width,height){if(this.canvas.isConnected&&this.strokeStyle==='#bbcbd6')window.__asset.frames.push({x,y,width,height,matrix:this.getTransform().toJSON()});return s.call(this,x,y,width,height)};window.__assetSnapshot=()=>{const canvas=document.querySelector('canvas'),v=canvas.parentElement.parentElement,b=canvas.getBoundingClientRect();return {windowWidth:innerWidth,canvas:b.toJSON(),viewport:v.getBoundingClientRect().toJSON(),scrollTop:v.scrollTop,scrollLeft:v.scrollLeft,scrollHeight:v.scrollHeight,frames:window.__asset.frames.map(p=>({...p,screenLeft:b.left+(p.matrix.a*p.x+p.matrix.c*p.y+p.matrix.e)*b.width/canvas.width,screenCenter:b.left+(p.matrix.a*(p.x+p.width/2)+p.matrix.c*p.y+p.matrix.e)*b.width/canvas.width})),status:document.querySelector('.hwp-demo-statusbar')?.innerText};};return true})()`,
  );
  command("select", "[data-role=fixture-picker]", "asset-management-reference.hwpx");
  clickBrowserTarget({ command, evaluate }, ".hwp-demo-picker > button");
  command(
    "wait",
    "--fn",
    'document.querySelector("h1")?.textContent.includes("3249937")&&window.__asset.frames.length>0',
  );
  result.first = evaluate("window.__assetSnapshot()");
  command("screenshot", join(output, "portrait-before.png"));
  result.scan = evaluate(
    `(async()=>{const canvas=document.querySelector('canvas'),v=canvas.parentElement.parentElement,steps=[],max=v.scrollHeight-v.clientHeight;let wide,after;for(let i=1;i<=90;i++){v.scrollTop=max*i/90;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const g=window.__assetSnapshot();steps.push({scrollTop:g.scrollTop,widths:g.frames.map(f=>f.width)});if(g.frames.some(f=>f.width>1000)){wide=g;}else if(wide&&g.frames.some(f=>f.width<900)){after=g;break;}}return {steps,wide,after}})()`,
  );
  if (result.scan.wide) {
    evaluate(
      `document.querySelector('canvas').parentElement.parentElement.scrollTop=${result.scan.wide.scrollTop}`,
    );
    command("wait", "--fn", `window.__asset.frames.some(p=>p.width>1000)`);
    command("screenshot", join(output, "landscape.png"));
  }
  result.centerErrors = {
    first: result.first.frames.map((f) => f.screenCenter - result.first.windowWidth / 2),
    wide: result.scan.wide?.frames.map((f) => f.screenCenter - result.scan.wide.windowWidth / 2),
    after: result.scan.after?.frames.map((f) => f.screenCenter - result.scan.after.windowWidth / 2),
  };
  if (expectCentered) {
    assert(result.scan.wide && result.scan.after, "MixedOrientationSequenceNotObserved");
    for (const [phase, errors] of Object.entries(result.centerErrors)) {
      assert(errors?.length, `MissingPageFrames:${phase}`);
      assert(
        errors.every((error) => Math.abs(error) < 1),
        `PageCenterMismatch:${phase}:${errors}`,
      );
    }
    assert(
      Math.abs(result.first.viewport.right - result.first.windowWidth) < 2,
      "ScrollbarViewportNotAtRightEdge",
    );
  }
  result.expectCentered = expectCentered;
  console.log(
    JSON.stringify({
      output,
      first: result.first.frames.map((f) => ({ width: f.width, center: f.screenCenter })),
      wide: result.scan.wide?.frames.map((f) => ({ width: f.width, center: f.screenCenter })),
      centerErrors: result.centerErrors,
    }),
  );
} catch (error) {
  result.error = String(error);
  try {
    result.snapshot = evaluate("window.__assetSnapshot?.()");
    command("screenshot", join(output, "failure.png"));
  } catch {}
  throw error;
} finally {
  await closeOwnedBrowser(command);
  cleanup = { inactive: command("session", "info").active === false };
  await writeFile(
    join(output, "result.json"),
    JSON.stringify({ origin, result, cleanup }, null, 2),
  );
}
