import assert from 'node:assert/strict';
import {profilePng,profilePayload} from './png-profile.mjs';
export function profile(entries,major=4) {
  const end=132+12*entries.length;
  const b=Buffer.alloc(end+entries.reduce((n,[,data])=>n+Math.ceil(data.length/4)*4,0));
  b.writeUInt32BE(b.length);b[8]=major;b.write('mntr',12);b.write('RGB ',16);b.write('XYZ ',20);b.write('acsp',36);b.writeUInt32BE(entries.length,128);
  let offset=end;
  entries.forEach(([sig,data],i)=>{const at=132+12*i;b.write(sig,at);b.writeUInt32BE(offset,at+4);b.writeUInt32BE(data.length,at+8);data.copy(b,offset);offset+=Math.ceil(data.length/4)*4;});
  return b;
}
const typed=(type,n)=>{const b=Buffer.alloc(n);b.write(type);return b;};
function strings() {
  const b=typed('mluc',30);b.writeUInt32BE(1,8);b.writeUInt32BE(12,12);b.write('enUS',16);b.writeUInt32BE(2,20);b.writeUInt32BE(28,24);b.writeUInt16BE(65,28);return b;
}
export function payloadInput(raw,{selected=1,edition=4,bytes=67108864,records=100000,unicode=67108864}={}) {
  const prefix=Buffer.alloc(14);prefix[0]=selected;prefix[1]=edition;[bytes,records,unicode].forEach((v,i)=>prefix.writeUInt32BE(v,2+4*i));
  return Buffer.concat([prefix,profilePng(2,raw===null?[]:[profilePayload(raw)])]);
}
export function pngPayloadEdges(call) {
  let comparisons=0,rejected=0;
  const check=(input,expected)=>{const out=call(241,input);assert.equal(out.length,72);assert.deepEqual(Array.from({length:18},(_,i)=>out.readUInt32LE(4*i)),expected);comparisons++;};
  const reject=(input,re,limit)=>{assert.throws(()=>call(241,input,limit),re);rejected++;};
  const xyz=typed('XYZ ',20);[63190,65536,54061].forEach((v,i)=>xyz.writeInt32BE(v,8+4*i));
  const chad=typed('sf32',44);[8,24,40].forEach(at=>chad.writeInt32BE(65536,at));
  const entries=[['wtpt',xyz],['rTRC',typed('curv',12)],['desc',strings()],['cprt',strings()],['chad',chad],['A2B0',typed('data',8)]];
  const expected=[1,1,1,1,6,144,1,1,2,1,1,0,0,0,2,4,0,1];
  for(const list of [entries,[...entries].reverse()])check(payloadInput(profile(list),{bytes:144,records:2,unicode:4}),expected);
  const good=payloadInput(profile(entries));
  for(const opts of [{bytes:143},{records:1},{unicode:3}])reject(payloadInput(profile(entries),opts),/LimitExceeded/);
  check(payloadInput(profile(entries),{selected:0}),[1,0,1,1,...Array(14).fill(0)]);
  check(payloadInput(null),Array(18).fill(0));
  reject(payloadInput(profile(entries,2),{edition:2}),/InvalidIccDescriptionType/);
  reject(payloadInput(profile(entries),{edition:2}),/IccEditionMismatch/);
  const malformed=strings();malformed.writeUInt16BE(0xdc00,28);
  reject(payloadInput(profile([['desc',malformed]])),/InvalidUnicodeEncoding/);
  reject(payloadInput(profile([['rTRC',typed('data',8)]])),/InvalidIccTrcType/);
  const negative=Buffer.from(xyz);negative.writeInt32BE(-65536,8);
  reject(payloadInput(profile([['wtpt',negative]])),/InvalidIccIlluminant/);
  check(payloadInput(profile([['rXYZ',negative]])),[1,1,1,1,1,20,1,0,0,0,0,0,1,0,0,0,0,1]);
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n),/Invalid|UnexpectedEnd|Missing|Truncated|EndOfStream/);
  for(const [at,v] of [[0,2],[1,3]]){const bad=Buffer.from(good);bad[at]=v;reject(bad,/InvalidProbeInput/);}
  reject(good,/LimitExceeded/,good.length-1);
  check(good,expected);
  return {comparisons,rejected};
}
