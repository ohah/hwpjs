import assert from 'node:assert/strict';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
const sign=n=>n<0n?-1:n>0n?1:0;
const abs=n=>n<0n?-n:n;
function gcd(a,b){while(b)[a,b]=[b,a%b];return a;}
function input(s,a,b,p,q,n,d,precision=512){
  const out=Buffer.alloc(144);out.writeUInt32BE(precision);out.writeInt32BE(s,4);
  writeUnsigned(out,8,a);writeUnsigned(out,40,b);out.writeInt32BE(p,72);out.writeUInt32BE(q,76);
  writeUnsigned(out,80,BigInt.asUintN(256,n));writeUnsigned(out,112,d);return out;
}
// Independent exact BigInt expansion, not perfect-root search or interval bounds.
export function expected(s,a,b,p,q,n,d){
  if(s===0)return -sign(n)||0;
  if(s!==sign(n))return s;
  if(p<0)[a,b]=[b,a];
  const common=gcd(65536n,BigInt(q)),P=65536n/common,Q=BigInt(q)/common;
  return sign(a**P*d**Q-b**P*abs(n)**Q)*s||0;
}
export function normalizedRootCompareEdges(call){
  let comparisons=0,rejected=0,undecided=0;
  function check(s,a,b,p,q,n,d,precision=512){
    const out=call(196,input(s,a,b,p,q,n,d,precision));assert.equal(out.length,4);
    assert.equal(out.readInt32LE(),expected(s,a,b,p,q,n,d));comparisons++;
  }
  const max=(1n<<256n)-1n,half=(1n<<255n)-1n,A=(1n<<128n)-1n,B=A-2n;
  const ratios=[[1n,1n],[1n,3n],[9n,49n],[A*A,B*B],[max,1n],[1n,max],[max-1n,max],[9n<<200n,49n<<200n]];
  const coords=[[0n,1n],[1n,1n],[-1n,1n],[A,B],[-A,B],[half,max],[-half-1n,1n],[1n,max]];
  for(const [a,b] of ratios)for(const q of [16384,32768,65536,98304,131072,196608])for(const p of [-65536,65536])for(const s of [-1,1])for(const [n,d] of coords)check(s,a,b,p,q,n,d);
  let seed=0x374befn;
  const random=()=>seed=(seed*0xda942042e4dd58b5n+0x14057b7ef767814fn)&max;
  for(let i=0;i<256;i++)check(i%2?1:-1,random()|1n,random()|1n,i%3?-65536:65536,[32768,65536,131072,196608][i%4],BigInt.asIntN(256,random()),random()|1n);
  for(const precision of [128,256,512,1024]){
    check(1,A*A,B*B,65536,131072,A,B,precision);
    check(-1,1n,1n,65536,65536,-half-1n,1n<<255n,precision);
    check(0,0n,0n,0,0,0n,1n,precision);
    check(0,0n,0n,0,0,-1n,max,precision);
  }
  const n=161733217200188571081311986634082331709n,d=228725309250740208744750893347264645481n;
  assert.equal(call(196,input(1,1n,2n,65536,131072,n,d,128)).readInt32LE(),2);undecided++;
  check(1,1n,2n,65536,131072,n,d,512);
  const good=input(1,9n,49n,65536,131072,3n,7n);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(196,good.subarray(0,len)),/InvalidProbeInput/);rejected++;}
  assert.throws(()=>call(196,good,143),/LimitExceeded/);rejected++;
  assert.throws(()=>call(196,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
  for(const [offset,value] of [[0,64],[4,2],[72,1],[76,0],[76,2147483649]]){
    const bad=Buffer.from(good);bad.writeUInt32BE(value,offset);assert.throws(()=>call(196,bad),/InvalidIccComparisonPrecision|InvalidProbeInput|InvalidIccPowerRoot/);rejected++;
  }
  for(const offset of [8,40,112]){const bad=Buffer.from(good);bad.fill(0,offset,offset+32);assert.throws(()=>call(196,bad),/InvalidIccPowerRoot|InvalidIccRootCoordinate/);rejected++;}
  const badZero=Buffer.from(good);badZero.writeInt32BE(0,4);assert.throws(()=>call(196,badZero),/InvalidProbeInput/);rejected++;
  check(1,9n,49n,65536,131072,3n,7n);
  return {comparisons,rejected,undecided};
}
