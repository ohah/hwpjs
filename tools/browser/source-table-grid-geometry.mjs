// Shared painted-rule detector extracted verbatim from the original SOURCE audit.
// DOM/pixel reads only; selection remains owned by trusted mouse events in the caller.
export function paintedSourceCellGeometryExpression(columns, { maxRowCssHeight = 120 } = {}) {
  if (!Number.isSafeInteger(columns) || columns < 1) throw Error('InvalidGridColumns');
  if (maxRowCssHeight !== null && (!Number.isFinite(maxRowCssHeight) || maxRowCssHeight <= 0))
    throw Error('InvalidRowHeightLimit');
  // null accepts only a fully painted row whose bottom rule exists in this canvas.
  return `(()=>{
    const c=document.querySelector('canvas'),rect=c.getBoundingClientRect().toJSON();
    const w=c.width,h=c.height,p=c.getContext('2d').getImageData(0,0,w,h).data;
    const dark=(x,y)=>{const at=(y*w+x)*4,r=p[at],g=p[at+1],b=p[at+2];return p[at+3]>240&&Math.max(r,g,b)<220&&Math.max(r,g,b)-Math.min(r,g,b)<45;};
    const horizontal=[];
    for(let y=0;y<h;y++){
      let start=-1;
      for(let x=0;x<=w;x++){
        if(x<w&&dark(x,y)){if(start<0)start=x;}
        else if(start>=0){if(x-start>150&&x-start<w*.95)horizontal.push({y,left:start,right:x-1});start=-1;}
      }
    }
    const candidates=[];
    for(const top of horizontal){
      const bottom=horizontal.find(b=>b.y>top.y+8&&b.y<top.y+${maxRowCssHeight === null ? 'h' : `${maxRowCssHeight}*(h/rect.height)`}&&Math.abs(b.left-top.left)<3&&Math.abs(b.right-top.right)<3);
      if(!bottom)continue;
      const bands=[];
      for(let x=top.left;x<=top.right;x++){
        let count=0;for(let y=top.y+2;y<bottom.y-1;y++)if(dark(x,y))count++;
        if(count>=Math.max(1,(bottom.y-top.y-3)*.85)){
          if(bands.length&&x===bands.at(-1).end+1)bands.at(-1).end=x;else bands.push({start:x,end:x});
        }
      }
      if(bands.length===${columns + 1})candidates.push({top,bottom,bands});
    }
    const first=candidates.sort((a,b)=>a.top.y-b.top.y)[0];
    return {rect,width:w,height:h,first:first??null,candidateCount:candidates.length};
  })()`;
}
