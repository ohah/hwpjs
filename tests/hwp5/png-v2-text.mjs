import assert from 'node:assert/strict';
import {profile,payloadInput} from './png-payload-inspection.mjs';
export function description(ascii=1,units=0,script=0,tail=0) {
  const b=Buffer.alloc(90+ascii+2*units+tail);b.write('desc');b.writeUInt32BE(ascii,8);
  b.fill(65,12,12+ascii-1);const u=12+ascii;b.writeUInt32BE(0x12345678,u);b.writeUInt32BE(units,u+4);
  if(units>1)b.writeUInt16BE(0xdc00,u+8);
  const s=u+8+2*units;b.writeUInt16BE(42,s);b[s+2]=script;if(tail)b.fill(0xa5,b.length-tail);return b;
}
const copyright=Buffer.from([116,101,120,116,0,0,0,0,66,0]);
export function pngV2TextEdges(call) {
  let comparisons=0,rejected=0;
  const input=d=>payloadInput(profile([['desc',d],['cprt',copyright]],2),{edition:2});
  function check(ascii,units,script,tail) {
    const d=description(ascii,units,script,tail),out=call(242,input(d));
    assert.equal(out.length,92);
    const expected=[1,1,1,1,2,d.length+10,0,0,0,0,0,0,0,0,0,0,0,1,1,1,units*2,67,tail];
    assert.deepEqual(Array.from({length:23},(_,i)=>out.readUInt32LE(i*4)),expected);
    assert.deepEqual(call(241,input(d)),out.subarray(0,72));comparisons++;
  }
  for(const ascii of [1,2,3,4,7,8])for(const units of [0,1,2])for(const script of [0,1,67])for(const tail of [0,1,3])check(ascii,units,script,tail);
  const reject=(d,re)=>{assert.throws(()=>call(242,input(d)),re);rejected++;};
  const good=description(3,2,2);
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n),/Invalid|UnexpectedEnd/);
  for(const [at,value,re] of [[0,120,/InvalidIccDescriptionType/],[4,1,/InvalidIccTagReserved/],[12,128,/InvalidIccAscii/],[14,65,/InvalidIccTextTerminator/],[26,1,/InvalidIccTextTerminator/],[29,68,/InvalidIccScriptCount/],[31,1,/InvalidIccTextTerminator/]]){const bad=Buffer.from(good);bad[at]=value;reject(bad,re);}
  for(const at of [8,19]){const bad=Buffer.from(good);bad.writeUInt32BE(0xffffffff,at);reject(bad,/UnexpectedEnd/);}
  const raw=profile([['desc',good],['cprt',copyright]],2);
  assert.throws(()=>call(242,payloadInput(raw,{edition:2,bytes:good.length+9})),/LimitExceeded/);rejected++;
  const unselected=call(242,payloadInput(raw,{edition:2,selected:0}));assert.equal(unselected.length,92);assert.deepEqual(unselected.subarray(16),Buffer.alloc(76));comparisons++;
  const absent=call(242,payloadInput(null,{edition:2}));assert.deepEqual(absent,Buffer.alloc(92));comparisons++;
  check(3,2,2,0);
  return {comparisons,rejected};
}
