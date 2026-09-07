import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {suggestedWire} from './png-suggested-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
export function pngSuggestedEdges(call,cfb){
  let accepted=0,rejected=0,mutations=0,actualPng=0,actualSuggested=0;
  const payload=(name,depth,entries)=>{const key=Buffer.from(name),width=depth===8?6:10,body=Buffer.alloc(width*entries.length);entries.forEach((e,i)=>{for(let j=0;j<4;j++){if(depth===8)body[i*width+j]=e[j];else body.writeUInt16BE(e[j],i*width+j*2);}body.writeUInt16BE(e[4],i*width+width-2);});return Buffer.concat([key,Buffer.from([0,depth]),body]);};
  const hd=chunk('IHDR',header(8,0)),id=chunk('IDAT',deflateSync(Buffer.from([0,0]))),end=chunk('IEND');
  const wrap=p=>png(hd,chunk('sPLT',p),id,end);
  const check=bytes=>{let expected;try{expected=suggestedWire(transparencyEvidence(pngStructureEvidence(bytes)));}catch{}
    if(expected){assert.deepEqual(call(140,bytes,bytes.length),expected);accepted++;assert.throws(()=>call(140,bytes,bytes.length-1),/LimitExceeded/);rejected++;}
    else{assert.throws(()=>call(140,bytes,bytes.length),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;}return expected;};
  const values=[0,1,255,256,65534,65535];
  for(const depth of [8,16])for(const first of values)for(const second of values)check(wrap(payload('Palette',depth,[[0,1,2,3,first],[4,5,6,7,second]])));
  for(let depth=0;depth<256;depth++)check(wrap(Buffer.from([75,0,depth])));
  for(const depth of [8,16])for(const count of [0,1,2,255,256,257,1024])assert.ok(check(wrap(payload('Palette',depth,Array.from({length:count},(_,i)=>[0,255,128,0,65535-i])))));
  for(const depth of [8,16])for(let field=0;field<5;field++)for(const value of (depth===8&&field<4?[0,1,127,128,254,255]:values)){const e=[0,0,0,0,0];e[field]=value;assert.ok(check(wrap(payload('K',depth,[e]))));}
  for(let length=0;length<=81;length++)check(wrap(payload('A'.repeat(length),8,[])));
  for(let b=0;b<256;b++)check(wrap(payload(Buffer.from([b]),8,[])));
  for(const name of [' A','A ','A  B','A\tB','A\0B'])assert.equal(check(wrap(payload(name,8,[]))),undefined);
  for(const depth of [8,16]){const base=payload('Name',depth,[[1,2,3,4,65535],[5,6,7,8,1]]);for(let size=0;size<base.length;size++)check(wrap(base.subarray(0,size)));for(let pos=0;pos<base.length;pos++)for(let b=0;b<256;b++){const raw=Buffer.from(base);raw[pos]=b;check(wrap(raw));mutations++;}}
  const a=chunk('sPLT',payload('A',8,[[255,0,1,0,0]])),b=chunk('sPLT',payload('a',16,[[65535,0,1,65535,0]])),again=chunk('sPLT',payload('A',16,[]));
  assert.ok(check(png(hd,a,b,id,end)));assert.equal(check(png(hd,a,b,again,id,end)),undefined);
  assert.equal(check(png(hd,id,a,end)),undefined);assert.equal(check(png(a,hd,id,end)),undefined);assert.equal(check(png(hd,id,end,a)),undefined);
  for(const color of [0,2,3,4,6]){const channels=({0:1,2:3,3:1,4:2,6:4})[color],h=chunk('IHDR',header(8,color)),data=chunk('IDAT',deflateSync(Buffer.alloc(1+channels))),plte=color===3?[chunk('PLTE',Buffer.from([0,0,0]))]:[];for(const before of [true,false]){const bytes=png(h,...(before?[a,...plte,b]:[...plte,a,b]),data,end);assert.ok(check(bytes));const p=pngPixelsEvidence(bytes),limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,bytes])),p.wire);}}
  const many=Array.from({length:1024},(_,i)=>chunk('sPLT',payload('Palette '+i,8,[])));assert.ok(check(png(hd,...many,id,end)));for(const index of [0,512,1023])assert.equal(check(png(hd,...many,many[index],id,end)),undefined);
  const shared='A'.repeat(78);assert.ok(check(png(hd,chunk('sPLT',payload(shared+'B',8,[])),chunk('sPLT',payload(shared+'C',16,[])),id,end)));
  const unknown=png(hd,a,chunk('vpAg',Buffer.from([1,2,3])),id,end);const stats=check(unknown);assert.equal(stats.readUInt32LE(32),1);assert.equal(stats.readUInt32LE(36),3);
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const bytes=Buffer.from(entry.content);if(!bytes.subarray(0,8).equals(signature))continue;const result=check(bytes);assert.ok(result);actualPng++;actualSuggested+=result.readUInt32LE(0);}
  assert.ok(check(png(hd,id,end)));return {accepted,rejected,mutations,actualPng,actualSuggested};
}
