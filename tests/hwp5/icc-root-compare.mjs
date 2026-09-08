import assert from 'node:assert/strict';
import {admissible} from './icc-power-level.mjs';
const sign = n => n < 0n ? -1 : n > 0n ? 1 : 0;
const abs = n => n < 0n ? -n : n;
function gcd(a,b) { while(b) [a,b]=[b,a%b]; return a; }
function wide(b,at,n) { n=BigInt.asUintN(128,n); b.writeBigUInt64BE(n>>64n,at); b.writeBigUInt64BE(n&((1n<<64n)-1n),at+8); }
function input(g,offset,target,index,n,d,precision=256) {
  const b=Buffer.alloc(52); b.writeUInt32BE(precision); [g,offset,target].forEach((v,i)=>b.writeInt32BE(v,4+i*4)); b.writeUInt32BE(index,16); wide(b,20,n); wide(b,36,d); return b;
}
function ordered(g,offset,target) {
  const s=admissible(g,BigInt(target)-BigInt(offset));
  return s?.includes(1)?[1,...s.filter(x=>x!==1)]:s;
}
// Exact cross-products of independently expanded BigInt powers, not enclosures.
function expected(g,offset,target,rootSign,n,d) {
  if(rootSign===0) return n===0n?0:-sign(n);
  if(rootSign!==sign(n)) return rootSign;
  let a=abs(BigInt(target)-BigInt(offset)),b=65536n;
  if(g<0) [a,b]=[b,a];
  const common=gcd(abs(BigInt(g)),65536n),p=65536n/common,q=abs(BigInt(g))/common;
  const order=sign(a**p*d**q-b**p*abs(n)**q);
  return order===0?0:rootSign*order;
}
export function rootCompareEdges(call) {
  let comparisons=0,rejected=0,undecided=0;
  function check(g,offset,target,n,d,precision=256) {
    const roots=ordered(g,offset,target);
    if(!roots||!roots.length) { assert.throws(()=>call(183,input(g,offset,target,0,n,d,precision)),/NonIsolatedIccPowerRoot|InvalidIccPowerRootIndex/); rejected++; return; }
    roots.forEach((s,i)=>{const actual=call(183,input(g,offset,target,i,n,d,precision));assert.equal(actual.length,4);assert.equal(actual.readInt32LE(),expected(g,offset,target,s,n,d));comparisons++;});
  }
  const exponents=[-262144,-196608,-131072,-98304,-65536,-32768,-16384,16384,32768,65536,98304,131072,196608,262144];
  const max=(1n<<127n)-1n, maxD=(1n<<128n)-1n;
  const coordinates=[[0n,1n],[1n,1n],[-1n,1n],[1n,3n],[-1n,3n],[2n,3n],[-2n,3n],[max,1n],[-max-1n,1n],[1n,maxD],[max,maxD],[-max-1n,maxD]];
  for(const g of exponents)for(const offset of [-2147483648,-589824,-65536,0,32768,65536,2147483647])for(const target of [0,65536])for(const [n,d] of coordinates)check(g,offset,target,n,d);
  let seed=0x9e3779b97f4a7c15n;
  const random=()=>seed=(seed*0xda942042e4dd58b5n+0x14057b7ef767814fn)&maxD;
  for(let i=0;i<1000;i++)check(exponents[i%exponents.length],Number(BigInt.asIntN(32,random())),i%2?65536:0,BigInt.asIntN(128,random()),random()|1n);
  for(const precision of [128,256,512,1024]) {
    check(-131072,-589824,0,1n,3n,precision);
    check(131072,0,147456,3n,2n,precision);
    check(1048576,0,1,1n,2n,precision);
  }
  const pell=[[66992092050551637663438906713182313772n,94741125149636933417873079920900017937n],[161733217200188571081311986634082331709n,228725309250740208744750893347264645481n]];
  for(const [n,d] of pell) {
    assert.equal(call(183,input(131072,32768,65536,0,n,d,128)).readInt32LE(),2); undecided++;
    check(131072,32768,65536,n,d,512);
  }
  // Exponents too large to expand: comparison to 1 follows the exact ordinate sign.
  for(const g of [-2147483648,-1,1,2147483647])for(const ordinate of [1,65535,65536,65537,2147483647]) {
    const out=call(183,input(g,0,ordinate,0,1n,1n));
    assert.equal(out.readInt32LE(),ordinate===65536?0:sign(BigInt(ordinate)-65536n)*Math.sign(g)); comparisons++;
  }
  for(const a of [-2147483648,-65536,0,65536,2147483647])for(const b of [-2147483648,0,2147483647])for(const [n,d] of [[0n,1n],[1n,1n],[4866752642924153522n,6882627592338442563n],[11749380235262596085n,16616132878186749607n]]) {
    const bytes=Buffer.alloc(44);input(131072,32768,65536,0,0n,1n).copy(bytes,0,0,20);bytes.writeInt32BE(a,20);bytes.writeInt32BE(b,24);bytes.writeBigUInt64BE(n,28);bytes.writeBigUInt64BE(d,36);
    assert.equal(call(184,bytes).readInt32LE(),expected(131072,32768,65536,1,BigInt(a)*n+BigInt(b)*d,65536n*d));comparisons++;
  }
  const good=input(131072,0,65536,0,1n,1n);
  for(let length=0;length<52;length++) { assert.throws(()=>call(183,good.subarray(0,length)),/InvalidProbeInput/);rejected++; }
  assert.throws(()=>call(183,good,51),/LimitExceeded/);rejected++;
  assert.throws(()=>call(183,input(131072,0,65536,0,1n,0n)),/InvalidIccRootCoordinate/);rejected++;
  assert.throws(()=>call(183,input(131072,0,65536,0,1n,1n,129)),/InvalidIccComparisonPrecision/);rejected++;
  assert.throws(()=>call(183,input(131072,0,65536,2,1n,1n)),/InvalidIccPowerRootIndex/);rejected++;
  assert.throws(()=>call(183,input(0,0,65536,0,1n,1n)),/NonIsolatedIccPowerRoot/);rejected++;
  assert.throws(()=>call(183,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
  const affine=Buffer.alloc(44);good.copy(affine,0,0,20);affine.writeInt32BE(65536,20);affine.writeBigUInt64BE(1n,28);affine.writeBigUInt64BE(1n,36);
  for(let length=0;length<44;length++) { assert.throws(()=>call(184,affine.subarray(0,length)),/InvalidProbeInput/);rejected++; }
  assert.throws(()=>call(184,Buffer.concat([affine,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
  assert.throws(()=>call(184,affine,43),/LimitExceeded/);rejected++;
  affine.writeBigUInt64BE(0n,36);assert.throws(()=>call(184,affine),/InvalidIccCurveCoordinate/);rejected++;
  affine.writeBigUInt64BE(1n,36);affine.writeBigUInt64BE(2n,28);assert.throws(()=>call(184,affine),/InvalidIccCurveCoordinate/);rejected++;
  check(131072,32768,65536,1n,2n);
  return {comparisons,rejected,undecided};
}
