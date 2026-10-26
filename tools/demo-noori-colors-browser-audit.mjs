import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { demoFixtures } from "../web/preview/fixture-catalog.mjs";
import { closeOwnedBrowser } from "./browser/session-close.mjs";
import { clickBrowserTarget } from "./browser/click-target.mjs";
const origin = process.argv[2] ?? "http://127.0.0.1:49002";
const output = resolve(
  "zig-out/verification/demo-noori-colors",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
await mkdir(output, { recursive: true });
const session = execFileSync(
  "agent-browser",
  ["session", "id", "--scope", "worktree", "--prefix", "hwpjs-noori-colors"],
  { encoding: "utf8" },
).trim();
const command = (...args) => {
  const r = JSON.parse(
    execFileSync("agent-browser", ["--session", session, "--json", ...args], {
      encoding: "utf8",
      timeout: 45000,
      maxBuffer: 4 * 1024 * 1024,
    }),
  );
  assert.equal(r.success, true, JSON.stringify(r.error));
  return r.data;
};
const evaluate = (s) => command("eval", s).result;
const cases = [];
let cleanup;
assert.equal(command("session", "info").active, false);
try {
  for (const [name, color] of [
    ["noori.hwp", "#e7e7a5"],
    ["noori.hwpx", "#e7e7a5"],
  ]) {
    command("set", "viewport", "1280", "1100");
    command("open", origin + "/demo/vanilla");
    command(
      "wait",
      "--fn",
      'document.querySelector("[data-role=fixture-picker]")?.disabled===false',
    );
    evaluate(`(()=>{window.__fills=[];window.__strokes=[];const p=CanvasRenderingContext2D.prototype,f=p.fillRect,s=p.stroke,b=p.beginPath,m=p.moveTo,l=p.lineTo;
 p.fillRect=function(x,y,w,h){if(this.canvas.isConnected)window.__fills.push({color:this.fillStyle,x,y,w,h,matrix:this.getTransform().toJSON()});return f.call(this,x,y,w,h)};
 p.beginPath=function(){this.__path=[];return b.call(this)};p.moveTo=function(x,y){this.__path?.push([x,y]);return m.call(this,x,y)};p.lineTo=function(x,y){this.__path?.push([x,y]);return l.call(this,x,y)};
 p.stroke=function(){if(this.canvas.isConnected)window.__strokes.push({color:this.strokeStyle,width:this.lineWidth,path:this.__path,matrix:this.getTransform().toJSON()});return s.call(this)};return true})()`);
    const fixture = demoFixtures.find((f) => f.name === name);
    assert(fixture);
    command("select", "[data-role=fixture-picker]", fixture.id);
    clickBrowserTarget({ command, evaluate }, ".hwp-demo-picker > button");
    command(
      "wait",
      "--fn",
      `window.__fills.some(f=>f.color==='#f2f2f2')&&window.__strokes.some(s=>Math.abs(s.width-${(0.12 * 96) / 25.4})<0.001)`,
    );
    const result =
      evaluate(`(()=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d'),fills=window.__fills;
 const gray=fills.filter(f=>f.color==='#f2f2f2').at(-1),header=fills.filter(f=>f.color==='${color}').at(-1);
 const pixel=(f,x,y)=>{const m=f.matrix,px=Math.round(m.a*x+m.c*y+m.e),py=Math.round(m.b*x+m.d*y+m.f);return {x:px,y:py,rgba:[...ctx.getImageData(px,py,1,1).data]}};
 const grayPixel=pixel(gray,gray.x+3,gray.y+gray.h/2),headerPixel=header?pixel(header,header.x+3,header.y+3):null;
 const strokes=window.__strokes.filter(s=>s.color==='#000000'&&Math.abs(s.width-${(0.12 * 96) / 25.4})<.001&&s.path?.length===2&&Math.abs(s.path[0][0]-gray.x)<1&&s.path[0][1]===s.path[1][1]&&Math.abs(s.path[1][0]-s.path[0][0]-gray.w)<1);
 const ys=[...new Set(strokes.map(s=>s.path[0][1]))].sort((a,b)=>a-b);
 const topPixels=ys.slice(0,2).map(y=>pixel(gray,gray.x+8,y));return {gray,header,grayPixel,headerPixel,ys,topPixels,canvas:{width:c.width,height:c.height}}})()`);
    cases.push({ name, expectedHeader: color, ...result });
    command("screenshot", join(output, name + ".png"));
    assert(result.header, `HancomHeaderColorMismatch:${name}:expected=${color}`);
    assert.deepEqual(result.grayPixel.rgba, [242, 242, 242, 255]);
    const rgb = color
      .slice(1)
      .match(/../g)
      .map((h) => parseInt(h, 16));
    assert.deepEqual(result.headerPixel.rgba, [...rgb, 255]);
    assert.equal(result.ys.length, 4, "TwoStrokesPerHorizontalEdge");
    assert(Math.abs(result.ys[1] - result.ys[0] - (0.37 * 96) / 25.4) < 0.001);
    assert(
      result.topPixels.every((p) => p.rgba[0] < 220 && p.rgba[1] < 220 && p.rgba[2] < 220),
      "ActualBorderPixelsMustDarkenFill",
    );
  }
} finally {
  await closeOwnedBrowser(command);
  cleanup = { inactive: command("session", "info").active === false };
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(
      {
        origin,
        cases,
        cleanup,
        scope:
          "actual picker, shared yellow header expected from HWP reference and user-observed Hangul parity; current HWPX mismatch must fail; narrow double-border profile, not full rendering equivalence",
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ output, cases: cases.length, cleanup }));
