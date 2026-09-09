import assert from 'node:assert/strict';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
import {jpegScanGeometry} from './jpeg-scan.mjs';
import {progressiveBlockInput,progressiveBlockOracle,progressiveZero} from './jpeg-progressive-block.mjs';

// Test-only scheduling of blocks from real files. This is not a product frame
// decoder. The product block primitive is checked against independent expected
// coefficients and positions; later inputs always use the oracle's results.
export function jpegProgressiveBlocksFileActual(call,raw,verify=null,scanCheck=null) {
  let at=0,frame=null,interval=0,scans=0,blocks=0,restarts=0;
  let ended=false;
  assert.deepEqual(raw.subarray(0,2),Buffer.from([255,216]));
  const kinds={dcFirst:0,dcRefine:0,acFirst:0,acRefine:0};
  const tables=new Map(),coefficients=new Map(),levels=[],quantization=[];
  while(at<raw.length) {
    const marker=jpegMarkerOracle(raw.subarray(at)),p=marker.wire.subarray(20);at+=marker.consumed;
    if([192,193].includes(marker.code))return {deferred:true,scans:0,blocks:0};
    if(marker.code===194){assert.equal(frame,null);frame=p;assert.ok(frame.readUInt16BE(1)>0,'test walker requires declared height');for(let i=0;i<frame[5];i++)levels.push(Array(64).fill(-1));}
    if(marker.code===196)for(let pos=0;pos<p.length;){const size=17+p.subarray(pos+1,pos+17).reduce((a,b)=>a+b,0);assert.ok(pos+size<=p.length);tables.set(p[pos],p.subarray(pos,pos+size));pos+=size;}
    if(marker.code===219)quantization.push(p);
    if(marker.code===221)interval=p.readUInt16BE();
    if(marker.code===218) {
      assert.ok(frame);scans++;
      const scan=p,n=scan[0],start=scan[1+2*n],end=scan[2+2*n],ah=scan[3+2*n]>>4,al=scan[3+2*n]&15;
      kinds[start===0?(ah===0?'dcFirst':'dcRefine'):(ah===0?'acFirst':'acRefine')]++;
      const g=jpegScanGeometry(frame,scan,frame.readUInt16BE(1));assert.ok(g.columns*g.rows*g.perMcu<=4000000);
      for(const c of g.components){if(start>0)assert.ok(levels[c.index][0]>=0);for(let k=start;k<=end;k++){assert.equal(levels[c.index][k],ah===0?-1:ah);levels[c.index][k]=al;}}
      let mcu=0,rst=0;const scanStart=at,scanPrior=[];
      while(mcu<g.columns*g.rows) {
        const segment=jpegEntropyOracle(raw.subarray(at)),entropy=raw.subarray(at,at+segment.consumed);at+=segment.consumed;
        const stop=Math.min(g.columns*g.rows,mcu+(interval||g.columns*g.rows)),entries=[];
        for(;mcu<stop;mcu++)for(const c of g.components)for(let y=0;y<(g.single?1:c.v);y++)for(let x=0;x<(g.single?1:c.h);x++) {
          const mx=mcu%g.columns,my=Math.floor(mcu/g.columns),bx=g.single?mx:mx*c.h+x,by=g.single?my:my*c.v+y;
          entries.push({c,key:`${c.index}:${bx},${by}`});
        }
        let index=0,rawAt=0,skip=0;const predictors=new Map();
        while(index<entries.length) {
          const first=index,c=entries[index].c;
          // Single-component scans are one batch. Interleaved DC scans batch
          // only adjacent blocks of the same component, retaining predictors.
          while(index<entries.length&&entries[index].c.index===c.index)index++;
          const batch=entries.slice(first,index),initial=batch.map(e=>coefficients.get(e.key)??progressiveZero());
          if(scanCheck)for(const b of initial)scanPrior.push(b);
          const table=start===0&&ah!==0?null:tables.get(start===0?c.tables>>4:16+(c.tables&15));
          assert.ok(table!==undefined);
          const options={frame,scan,start,end,ah,al,table,blocks:initial,predictor:predictors.get(c.index)??0,skip,finish:index===entries.length};
          const input=entropy.subarray(rawAt),expected=progressiveBlockOracle(input,options);
          assert.deepEqual(call(279,progressiveBlockInput(input,options)),expected);
          assert.equal(expected.readUInt32LE(12),0); // EOB cannot cross interval.
          predictors.set(c.index,expected.readInt32LE(8));
          batch.forEach((e,i)=>coefficients.set(e.key,Array.from({length:64},(_,k)=>expected.readInt32LE(20+i*256+k*4))));
          blocks+=batch.length;
          rawAt+=expected.readUInt32LE(0);const remaining=expected.readUInt32LE(4);
          if(remaining){rawAt-=entropy[rawAt-1]===0&&entropy[rawAt-2]===255?2:1;skip=8-remaining;}else skip=0;
        }
        assert.equal(rawAt,entropy.length);assert.equal(skip,0);
        if(mcu<g.columns*g.rows){const marker=jpegMarkerOracle(raw.subarray(at));assert.equal(marker.code,208+rst%8);at+=marker.consumed;rst++;restarts++;}
      }
      const terminal=jpegMarkerOracle(raw.subarray(at));assert.ok(terminal.code<208||terminal.code>215);
      if(scanCheck)scanCheck(raw.subarray(scanStart,at+terminal.consumed),{frame,scan,q:Buffer.concat(quantization),h:Buffer.concat([...tables.values()]),interval,prior:scanPrior});
    }
    if(marker.code===217){assert.equal(at,raw.length);ended=true;break;}
  }
  assert.ok(frame&&scans&&ended);
  const verifiedBlocks=verify?verify(frame,coefficients):0;
  return {deferred:false,scans,blocks,restarts,storedBlocks:coefficients.size,kinds,unseen:levels.flat().filter(n=>n===-1).length,partial:levels.flat().filter(n=>n>0).length,verifiedBlocks};
}
