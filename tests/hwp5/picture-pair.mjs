import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import { sectionXml,masterPageXml } from "./fixture-xml.mjs";
import { documentRecords } from "./documents.mjs";
import { pictureActual,pictureRun } from "./shape-picture.mjs";
import { tailActual } from "./picture-additional.mjs";
export function picturePair(call,cfb){
  const root=new URL('../../reference/rhwp/samples/',import.meta.url);
  const cases=[['복학원서',0,1],['2025 행정업무운영 편람(최종)',0,2],['2025 행정업무운영 편람(최종)',3,2],['투명도0-50',0,2],['투명도0-50-2nd그림글차처럼off',0,2]];
  const files=[];let pictures=0,nonzeroAdjustments=0,axesMismatch=0,nonzeroAlpha=0,absentAlpha=0;
  const attr=(s,key)=>{const m=s.match(new RegExp(`\\b${key}="([^"]*)"`));assert.ok(m,key);return m[1];};
  for(const [name,section,tailMode] of cases){
    const hwp=new URL(name+'.hwp',root),hwpx=new URL(name+'.hwpx',root);
    if(!existsSync(hwp)||!existsSync(hwpx)){files.push({name,section,skipped:true});continue;}
    cfb.parse(readFileSync(hwp),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content);
    const b=call(3,Buffer.concat([h,Buffer.from(cfb.findExact(`/BodyText/Section${section}`).content)]));
    const records=documentRecords(b).filter(r=>r.tag===85);
    const zip=readFileSync(hwpx),sectionText=sectionXml(zip,section);
    let masterText='';
    if(name==='2025 행정업무운영 편람(최종)'&&section===3){
      assert.deepEqual([...sectionText.matchAll(/<hp:masterPage\b[^>]*>/g)].map(m=>attr(m[0],'idRef')),['masterpage3']);
      masterText=masterPageXml(zip,3);
      assert.equal((masterText.match(/<hp:pic\b/g)||[]).length,1);
    }
    const elements=[...(masterText+sectionText).matchAll(/<hp:pic\b[\s\S]*?<\/hp:pic>/g)].map(m=>m[0]);
    assert.ok(records.length>0);assert.equal(records.length,elements.length);
    for(let i=0;i<records.length;i++){
      const r=records[i],p=b.subarray(r.start,r.end),xml=elements[i],observed=pictureActual(call,p,1,2,false);
      const out=pictureRun(call,p,1,2),img=xml.match(/<hc:img\b[^>]*>/)[0];
      assert.equal(observed.contrast,Number(attr(img,'contrast')));assert.equal(observed.brightness,Number(attr(img,'bright')));
      assert.equal(['REAL_PIC','GRAY_SCALE','BLACK_WHITE','PATTERN8x8'][observed.effect],attr(img,'effect'));
      // These paired fixtures use imageN for the corresponding BinData ID; no product ID inference.
      assert.equal('image'+observed.id,attr(img,'binaryItemIDRef'));
      if(observed.contrast||observed.brightness)nonzeroAdjustments++;
      const rect=xml.match(/<hp:imgRect>[\s\S]*?<\/hp:imgRect>/)[0],points=Array(4);
      const matches=[...rect.matchAll(/<hc:pt([0-3])\b([^>]*)\/>/g)];assert.equal(matches.length,4);
      for(const m of matches){assert.equal(points[Number(m[1])],undefined);points[Number(m[1])]=['x','y'].map(k=>Number(attr(m[2],k)));}
      assert.deepEqual(observed.points,points);
      if(JSON.stringify(pictureActual(call,p,0,2,false).points)!==JSON.stringify(points))axesMismatch++;
      const crop=xml.match(/<hp:imgClip\b[^>]*>/)[0],margin=xml.match(/<hp:inMargin\b[^>]*>/)[0];
      ['left','top','right','bottom'].forEach((key,j)=>assert.equal(out.readInt32LE(44+j*4),Number(attr(crop,key))));
      ['left','right','top','bottom'].forEach((key,j)=>assert.equal(out.readInt16LE(60+j*2),Number(attr(margin,key))));
      const additional=tailActual(call,p.subarray(78),tailMode,false),dim=xml.match(/<hp:imgDim\b[^>]*>/)[0];
      assert.equal(additional.width,Number(attr(dim,'dimwidth')));assert.equal(additional.height,Number(attr(dim,'dimheight')));
      if(tailMode===1){assert.equal(additional.alpha,null);assert.equal(Number(attr(img,'alpha')),0);absentAlpha++;}
      else assert.equal(additional.alpha,Number(attr(img,'alpha')));
      if(additional.alpha)nonzeroAlpha++;
      pictures++;
    }
    files.push({name,section,pictures:records.length,masterPagePictures:masterText?1:0});
  }
  if(files.every(f=>!f.skipped)){assert.equal(nonzeroAdjustments,3);assert.equal(axesMismatch,pictures);assert.equal(nonzeroAlpha,2);assert.equal(absentAlpha,2);}
  for(const index of [-1,1.5,NaN,65536])assert.throws(()=>masterPageXml(Buffer.alloc(0),index));
  return {files,pictures,nonzeroAdjustments,axesMismatch,nonzeroAlpha,absentAlpha};
}
