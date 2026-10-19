import assert from "node:assert/strict";

export function clickHwp5BlankCell({command,evaluate},{section,paragraph}) {
  assert(Number.isSafeInteger(section)&&section>=0&&Number.isSafeInteger(paragraph)&&paragraph>=0);
  command("scrollintoview","#viewport");
  const point=evaluate(`(async()=>{
    await document.fonts.ready;
    const {layoutHwp5PageContent}=await import('/web/preview/hwp5-page-layout.mjs');
    const {createTextStyle}=await import('/web/preview/text-style.mjs');
    const {FONT}=await import('/web/preview/layout.mjs');
    const content=window.__hwpCurrentContent,style=createTextStyle(content,FONT);
    const context=document.createElement('canvas').getContext('2d');
    const layout=layoutHwp5PageContent(content,(text,p,u,k)=>{context.font=style(p,u,k);return {width:context.measureText(text).width,height:style.textHeight(p,u,k)};});
    if(layout.state!=='paginated'||layout.limited)return {error:layout.error??'LimitedLayout'};
    const targets=layout.rows.filter(r=>r.kind==='text'&&r.section===${section}&&r.paragraph===${paragraph});
    if(targets.length!==1||targets[0].text!=='')return {error:'ExpectedOneBlankCellRow'};
    const row=targets[0],box=layout.boxes.find(b=>b.section===row.section&&b.listNode===row.listNode);
    if(!box)return {error:'MissingCellBox'};
    const localX=row.x+1,localY=row.y+Math.min(row.height,row.textHeight)/2;
    const viewport=document.querySelector('#viewport');viewport.scrollTop=Math.max(0,localY-viewport.clientHeight/2);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const rect=document.querySelector('#canvas').getBoundingClientRect();
    const x=Math.round(rect.left+localX-viewport.scrollLeft),y=Math.round(rect.top+localY-viewport.scrollTop);
    return {x,y,canvas:document.elementFromPoint(x,y)===document.querySelector('#canvas'),pages:layout.pages.length};
  })()`);
  assert(point&&!point.error,JSON.stringify(point));assert.equal(point.canvas,true,"BlankCellPointMustHitCanvas");
  evaluate("window.__blankCellPointer=null;document.querySelector('#canvas').addEventListener('pointerdown',e=>window.__blankCellPointer={trusted:e.isTrusted,canvas:e.target===document.querySelector('#canvas')},{once:true})");
  command("mouse","move",String(point.x),String(point.y));
  assert.equal(evaluate("getComputedStyle(document.querySelector('#canvas')).cursor"),"text");
  command("mouse","down");command("mouse","up");
  assert.deepEqual(evaluate("window.__blankCellPointer"),{trusted:true,canvas:true});
  assert(evaluate("document.querySelector('#canvas').dataset.caret").startsWith(`${section}:${paragraph}:`),"BlankCellPointerSelectedWrongSource");
  assert.equal(evaluate("document.querySelector('#canvas-input').value"),"");
  return point;
}
