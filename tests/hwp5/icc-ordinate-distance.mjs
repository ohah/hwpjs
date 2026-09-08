import assert from 'node:assert/strict';
import {ordinateOrderInput} from './icc-ordinate-order.mjs';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {fraction as F} from './icc-matrix-reference.mjs';
import {cmp} from './icc-power-reference.mjs';
export function ordinateDistanceInput(value,r,target,precision=512,bits=128){const prefix=72+bits/4;const out=Buffer.alloc(prefix+64);ordinateOrderInput(value,target,precision,bits).copy(out);writeUnsigned(out,prefix,r[0]);writeUnsigned(out,prefix+32,r[1]);return out;}
const abs=n=>n<0n?-n:n;
function evaluate(value){if(value.rational)return value.rational;let [n,d]=value.base;const g=BigInt(value.g);assert.equal(g%65536n,0n);const p=abs(g)/65536n;[n,d]=[n**p,d**p];if(g<0n)[n,d]=[d,n];[n,d]=F(n,d);return F(n*65536n+BigInt(value.offset)*d,d*65536n);}
export function ordinateDistanceEdges(call,bits=128){const mode=bits===128?210:233,prefix=4+bits/4;const inputFor=(value,r,target,precision=512)=>ordinateDistanceInput(value,r,target,precision,bits);let comparisons=0,rejected=0,undecided=0;
 function check(value,r,target,precision=512){const input=inputFor(value,r,target,precision);const invalid=x=>x[1]===0n||x[0]>x[1];let error;if(invalid(r)||invalid(target)||value.rational&&invalid(value.rational))error=/InvalidIccCurveCoordinate/;else if(!value.rational&&value.base[1]===0n)error=/InvalidIccPowerCoordinate/;else if(!value.rational&&value.base[0]===0n&&value.g<=0)error=/UndefinedIccCurvePower/;if(error){assert.throws(()=>call(mode,input),error);rejected++;return;}const v=evaluate(value),distance=x=>F(abs(x[0]*target[1]-target[0]*x[1]),x[1]*target[1]);const expected=cmp(distance(v),distance(r));const out=call(mode,input);assert.equal(out.length,4);assert.equal(out.readInt32LE(),expected);comparisons++;}
 for(const g of [-131072,-65536,0,65536,131072])for(const a of [-3n,-1n,0n,1n,3n])for(const d of [1n,3n,7n])for(const offset of [-2147483648,-32768,0,16384,2147483647])for(const target of [[0n,1n],[1n,3n],[1n,2n],[1n,1n]])for(const r of [[0n,1n],[1n,4n],[3n,4n],[1n,1n]])check({base:[a,d],g,offset},r,target);
 const max128=(1n<<BigInt(bits))-1n,max256=(1n<<256n)-1n;
 if(bits===512){
  for(const n of [0n,1n,max128/4n,max128/4n+1n,max128/2n,max128-1n,max128])for(const r of [[0n,1n],[max256/2n,max256],[1n,1n]]){
   check({rational:[1n,2n]},r,[n,max128],1024);
   check({base:[1n,2n],g:65536,offset:0},r,[n,max128],1024);
   check({base:[-1n,2n],g:131072,offset:16384},r,[n,max128],1024);
  }
 }
 for(const precision of [128,256,512,1024])for(const target of [[0n,max128],[max128/3n,2n*(max128/3n)],[max128,max128]])for(const r of [[0n,max256],[max256/2n,max256],[max256,max256]]){check({rational:[max256/2n,max256]},r,target,precision);for(const offset of [-2147483648,2147483647])check({base:[1n,1n],g:0,offset},r,target,precision);}
 const root={base:[1n,2n],g:32768,offset:0},r=[0n,1n],target=[11749380235262596085n,33232265756373499214n];assert.equal(call(mode,inputFor(root,r,target,128)).readInt32LE(),2);undecided++;assert.equal(call(mode,inputFor(root,r,target,512)).readInt32LE(),-1);comparisons++;
 const good=inputFor({base:[1n,2n],g:65536,offset:0},[1n,4n],[1n,2n]);for(let len=0;len<good.length;len++){assert.throws(()=>call(mode,good.subarray(0,len)),/InvalidProbeInput/);rejected++;}for(const [b,l]of [[good,good.length-1],[Buffer.concat([good,Buffer.alloc(1)]),undefined]]){assert.throws(()=>call(mode,b,l),/InvalidProbeInput|LimitExceeded/);rejected++;}for(const [position,value,error]of [[0,64,/InvalidIccComparisonPrecision/],[prefix,2,/InvalidProbeInput/],[prefix+44,1,/InvalidProbeInput/]]){const b=Buffer.from(good);b.writeUInt32BE(value,position);assert.throws(()=>call(mode,b),error);rejected++;}
 const value={base:[1n,2n],g:65536,offset:0};check(value,[0n,0n],[0n,1n]);check(value,[2n,1n],[0n,1n]);check(value,[0n,1n],[0n,0n]);check(value,[0n,1n],[2n,1n]);check({...value,base:[1n,0n]},[0n,1n],[0n,1n]);check({rational:[2n,1n]},[0n,1n],[0n,1n]);assert.throws(()=>call(mode,inputFor({...root,base:[-1n,2n]},[0n,1n],[0n,1n])),/UndefinedIccCurvePower/);rejected++;check(value,[1n,4n],[1n,2n]);return {comparisons,rejected,undecided};
}
