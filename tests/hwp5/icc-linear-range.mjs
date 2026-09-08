import assert from 'node:assert/strict';
import {cmp} from './icc-power-reference.mjs';
import {fraction as F} from './icc-matrix-reference.mjs';
import {validateInterval} from './icc-linear-preimage-reference.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
import {reference as nearestReference,nearestRangeInput} from './icc-nearest-range.mjs';
export function linearRangeInput(line){const out=Buffer.alloc(44);[...line.start,...line.end].forEach((v,i)=>out.writeBigUInt64BE(v,8*i));out.writeUInt32BE(line.flags,32);out.writeInt32BE(line.a,36);out.writeInt32BE(line.b,40);return out;}
function reference(line){validateInterval(line);const Z=[0n,1n],O=[1n,1n],raw=x=>F(BigInt(line.a)*x[0]+BigInt(line.b)*x[1],65536n*x[1]);let lo=raw(line.start),hi=raw(line.end),lc=!!(line.flags&1),hc=!!(line.flags&2);if(cmp(lo,hi)>0){[lo,hi]=[hi,lo];[lc,hc]=[hc,lc];}const clamp=x=>cmp(x,Z)<0?Z:cmp(x,O)>0?O:x,start=clamp(lo),end=clamp(hi);const flags=cmp(start,end)===0?3:Number(lc||cmp(lo,Z)<0)+2*Number(hc||cmp(hi,O)>0);return {start,end,flags};}
export function linearRangeEdges(call){let ranges=0,nearestChecks=0,rejected=0;
 function check(line){let expected;try{expected=reference(line);}catch(e){assert.throws(()=>call(204,linearRangeInput(line)),new RegExp(e.message));rejected++;return;}
  const out=call(204,linearRangeInput(line));assert.equal(out.length,136);assert.equal(out.readUInt32LE(),1);const result={start:[readWide(out,8),readWide(out,40)],end:[readWide(out,72),readWide(out,104)],flags:out.readUInt32LE(4)};validateInterval(result);assert.equal(cmp(result.start,expected.start),0);assert.equal(cmp(result.end,expected.end),0);assert.equal(result.flags,expected.flags);ranges++;
  for(const target of [[0n,1n],[1n,1n],[1n,2n],[3n,5n]]){const wanted=nearestReference(target,[expected]),got=call(203,nearestRangeInput(target,[result]));assert.equal(got.readUInt32LE(),wanted.status);assert.equal(got.readUInt32LE(4),wanted.values.length);assert.equal(got.length,8+64*wanted.values.length);for(let i=0;i<wanted.values.length;i++)assert.equal(cmp([readWide(got,8+64*i),readWide(got,40+64*i)],wanted.values[i]),0);nearestChecks++;}
 }
 const intervals=[[[0n,1n],[1n,1n]],[[0n,1n],[1n,2n]],[[1n,2n],[1n,1n]],[[1n,3n],[2n,3n]],[[1n,2n],[1n,2n]],[[1n,1n],[1n,1n]]];
 for(const a of [-2147483648,-131072,-65536,0,65536,131072,2147483647])for(const b of [-2147483648,-65536,0,32768,65536,131072,2147483647])for(const [start,end]of intervals)for(let flags=0;flags<4;flags++)check({a,b,start,end,flags});
 const max=(1n<<64n)-1n;for(let flags=0;flags<4;flags++)for(const a of [-32768,0,32768])check({a,b:32768,start:[max-2n,max],end:[max-1n,max],flags});
 const line={a:65536,b:0,start:[0n,1n],end:[1n,1n],flags:3};
 for(const bad of [{...line,start:[0n,0n]},{...line,end:[0n,0n]},{...line,start:[2n,1n]},{...line,start:[1n,1n],end:[0n,1n]}])check(bad);
 const good=linearRangeInput(line);for(let len=0;len<good.length;len++){assert.throws(()=>call(204,good.subarray(0,len)),/InvalidProbeInput/);rejected++;}
 for(const [b,l]of [[good,43],[Buffer.concat([good,Buffer.alloc(1)]),undefined]]){assert.throws(()=>call(204,b,l),/InvalidProbeInput|LimitExceeded/);rejected++;}
 const flags=Buffer.from(good);flags.writeUInt32BE(4,32);assert.throws(()=>call(204,flags),/InvalidProbeInput/);rejected++;check(line);
 return {ranges,nearestChecks,rejected};
}
