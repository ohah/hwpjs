import assert from 'node:assert/strict';
import {segment} from './jpeg-structure.mjs';
import {jpegJfxxJpegFixture} from './jpeg-jfxx-jpeg.mjs';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';

const words = ns => { const b=Buffer.alloc(ns.length*4); ns.forEach((n,i)=>b.writeUInt32LE(n,i*4)); return b; };
export function adobePayload(version=100,flags0=0x4000,flags1=0,transform=1,extra=Buffer.alloc(0)) {
  const b=Buffer.alloc(12); b.write('Adobe'); b.writeUInt16BE(version,5); b.writeUInt16BE(flags0,7); b.writeUInt16BE(flags1,9); b[11]=transform;
  return Buffer.concat([b,extra]);
}
export function adobeWire(b) {
  assert.ok(b.length>=12&&b.length<=65533); assert.deepEqual(b.subarray(0,5),Buffer.from('Adobe'));
  return Buffer.concat([words([b.readUInt16BE(5),b.readUInt16BE(7),b.readUInt16BE(9),b[11],b.length-12,+(b[5]===0)]),b.subarray(12)]);
}
export function adobeFile(parts,late=false) {
  const raw=jpegJfxxJpegFixture({}),at=late?raw.length-2:2;
  return Buffer.concat([raw.subarray(0,at),...parts.map(p=>segment(238,p)),raw.subarray(at)]);
}
export function adobeParts(raw) {
  let at=0,entropy=false;const parts=[];
  while(at<raw.length) {
    if(entropy)at+=jpegEntropyOracle(raw.subarray(at)).consumed;
    const m=jpegMarkerOracle(raw.subarray(at));at+=m.consumed;
    const p=m.wire.subarray(20);
    if(m.code===238&&p.subarray(0,5).equals(Buffer.from('Adobe')))parts.push(p);
    entropy=m.code===218||(m.code>=208&&m.code<=215);
    if(m.code===217)break;
  }
  return parts;
}
export function jpegAdobeFileActual(call,raw,maximum=256) {
  const parts=adobeParts(raw),expected=Buffer.concat([words([parts.length]),...parts.map(adobeWire)]);
  assert.deepEqual(call(275,Buffer.concat([words([maximum]),raw])),expected);
  return {headers:parts.length,extra:parts.reduce((n,p)=>n+p.length-12,0)};
}
export function jpegAdobeEdges(call) {
  let comparisons=0,rejected=0;
  const check=b=>{assert.deepEqual(call(274,b),adobeWire(b));comparisons++;};
  const reject=(mode,b,error,limit=67108864)=>{assert.throws(()=>call(mode,b,limit),error);rejected++;};
  for(let n=0;n<65536;n++)check(adobePayload(n,n^0xa55a,65535-n));
  for(let transform=0;transform<256;transform++) {
    const b=adobePayload(100,0,0,transform);check(b);
    for(const count of [3,4]) {
      const input=Buffer.concat([Buffer.of(count),b]);
      const encoding=({'3:0':0,'4:0':2,'3:1':1,'4:2':3})[`${count}:${transform}`];
      if(encoding===undefined)reject(276,input,transform>2?/UnsupportedAdobeTransform/:/InvalidAdobeTransformComponents/);
      else {assert.deepEqual(call(276,input),words([encoding]));comparisons++;}
    }
  }
  const base=adobePayload();
  for(let n=0;n<12;n++)reject(274,base.subarray(0,n),/UnexpectedEnd/);
  for(let i=0;i<5;i++){const b=Buffer.from(base);b[i]^=1;reject(274,b,/InvalidAdobeIdentifier/);}
  for(let i=0;i<5;i++){const b=Buffer.from(base);b[i]|=128;reject(274,b,/InvalidAdobeIdentifier/);assert.throws(()=>adobeWire(b));}
  check(adobePayload(65535,65534,32768,255,Buffer.alloc(65521,0xa5)));
  reject(274,adobePayload(100,0,0,1,Buffer.alloc(65522)),/LimitExceeded/);
  reject(274,base,/LimitExceeded/,23);
  reject(276,Buffer.concat([Buffer.of(3),adobePayload(256)]),/InvalidPrintAdobeIdentifier/);
  reject(276,Buffer.concat([Buffer.of(3),base]),/LimitExceeded/,3);
  for(let c=0;c<256;c++)if(c!==3&&c!==4)reject(276,Buffer.concat([Buffer.of(c),base]),/UnsupportedAdobeComponentCount/);
  const different=adobePayload(257,0x1234,0x5678,255,Buffer.of(9,2,7));
  for(const late of [false,true])for(const parts of [[],[base],[base,different],[different,base]]) {
    const raw=adobeFile(parts,late);jpegAdobeFileActual(call,raw,parts.length);comparisons++;
    if(parts.length)reject(275,Buffer.concat([words([parts.length-1]),raw]),/LimitExceeded/);
  }
  const raw=adobeFile([base,different],true);
  const many=Array.from({length:256},(_,i)=>adobePayload(i,i*257,65535-i,i,Buffer.of(i)));
  jpegAdobeFileActual(call,adobeFile(many));comparisons++;
  reject(275,Buffer.concat([words([256]),adobeFile([...many,base])]),/LimitExceeded/);
  for(let n=0;n<5;n++){jpegAdobeFileActual(call,adobeFile([base.subarray(0,n)]),0);comparisons++;}
  for(let n=0;n<raw.length;n++)reject(275,Buffer.concat([words([256]),raw.subarray(0,n)]),/./);
  for(let n=5;n<12;n++)reject(275,Buffer.concat([words([256]),adobeFile([base.subarray(0,n)])]),/UnexpectedEnd/);
  const unrelated=Buffer.from(base);unrelated[0]=88;jpegAdobeFileActual(call,adobeFile([unrelated]),0);comparisons++;
  return {comparisons,rejected};
}
