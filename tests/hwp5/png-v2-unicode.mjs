import assert from 'node:assert/strict';
import {description} from './png-v2-text.mjs';
import {profile,payloadInput} from './png-payload-inspection.mjs';
const decoder=new TextDecoder('utf-16be',{fatal:true,ignoreBOM:true});
export function unicodeDescription(units,ascii=1) {
  const d=description(ascii,units.length,0);units.forEach((v,i)=>d.writeUInt16BE(v,20+ascii+2*i));return d;
}
export function pngV2UnicodeEdges(call) {
  let comparisons=0,rejected=0;
  const input=(d,opts={})=>payloadInput(profile([['desc',d]],2),{edition:2,...opts});
  function check(units,ascii=1) {
    const d=unicodeDescription(units,ascii),raw=d.subarray(20+ascii,20+ascii+2*units.length);
    const characters=Array.from(decoder.decode(raw)),out=call(243,input(d,{unicode:raw.length}));
    const expected=[1,1,1,1,1,d.length,0,0,0,0,0,0,0,0,0,raw.length,0,1,1,0,0,67,0,1,1,characters.length,characters.filter(c=>c==='\0').length,characters.filter(c=>c==='\ufeff').length];
    assert.equal(out.length,112);assert.deepEqual(Array.from({length:28},(_,i)=>out.readUInt32LE(i*4)),expected);comparisons++;
    if(raw.length){assert.throws(()=>call(243,input(d,{unicode:raw.length-1})),/LimitExceeded/);rejected++;}
  }
  for(const ascii of [1,2,3,4,7])for(const units of [[],[0],[0,0],[65,0],[0xac00,0],[0xfeff,0],[0xfeff,0,0xfeff,0],[0xd800,0xdc00,0],[0xdbff,0xdfff,0],[0xfffe,0xffff,0]])check(units,ascii);
  let state=0x713ac;
  for(let i=0;i<256;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;let cp=state%0x110000;if(cp>=0xd800&&cp<=0xdfff)cp=65;check(cp<0x10000?[cp,0]:[0xd800+((cp-0x10000)>>>10),0xdc00+((cp-0x10000)&1023),0],1+i%4);}
  for(const units of [[0xd800,0],[0xdc00,0],[0xdfff,0],[0xdbff,65,0],[0xdc00,0xd800,0]]){
    const d=unicodeDescription(units);assert.throws(()=>decoder.decode(d.subarray(21,21+units.length*2)));assert.throws(()=>call(243,input(d)),/InvalidUnicodeEncoding/);rejected++;
    const raw=call(242,input(d));assert.equal(raw.readUInt32LE(80),units.length*2);comparisons++;
  }
  const d=unicodeDescription([65,0]);
  const absent=call(243,payloadInput(null,{edition:2}));assert.deepEqual(absent,Buffer.alloc(112));comparisons++;
  const unselected=call(243,input(d,{selected:0}));assert.deepEqual(unselected.subarray(16),Buffer.alloc(96));comparisons++;
  const good=input(d);for(let n=0;n<good.length;n++){assert.throws(()=>call(243,good.subarray(0,n)),/Invalid|UnexpectedEnd|Missing|Truncated|EndOfStream/);rejected++;}
  assert.throws(()=>call(243,good,good.length-1),/LimitExceeded/);rejected++;
  check([0xfeff,0xd83d,0xde00,0]);
  return {comparisons,rejected};
}
