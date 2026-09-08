import assert from 'node:assert/strict';
import {cmp} from './icc-power-reference.mjs';
import {readWide,writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {linearPreimageReference} from './icc-linear-preimage-reference.mjs';
export function extendedLinearInput(line,y){
  const out=Buffer.alloc(172);[...line.start,...line.end].forEach((v,i)=>out.writeBigUInt64BE(v,i*8));out.writeUInt32BE(line.flags,32);out.writeInt32BE(line.a,36);out.writeInt32BE(line.b,40);writeUnsigned(out,44,y[0],64);writeUnsigned(out,108,y[1],64);return out;
}
export function extendedLinearPreimageEdges(call){
  let comparisons=0,empty=0,rejected=0;
  function check(line,y){
    const input=extendedLinearInput(line,y);let expected;
    try{expected=linearPreimageReference(line,y);}catch(e){assert.throws(()=>call(226,input),new RegExp(e.message));rejected++;return;}
    const out=call(226,input);assert.equal(out.length,520);
    if(!expected){assert.deepEqual(out,Buffer.alloc(520));empty++;return;}
    assert.equal(out.readUInt32LE(),1);assert.equal(out.readUInt32LE(4),expected.flags);
    const start=[readWide(out,8,128),readWide(out,136,128)],end=[readWide(out,264,128),readWide(out,392,128)];
    for(const point of [start,end])assert.ok(point[1]>0n&&point[0]<=point[1]);assert.equal(cmp(start,expected.start),0);assert.equal(cmp(end,expected.end),0);comparisons++;
  }
  const max=(1n<<512n)-1n,intervals=[[[0n,1n],[1n,1n]],[[1n,3n],[2n,3n]],[[1n,2n],[1n,2n]]];
  for(const a of [-2147483648,-131072,-65536,0,65537,131072,2147483647])for(const b of [-2147483648,-65536,0,32768,65536,2147483647])for(const [start,end] of intervals)for(let flags=0;flags<4;flags++)for(const y of [[0n,max],[max,max],[1n,2n],[1n,3n],[1n,max],[max/2n,max],[max-1n,max]])check({a,b,start,end,flags},y);
  const line={a:65537,b:1,start:[0n,1n],end:[1n,1n],flags:3};
  let seed=0x4c494e45;const wide=()=>{let n=0n;for(let j=0;j<16;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;n=(n<<32n)|BigInt(seed);}return n;};
  for(let i=0;i<128;i++){const d=wide()||1n;check({...line,a:i%2?65537:-65537,b:i%2?1:65536},[wide()%(d+1n),d]);}
  for(const y of [[0n,0n],[2n,1n]])check(line,y);
  for(const bad of [{...line,start:[0n,0n]},{...line,start:[2n,1n]},{...line,start:[1n,1n],end:[0n,1n]}])check(bad,[1n,2n]);
  const good=extendedLinearInput(line,[max/2n,max]);
  for(let n=0;n<good.length;n++){assert.throws(()=>call(226,good.subarray(0,n)),/InvalidProbeInput/);rejected++;}
  assert.throws(()=>call(226,good,171),/LimitExceeded/);rejected++;
  assert.throws(()=>call(226,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
  const bad=Buffer.from(good);bad.writeUInt32BE(4,32);assert.throws(()=>call(226,bad),/InvalidProbeInput/);rejected++;
  check(line,[max/2n,max]);return {comparisons,empty,rejected};
}
