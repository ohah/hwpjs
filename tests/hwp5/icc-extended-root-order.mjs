import assert from 'node:assert/strict';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';

function input(a,b,slope=1){
  const out=Buffer.alloc(540);
  for(const [offset,r] of [[0,a],[268,b]]){
    out.writeInt32BE(r.s,offset);
    if(r.s===0)continue;
    writeUnsigned(out,offset+4,r.n,128);writeUnsigned(out,offset+132,r.d,128);
    out.writeInt32BE(r.p,offset+260);out.writeUInt32BE(r.q,offset+264);
  }
  out.writeInt32BE(slope,536);return out;
}
const sign=x=>x<0n?-1:x>0n?1:0;
function expected(a,b,slope){
  let order;
  if(a.s!==b.s)order=Math.sign(a.s-b.s);
  else if(a.s===0)order=0;
  else order=sign(a.n*b.d-b.n*a.d)*a.s*Math.sign(a.p);
  return order===0?0:order*Math.sign(slope);
}
export function extendedRootOrderEdges(call){
  let comparisons=0,rejected=0;
  const root=(n,d,s=1,p=65536,q=131072)=>({n,d,s,p,q});
  const max=(1n<<1024n)-1n,h=1n<<1023n;
  const pairs=[[h,h+1n,h-1n,h],[max,max-1n,max-1n,max],[1n,3n,2n,6n],[1n,max,2n,max],[max,1n,max-1n,1n]];
  let state=0x12345678n;
  const random=()=>{let value=0n;for(let i=0;i<32;i++){state=(1664525n*state+1013904223n)&0xffffffffn;value=(value<<32n)|state;}return value||1n;};
  for(let i=0;i<64;i++)pairs.push([random(),random(),random(),random()]);
  function check(a,b,slope){
    const out=call(229,input(a,b,slope));assert.equal(out.length,4);
    assert.equal(out.readInt32LE(),expected(a,b,slope));comparisons++;
  }
  for(const [n,d,m,e] of pairs)for(const p of [-65536,65536])for(const q of [1,131072,2147483648])for(const s of [-1,1])for(const t of [-1,1])for(const slope of [-2147483648,-1,1,2147483647])check(root(n,d,s,p,q),root(m,e,t,p,q),slope);
  const zero={s:0},one=root(1n,1n);
  for(const slope of [-1,1]){check(zero,zero,slope);for(const s of [-1,1]){check(zero,root(max,1n,s),slope);check(root(1n,max,s),zero,slope);}}
  const good=input(one,one);
  const reject=(bytes,pattern,limit)=>{assert.throws(()=>call(229,bytes,limit),pattern);rejected++;};
  for(let len=0;len<good.length;len++)reject(good.subarray(0,len),/InvalidProbeInput/);
  reject(Buffer.concat([good,Buffer.alloc(1)]),/InvalidProbeInput/);
  reject(good,/LimitExceeded/,539);
  reject(input(one,one,0),/NonIsolatedIccAffineRoot/);
  for(const bad of [root(0n,1n),root(1n,0n),root(1n,1n,1,1),root(1n,1n,1,65536,0),root(1n,1n,1,65536,2147483649)]){
    reject(input(bad,zero),/InvalidIccPowerRoot/);reject(input(zero,bad),/InvalidIccPowerRoot/);
  }
  for(const bad of [root(1n,1n,-1,-65536),root(1n,1n,-1,65536,1)])reject(input(one,bad),/IncompatibleIccPowerRoots/);
  const dirty=input(zero,one);dirty[4]=1;reject(dirty,/InvalidProbeInput/);
  const badSign=Buffer.from(good);badSign.writeInt32BE(2);reject(badSign,/InvalidProbeInput/);
  check(one,one,1);
  return {comparisons,rejected};
}
