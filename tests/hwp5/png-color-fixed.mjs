import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {colorFixedWire} from './png-color-fixed-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
export function pngColorFixedEdges(call,cfb){
  let accepted=0,rejected=0,mutations=0,actualPng=0,actualGamma=0,actualChroma=0;
  const ints=values=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeUInt32BE(v,i*4));return b;};
  const xy=[31270,32900,64000,33000,30000,60000,15000,6000],g=chunk('gAMA',ints([45455])),c=chunk('cHRM',ints(xy));
  const hd=chunk('IHDR',header(8,0)),id=chunk('IDAT',deflateSync(Buffer.from([0,0]))),end=chunk('IEND');
  const check=bytes=>{let expected;try{expected=colorFixedWire(transparencyEvidence(pngStructureEvidence(bytes)));}catch{}
    if(expected){assert.deepEqual(call(141,bytes,bytes.length),expected);accepted++;assert.throws(()=>call(141,bytes,bytes.length-1),/LimitExceeded/);rejected++;}
    else{assert.throws(()=>call(141,bytes,bytes.length),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;}return expected;};
  const boundary=[0,1,45455,99999,100000,100001,0x7ffffffe,0x7fffffff,0x80000000,0xffffffff];
  for(const value of boundary)check(png(hd,chunk('gAMA',ints([value])),id,end));
  for(let field=0;field<8;field++)for(const value of boundary){const values=[...xy];values[field]=value;check(png(hd,chunk('cHRM',ints(values)),id,end));}
  for(const [name,base] of [['gAMA',ints([45455])],['cHRM',ints(xy)]]){
    for(let len=0;len<=base.length+4;len++){const payload=Buffer.alloc(len);base.copy(payload);check(png(hd,chunk(name,payload),id,end));}
    for(let pos=0;pos<base.length;pos++)for(let value=0;value<256;value++){const payload=Buffer.from(base);payload[pos]=value;check(png(hd,chunk(name,payload),id,end));mutations++;}
  }
  for(const sequence of [[g,c],[c,g],[g],[c],[]])assert.ok(check(png(hd,...sequence,id,end)));
  for(const sequence of [[g,g],[c,c],[g,c,g],[c,g,c]])assert.equal(check(png(hd,...sequence,id,end)),undefined);
  const permutations=items=>items.length?items.flatMap((v,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]];
  const indexed=chunk('IHDR',header(8,3)),palette=chunk('PLTE',Buffer.alloc(3)),sbit=chunk('sBIT',Buffer.from([8,7,6]));
  for(const order of permutations([g,c,sbit,palette,id]))check(png(indexed,...order,end));
  for(const color of [0,2,3,4,6]){const channels=({0:1,2:3,3:1,4:2,6:4})[color],h=chunk('IHDR',header(8,color)),data=chunk('IDAT',deflateSync(Buffer.alloc(1+channels))),bytes=png(h,g,c,...(color===3?[palette]:[]),data,end);assert.ok(check(bytes));const p=pngPixelsEvidence(bytes),limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,bytes])),p.wire);}
  for(const item of [g,c]){assert.equal(check(png(hd,id,item,end)),undefined);assert.equal(check(png(item,hd,id,end)),undefined);assert.equal(check(png(hd,id,end,item)),undefined);}
  const pending=check(png(hd,g,c,chunk('vpAg',Buffer.from([1,2])),id,end));assert.equal(pending.readUInt32LE(44),1);assert.equal(pending.readUInt32LE(48),1);assert.equal(pending.readUInt32LE(52),2);
  const zero=check(png(hd,chunk('gAMA',ints([0])),chunk('cHRM',ints(Array(8).fill(0))),id,end));assert.equal(zero.readUInt32LE(0),1);assert.equal(zero.readUInt32LE(44),1);
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const bytes=Buffer.from(entry.content);if(!bytes.subarray(0,8).equals(signature))continue;const result=check(bytes);assert.ok(result);actualPng++;actualGamma+=result.readUInt32LE(0);actualChroma+=result.readUInt32LE(8);}
  assert.ok(check(png(hd,id,end)));return {accepted,rejected,mutations,actualPng,actualGamma,actualChroma};
}
