import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import { sectionXml } from "./fixture-xml.mjs";
import { documentRecords } from "./documents.mjs";
import { rectangleActual } from "./shape-rectangle.mjs";
export function rectanglePair(call,cfb){
  const base=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  const hwp=new URL('shapecontainer-2.hwp',base),hwpx=new URL('shapecontainer-2.hwpx',base);
  if(!existsSync(hwp)||!existsSync(hwpx))return {skipped:true};
  cfb.parse(readFileSync(hwp),{strict:true});
  const h=Buffer.from(cfb.findExact('/FileHeader').content);
  const bytes=call(3,Buffer.concat([h,Buffer.from(cfb.findExact('/BodyText/Section0').content)]));
  const rects=documentRecords(bytes).filter(r=>r.tag===79);
  const xml=sectionXml(readFileSync(hwpx));
  const elements=[...xml.matchAll(/<hp:rect\b[^>]*>[\s\S]*?<\/hp:rect>/g)].map(m=>m[0]);
  assert.equal(rects.length,3);assert.equal(elements.length,3);
  let axesMismatch=0;
  for(let i=0;i<3;i++){
    const b=bytes.subarray(rects[i].start,rects[i].end);
    const observed=rectangleActual(call,b,1),specified=rectangleActual(call,b,0);
    const points=Array(4),matches=[...elements[i].matchAll(/<hc:pt([0-3])\b([^>]*)\/>/g)];
    assert.equal(matches.length,4);
    for(const m of matches){const index=Number(m[1]);assert.equal(points[index],undefined);points[index]=['x','y'].map(key=>Number(m[2].match(new RegExp(`\\b${key}="(-?\\d+)"`))[1]));}
    const round=Number(elements[i].match(/\bratio="(\d+)"/)[1]);
    assert.equal(observed.round,round);assert.deepEqual(observed.points,points);
    if(JSON.stringify(specified.points)!==JSON.stringify(points))axesMismatch++;
  }
  assert.equal(axesMismatch,3);
  return {rectangles:3,axesMismatch};
}
