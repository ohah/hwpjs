import assert from "node:assert/strict";

/** Probe physical footer coordinates with real pointer events, never set selection. */
export function clickBlankFooter(driver, target) {
  const { command, evaluate } = driver;
  command("scrollintoview", "#viewport");
  const band =
    evaluate(`(async()=>{const {pageSequenceReference}=await import('/web/preview/page-sequence-reference.mjs');
    const {hwpUnitPixels}=await import('/web/preview/hwp-units.mjs');
    const count=Number(document.querySelector('#page-layout-status').textContent.match(/측정 배치 (\\d+)페이지/)?.[1]);
    const content=window.__areaContent,setting=content.pageSettings[0],page=pageSequenceReference(setting,count-1);
    if(page.state!=='placed')return null;
    return {x:page.boxes.page.x+page.boxes.page.width/2,y:page.boxes.page.y+page.boxes.page.height,height:hwpUnitPixels(setting.margin.bottom)};
  })()`);
  assert.ok(band && band.height > 0);
  const expected = `${target.section}:${target.paragraph}:`;
  for (let offset = 4; offset < Math.min(band.height, 80); offset += 4) {
    const point =
      evaluate(`new Promise(resolve=>{const viewport=document.querySelector('#viewport');viewport.scrollTop=${band.y + offset}-viewport.clientHeight/2;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=document.querySelector('#canvas').getBoundingClientRect(),x=Math.round(r.left+${band.x}-viewport.scrollLeft),y=Math.round(r.top+${band.y + offset}-viewport.scrollTop);
      resolve({x,y,canvas:document.elementFromPoint(x,y)===document.querySelector('#canvas')});}));})`);
    if (!point.canvas) continue;
    evaluate(
      "window.__blankFooterPointer=false;document.querySelector('#canvas').addEventListener('pointerdown',e=>window.__blankFooterPointer=e.isTrusted&&e.target===document.querySelector('#canvas'),{once:true})",
    );
    command("mouse", "move", String(point.x), String(point.y));
    command("mouse", "down");
    command("mouse", "up");
    if (evaluate('document.querySelector("#canvas").dataset.caret').startsWith(expected)) {
      assert.equal(evaluate("window.__blankFooterPointer"), true);
      const top = evaluate('parseFloat(document.querySelector("#canvas-input").style.top)');
      assert.ok(
        Number.isFinite(top) && top >= band.y - 1 && top <= band.y + band.height + 40,
        "FooterCaretMustRemainOnClickedPage",
      );
      return;
    }
  }
  throw Error("BlankFooterPointerTargetNotReached");
}
