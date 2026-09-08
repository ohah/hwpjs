import assert from 'node:assert/strict';
import {readWide,writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {fraction as F} from './icc-matrix-reference.mjs';
function input(g,offset,n,d){const out=Buffer.alloc(40);out.writeInt32BE(g);out.writeInt32BE(offset,4);writeUnsigned(out,8,n,16);writeUnsigned(out,24,d,16);return out;}
export function reference(g,offset,n,d){
 if(d===0n||n>d)throw Error('InvalidIccCurveCoordinate');
 const value=F(n*65536n-BigInt(offset)*d,d*65536n);
 if(g===0)return {all:value[0]===value[1],signs:[],value};
 const signs=[];if(value[0]===0n){if(g>0)signs.push(0);}else{
  if(value[0]>0n)signs.push(1);
  if(g%65536===0){const odd=Math.abs(g/65536)%2===1;if((value[0]<0n&&odd)||(value[0]>0n&&!odd))signs.push(-1);}
 }return {all:false,signs,value};
}
export function normalizedPowerLevelEdges(call){let comparisons=0,rejected=0,roots=0,bridges=0;
 function check(g,offset,n,d){const bytes=input(g,offset,n,d);let expected;try{expected=reference(g,offset,n,d);}catch(e){assert.throws(()=>call(195,bytes),new RegExp(e.message));rejected++;return;}
  const out=call(195,bytes);assert.equal(out.length,8+76*expected.signs.length);assert.equal(out.readUInt32LE(),Number(expected.all));assert.equal(out.readUInt32LE(4),expected.signs.length);
  expected.signs.forEach((sign,i)=>{const at=8+i*76;assert.equal(out.readInt32LE(at),sign);if(sign===0){assert.deepEqual(out.subarray(at,at+76),Buffer.alloc(76));return;}const n=readWide(out,at+4),d=readWide(out,at+36);assert.ok(n>0n&&d>0n);const ordinate=expected.value[0]<0n?-expected.value[0]:expected.value[0];assert.equal(n*expected.value[1],d*ordinate);assert.equal(out.readInt32LE(at+68),g<0?-65536:65536);assert.equal(out.readUInt32LE(at+72),Math.abs(g));});comparisons++;roots+=expected.signs.length;
 }
 const max=(1n<<128n)-1n;
 for(const g of [-2147483648,-196608,-131072,-65536,-32768,-1,0,1,32768,65536,98304,131072,196608,2147483647])for(const offset of [-2147483648,-65536,-32768,0,1,32768,65536,2147483647])for(const [n,d] of [[0n,1n],[1n,1n],[1n,3n],[1n,2n],[1n,max],[max/2n,max],[max-1n,max],[max,max]])check(g,offset,n,d);
 const even=max-1n;for(const n of [even/2n-1n,even/2n,even/2n+1n])check(0,-32768,n,even);
 let seed=0x12345678n;function random(){seed=(seed*6364136223846793005n+1442695040888963407n)&max;return seed;}
 for(let i=0;i<512;i++){const d=random()||1n,n=random()%d;check([-131072,-65536,-32768,0,32768,65536,131072,196608][i%8],[-2147483648,-32768,0,1,65536,2147483647][i%6],n,d);}
 // Compatibility only: old and new wrappers share shape logic; the reference above is independent.
 for(const g of [-2147483648,-65536,0,32768,65536,131072,2147483647])for(const offset of [-2147483648,0,32768,65536,2147483647])for(const target of [0,1,32768,65535,65536]){
  const raw=Buffer.alloc(12);raw.writeInt32BE(g);raw.writeInt32BE(offset,4);raw.writeInt32BE(target,8);const old=call(182,raw),wide=call(195,input(g,offset,BigInt(target),65536n));assert.deepEqual(wide.subarray(0,8),old.subarray(0,8));for(let i=0;i<old.readUInt32LE(4);i++){const o=8+20*i,w=8+76*i;assert.equal(wide.readInt32LE(w),old.readInt32LE(o));if(old.readInt32LE(o)!==0){assert.equal(readWide(wide,w+4)*65536n,readWide(wide,w+36)*old.readBigUInt64LE(o+4));assert.equal(wide.readInt32LE(w+68),old.readInt32LE(o+12));assert.equal(wide.readUInt32LE(w+72),old.readUInt32LE(o+16));}}bridges+=2;
 }
 const good=input(65536,0,1n,3n);for(let size=0;size<good.length;size++){assert.throws(()=>call(195,good.subarray(0,size)),/InvalidProbeInput/);rejected++;}
 assert.throws(()=>call(195,good,39),/LimitExceeded/);rejected++;assert.throws(()=>call(195,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
 check(0,0,0n,0n);check(65536,0,2n,1n);check(65536,0,max,max-1n);check(65536,1,max/2n,max);
 return {comparisons,rejected,roots,bridges};
}
