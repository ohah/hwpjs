import assert from 'node:assert/strict';
import {cmp} from './icc-power-reference.mjs';
import {readWide,writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {linearPreimageReference,choiceReference} from './icc-linear-preimage-reference.mjs';
function input(line,y){const out=Buffer.alloc(76);[...line.start,...line.end].forEach((v,i)=>out.writeBigUInt64BE(v,i*8));out.writeUInt32BE(line.flags,32);out.writeInt32BE(line.a,36);out.writeInt32BE(line.b,40);writeUnsigned(out,44,y[0],16);writeUnsigned(out,60,y[1],16);return out;}
function choiceInput(interval){const out=Buffer.alloc(132);[...interval.start,...interval.end].forEach((v,i)=>writeUnsigned(out,i*32,v));out.writeUInt32BE(interval.flags,128);return out;}
export function linearPreimageEdges(call){let comparisons=0,empty=0,rejected=0,chosen=0,unattained=0;
 function select(interval){const bytes=choiceInput(interval);let expected;try{expected=choiceReference(interval);}catch(e){assert.throws(()=>call(194,bytes),new RegExp(e.message));if(e.message.startsWith('Unattained'))unattained++;else rejected++;return;}
  const out=call(194,bytes);assert.equal(out.length,64);const point=[readWide(out,0),readWide(out,32)];assert.ok(point[1]>0n&&point[0]<=point[1]);assert.equal(cmp(point,expected),0);chosen++;
 }
 function check(line,y){const bytes=input(line,y);let expected;try{expected=linearPreimageReference(line,y);}catch(e){assert.throws(()=>call(193,bytes),new RegExp(e.message));rejected++;return;}
  const out=call(193,bytes);assert.equal(out.length,136);if(!expected){assert.deepEqual(out,Buffer.alloc(136));empty++;return;}
  assert.equal(out.readUInt32LE(),1);const result={start:[readWide(out,8),readWide(out,40)],end:[readWide(out,72),readWide(out,104)],flags:out.readUInt32LE(4)};for(const point of [result.start,result.end])assert.ok(point[1]>0n&&point[0]<=point[1]);assert.equal(result.flags,expected.flags);assert.equal(cmp(result.start,expected.start),0);assert.equal(cmp(result.end,expected.end),0);comparisons++;select(result);
 }
 const max=(1n<<128n)-1n,intervals=[[[0n,1n],[1n,1n]],[[0n,1n],[1n,2n]],[[1n,2n],[1n,1n]],[[1n,3n],[2n,3n]],[[1n,2n],[1n,2n]],[[1n,1n],[1n,1n]]];
 for(const a of [-2147483648,-131072,-65536,0,65536,131072,2147483647])for(const b of [-2147483648,-65536,0,32768,65536,131072,2147483647])for(const [start,end] of intervals)for(let flags=0;flags<4;flags++)for(const y of [[0n,1n],[1n,1n],[1n,2n],[1n,3n],[1n,max],[max/2n,max],[max-1n,max],[max,max]])check({a,b,start,end,flags},y);
 const huge=(1n<<256n)-1n,points=[[0n,1n],[1n,huge],[1n,2n],[huge-1n,huge],[1n,1n],[huge,huge]];
 for(const start of points)for(const end of points)for(let flags=0;flags<4;flags++)select({start,end,flags});
 const line={a:65536,b:0,start:[0n,1n],end:[1n,1n],flags:3};
 for(const bad of [{...line,start:[0n,0n]},{...line,end:[0n,0n]},{...line,start:[2n,1n]},{...line,end:[2n,1n]}])select(bad);
 for(const y of [[0n,0n],[2n,1n]])check(line,y);
 for(const bad of [{...line,start:[0n,0n]},{...line,start:[2n,1n]},{...line,start:[1n,1n],end:[0n,1n]}])check(bad,[1n,2n]);
 for(const [mode,good] of [[193,input(line,[1n,2n])],[194,choiceInput(line)]]){
  for(let n=0;n<good.length;n++){assert.throws(()=>call(mode,good.subarray(0,n)),/InvalidProbeInput/);rejected++;}
  assert.throws(()=>call(mode,good,good.length-1),/LimitExceeded/);rejected++;assert.throws(()=>call(mode,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
  const bad=Buffer.from(good);bad.writeUInt32BE(4,mode===193?32:128);assert.throws(()=>call(mode,bad),/InvalidProbeInput/);rejected++;
 }
 check(line,[1n,max]);return {comparisons,empty,rejected,chosen,unattained};
}
