import assert from 'node:assert/strict';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {rationalPowerOrder,exponent,cmp} from './icc-power-reference.mjs';
export function ordinateOrderInput(value,target,precision=512,bits=128){const width=bits/8,prefix=4+2*width;const out=Buffer.alloc(prefix+68);out.writeUInt32BE(precision);writeUnsigned(out,4,target[0],width);writeUnsigned(out,4+width,target[1],width);if(value.rational){writeUnsigned(out,prefix+4,value.rational[0]);writeUnsigned(out,prefix+36,value.rational[1]);}else{out.writeUInt32BE(1,prefix);writeUnsigned(out,prefix+4,BigInt.asUintN(128,value.base[0]),16);writeUnsigned(out,prefix+20,value.base[1],16);out.writeInt32BE(value.g,prefix+36);out.writeInt32BE(value.offset,prefix+40);}return out;}
export function ordinateOrderEdges(call,bits=128){const mode=bits===128?208:232,prefix=4+bits/4;const input=(value,target,precision=512)=>ordinateOrderInput(value,target,precision,bits);let comparisons=0,rejected=0,undecided=0;
 function check(value,target,precision=512){const bytes=input(value,target,precision);let error;if(target[1]===0n||target[0]>target[1]||value.rational&&(value.rational[1]===0n||value.rational[0]>value.rational[1]))error=/InvalidIccCurveCoordinate/;else if(!value.rational){if(value.base[1]===0n)error=/InvalidIccPowerCoordinate/;else if(value.base[0]===0n&&value.g<=0||value.base[0]<0n&&exponent(value.g)[1]>1n)error=/UndefinedIccCurvePower/;}if(error){assert.throws(()=>call(mode,bytes),error);rejected++;return;}const expected=value.rational?cmp(value.rational,target):rationalPowerOrder(value.base,value.g,[target[0]*65536n-BigInt(value.offset)*target[1],target[1]*65536n]);const out=call(mode,bytes);assert.equal(out.length,4);assert.equal(out.readInt32LE(),expected);comparisons++;}
 for(const g of [-131072,-65536,-32768,0,32768,65536,131072])for(const a of [-3n,0n,1n,3n])for(const b of [1n,3n,7n])for(const offset of [-2147483648,-32768,0,16384,2147483647])for(const target of [[0n,1n],[1n,3n],[1n,2n],[1n,1n]])check({base:[a,b],g,offset},target);
 const max=(1n<<BigInt(bits))-1n;
 if(bits===512){
  for(const n of [0n,1n,max/3n,max/2n,max-1n,max])for(const offset of [-2147483648,-32768,0,16384,2147483647]){
   check({base:[1n,3n],g:65536,offset},[n,max],1024);
   check({base:[1n,3n],g:131072,offset},[n,max],1024);
   check({rational:[(1n<<255n)-1n,(1n<<256n)-1n]},[n,max],1024);
  }
  check({base:[1n,4n],g:32768,offset:0},[1n<<510n,1n<<511n],128);
 }
 for(const precision of [128,256,512,1024]){for(const offset of [-2147483648,-32768,16384,2147483647])check({base:[1n,1n],g:0,offset},[max/3n,2n*(max/3n)],precision);for(const rational of [[0n,1n],[(1n<<255n)-1n,(1n<<256n)-1n],[1n,1n]])check({rational},[1n,2n],precision);}
 const root={base:[1n,2n],g:32768,offset:0},hi=[11749380235262596085n,16616132878186749607n];assert.equal(call(mode,input(root,hi,128)).readInt32LE(),2);undecided++;check(root,hi,512);
 const good=input(root,[1n,2n]);for(let len=0;len<good.length;len++){assert.throws(()=>call(mode,good.subarray(0,len)),/InvalidProbeInput/);rejected++;}for(const [b,l]of [[good,good.length-1],[Buffer.concat([good,Buffer.alloc(1)]),undefined]]){assert.throws(()=>call(mode,b,l),/InvalidProbeInput|LimitExceeded/);rejected++;}
 for(const [position,value,error]of [[0,64,/InvalidIccComparisonPrecision/],[prefix,2,/InvalidProbeInput/],[prefix+44,1,/InvalidProbeInput/]]){const b=Buffer.from(good);b.writeUInt32BE(value,position);assert.throws(()=>call(mode,b),error);rejected++;}
 check(root,[0n,0n]);check(root,[2n,1n]);check({...root,base:[1n,0n]},[0n,1n]);check({rational:[2n,1n]},[0n,1n]);check({rational:[0n,0n]},[0n,1n]);check(root,[1n,2n]);return {comparisons,rejected,undecided};
}
