import assert from 'node:assert/strict';
import {preimageInput} from './icc-power-preimage.mjs';
import {decode as powerDecode} from './icc-power-preimage-wire.mjs';
import {verify as powerVerify} from './icc-power-preimage-reference.mjs';
import {linearPreimageReference,validateInterval} from './icc-linear-preimage-reference.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
import {cmp} from './icc-power-reference.mjs';
const Z=[0n,1n],O=[1n,1n];
function decode(out){
  const status=out.readUInt32LE();assert.ok(status<=1);
  if(status===0){assert.equal(out.length,4);return {status};}
  const empty=out.readUInt32LE(4);assert.ok(empty<=1);const bytes=out.subarray(8,144);assert.equal(bytes.length,136);let linear=null;
  if(bytes.readUInt32LE()===0)assert.deepEqual(bytes,Buffer.alloc(136));else{assert.equal(bytes.readUInt32LE(),1);linear={start:[readWide(bytes,8),readWide(bytes,40)],end:[readWide(bytes,72),readWide(bytes,104)],flags:bytes.readUInt32LE(4)};assert.ok(linear.flags<=3);validateInterval(linear);}
  const power=powerDecode(out.subarray(144));assert.notEqual(power.status,1);
  return {status,empty:!!empty,linear,power};
}
export function parametricPreimageEdges(call){
  let comparisons=0,rejected=0,undecided=0,membershipChecks=0;
  function check(kind,raw,n,d,precision=512){
    const input=preimageInput(kind,raw,n,d,precision);let active;
    try{active=domain(kind,raw);}catch(e){assert.throws(()=>call(200,input),new RegExp(e.message));rejected++;return;}
    const out=decode(call(200,input));assert.equal(out.status,1);
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
  const max=(1n<<128n)-1n,n=65537n*65537n<<64n,raw=[131072,65537,0,65536,1];
  assert.deepEqual(decode(call(200,preimageInput(3,raw,n,max,128))),{status:0});undecided++;
  check(3,raw,n,max,512);
  const good=preimageInput(0,[65536],1n,3n);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(200,good.subarray(0,len)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  assert.throws(()=>call(200,good,good.length-1),/LimitExceeded/);rejected++;
  assert.throws(()=>call(200,Buffer.concat([good,Buffer.alloc(1)])),/InvalidIcc/);rejected++;
  assert.throws(()=>call(200,preimageInput(0,[65536],1n,3n,64)),/InvalidIccComparisonPrecision/);rejected++;
  for(const [n,d] of [[1n,0n],[2n,1n]]){assert.throws(()=>call(200,preimageInput(0,[65536],n,d)),/InvalidIccCurveCoordinate/);rejected++;}
  check(0,[65536],1n,3n);
  return {comparisons,rejected,undecided,membershipChecks};
}
