import assert from 'node:assert/strict';
import {preimageInput} from './icc-power-preimage.mjs';
import {decode as powerDecode} from './icc-power-preimage-wire.mjs';
import {verify as powerVerify} from './icc-power-preimage-reference.mjs';
import {linearPreimageReference,validateInterval} from './icc-linear-preimage-reference.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
import {cmp} from './icc-power-reference.mjs';
const Z=[0n,1n],O=[1n,1n];
export function decode(out,width=32){
  assert.ok(width===32||width===128);const prefix=16+4*width,linearSize=8+4*width;
  const status=out.readUInt32LE();assert.ok(status<=1);
  if(status===0){assert.equal(out.length,4);return {status};}
  const empty=out.readUInt32LE(4);assert.ok(empty<=1);const bytes=out.subarray(8,prefix);assert.equal(bytes.length,linearSize);let linear=null;
  if(bytes.readUInt32LE()===0)assert.deepEqual(bytes,Buffer.alloc(linearSize));else{assert.equal(bytes.readUInt32LE(),1);linear={start:[readWide(bytes,8,width),readWide(bytes,8+width,width)],end:[readWide(bytes,8+2*width,width),readWide(bytes,8+3*width,width)],flags:bytes.readUInt32LE(4)};assert.ok(linear.flags<=3);validateInterval(linear);}
  const power=powerDecode(out.subarray(prefix),width);assert.notEqual(power.status,1);
  return {status,empty:!!empty,linear,power};
}
export function parametricPreimageEdges(call,bits=128){
  assert.ok(bits===128||bits===512);
  const mode=bits===128?200:228,defaultPrecision=bits===128?512:1024;
  const inputFor=(kind,raw,n,d,precision=defaultPrecision)=>preimageInput(kind,raw,n,d,precision,bits);
  const decodeFor=out=>decode(out,bits===128?32:128);
  let comparisons=0,rejected=0,undecided=0,membershipChecks=0;
  function check(kind,raw,n,d,precision=defaultPrecision){
    const input=inputFor(kind,raw,n,d,precision);let active;
    try{active=domain(kind,raw);}catch(e){assert.throws(()=>call(mode,input),new RegExp(e.message));rejected++;return;}
    const out=decodeFor(call(mode,input));assert.equal(out.status,1);
    const line=active&&cmp(active.start,Z)===0?null:{start:Z,end:active?active.start:O,flags:active?1:3,a:kind>=3?raw[3]:0,b:kind===2?raw[3]:kind===4?raw[6]:0};
    const expected=line?linearPreimageReference(line,[n,d]):null;
    if(!expected)assert.equal(out.linear,null);else{assert.ok(out.linear);assert.equal(cmp(out.linear.start,expected.start),0);assert.equal(cmp(out.linear.end,expected.end),0);assert.equal(out.linear.flags,expected.flags);}
    if(!active)assert.equal(out.power.status,0);else membershipChecks+=powerVerify(out.power,active,kind===2?raw[3]:kind===4?raw[5]:0,n,d);
    const upperEmpty=!active||(out.power.intervals.length===0&&out.power.roots.length===0);
    assert.equal(out.empty,expected===null&&upperEmpty);comparisons++;
  }
  for(let kind=0;kind<5;kind++)for(const g of [-65536,0,32768,65536,131072])for(const a of [-131072,0,131072])for(const b of [-65536,0,65536])for(const threshold of [0,32768,65536,65537])for(const [c,e,f] of [[65536,0,0],[-65536,32768,65536],[0,65536,-32768]])for(const [n,d] of [[0n,1n],[1n,1n],[1n,3n]])check(kind,[g,a,b,c,threshold,e,f],n,d);
  for(const precision of [128,256,512,1024]){
    check(4,[65536,0,0,0,32768,65536,0],0n,1n,precision);
    check(4,[65536,0,0,0,32768,65536,0],1n,2n,precision);
    check(4,[65536,0,0,0,65536,0,0],0n,1n,precision);
    check(4,[131072,262144,-196608,65536,32768,0,0],1n,4n,precision);
  }
  const max=(1n<<BigInt(bits))-1n,n=65537n*65537n<<BigInt(bits-64),raw=[131072,65537,0,65536,1];
  assert.deepEqual(decodeFor(call(mode,inputFor(3,raw,n,max,128))),{status:0});undecided++;
  check(3,raw,n,max,defaultPrecision);
  if(bits===512)for(const [kind,params] of [[0,[65536]],[4,[65536,0,0,0,32768,65536,0]],[4,[131072,262144,-196608,65536,32768,0,0]],[4,[65536,65536,0,65537,65537,0,1]]])for(const n of [0n,1n,max/2n,max-1n,max])check(kind,params,n,max);
  const good=inputFor(0,[65536],1n,3n);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(mode,good.subarray(0,len)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  assert.throws(()=>call(mode,good,good.length-1),/LimitExceeded/);rejected++;
  assert.throws(()=>call(mode,Buffer.concat([good,Buffer.alloc(1)])),/InvalidIcc/);rejected++;
  assert.throws(()=>call(mode,inputFor(0,[65536],1n,3n,64)),/InvalidIccComparisonPrecision/);rejected++;
  for(const [n,d] of [[1n,0n],[2n,1n]]){assert.throws(()=>call(mode,inputFor(0,[65536],n,d)),/InvalidIccCurveCoordinate/);rejected++;}
  check(0,[65536],1n,3n);
  return {comparisons,rejected,undecided,membershipChecks};
}
