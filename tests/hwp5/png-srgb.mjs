import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {srgbWire} from './png-srgb-evidence.mjs';
import {colorFixedWire} from './png-color-fixed-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
export function pngSrgbEdges(call,cfb){
  let accepted=0,rejected=0,mutations=0,actualPng=0,actualSrgb=0;
  const ints=values=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeUInt32BE(v,i*4));return b;};
  const gamma=ints([45455]),chroma=ints([31270,32900,64000,33000,30000,60000,15000,6000]);
  const g=chunk('gAMA',gamma),c=chunk('cHRM',chroma),s=chunk('sRGB',Buffer.from([0]));
  const h=chunk('IHDR',header(8,0)),id=chunk('IDAT',deflateSync(Buffer.from([0,0]))),end=chunk('IEND');
  const check=bytes=>{let t;try{t=transparencyEvidence(pngStructureEvidence(bytes));}catch{}
    if(t){const expected=srgbWire(t);assert.deepEqual(call(142,bytes,bytes.length),expected);assert.deepEqual(call(141,bytes,bytes.length),colorFixedWire(t));accepted++;assert.throws(()=>call(142,bytes,bytes.length-1),/LimitExceeded/);rejected++;return expected;}
    assert.throws(()=>call(142,bytes,bytes.length),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;};
  for(let intent=0;intent<256;intent++)check(png(h,chunk('sRGB',Buffer.from([intent])),id,end));
  for(let size=0;size<=8;size++)check(png(h,chunk('sRGB',Buffer.alloc(size)),id,end));
  const permutations=items=>items.length?items.flatMap((v,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]];
  for(const items of [[],[s],[s,g],[s,c],[s,g,c]])for(const order of permutations(items))assert.ok(check(png(h,...order,id,end)));
  for(const [name,base] of [['gAMA',gamma],['cHRM',chroma]])for(let pos=0;pos<base.length;pos++)for(let value=0;value<256;value++){
    const changed=Buffer.from(base);changed[pos]=value;const field=chunk(name,changed);
    for(const order of [[s,field],[field,s]])check(png(h,...order,id,end));mutations++;
  }
  const indexed=chunk('IHDR',header(8,3)),palette=chunk('PLTE',Buffer.alloc(3));
  for(const order of permutations([s,g,c,palette,id]))check(png(indexed,...order,end));
  for(const order of [[s,s],[s,g,s],[s,c,s]])assert.equal(check(png(h,...order,id,end)),undefined);
  for(const bytes of [png(h,id,s,end),png(s,h,id,end),png(h,id,end,s)])assert.equal(check(bytes),undefined);
  for(const color of [0,2,3,4,6])for(let intent=0;intent<4;intent++){
    const channels=({0:1,2:3,3:1,4:2,6:4})[color],hd=chunk('IHDR',header(8,color));
    const bytes=png(hd,chunk('sRGB',Buffer.from([intent])),g,c,...(color===3?[palette]:[]),chunk('IDAT',deflateSync(Buffer.alloc(1+channels))),end);
    assert.ok(check(bytes));const p=pngPixelsEvidence(bytes),limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,bytes])),p.wire);
  }
  // Unsupported profiles remain deferred: this suite does not certify their payloads.
  for(const other of ['iCCP','cICP','vpAg'])for(const order of [[s,chunk(other,Buffer.from([1,2]))],[chunk(other,Buffer.from([1,2])),s]]){
    const r=check(png(h,...order,id,end));assert.equal(r.readUInt32LE(16),1);assert.equal(r.readUInt32LE(20),1);assert.equal(r.readUInt32LE(24),2);
  }
  const absent=check(png(h,id,end));assert.equal(absent.readUInt32LE(0),0);assert.equal(absent.readUInt32LE(16),0);
  const alone=check(png(h,s,id,end));assert.equal(alone.readUInt32LE(0),1);assert.equal(alone.readUInt32LE(8),0);assert.equal(alone.readUInt32LE(12),0);assert.equal(alone.readUInt32LE(16),1);
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const bytes=Buffer.from(entry.content);if(!bytes.subarray(0,8).equals(signature))continue;const r=check(bytes);assert.ok(r);actualPng++;actualSrgb+=r.readUInt32LE(0);}
  assert.ok(check(png(h,s,id,end)));return {accepted,rejected,mutations,actualPng,actualSrgb};
}
