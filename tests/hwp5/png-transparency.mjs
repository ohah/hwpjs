import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
function parts(color,depth,entries=0) {
  const size=Math.ceil((({0:1,2:3,3:1,4:2,6:4})[color])*depth/8);
  return {h:chunk('IHDR',header(depth,color)),palette:entries?[chunk('PLTE',Buffer.alloc(entries*3))]:[],idat:chunk('IDAT',deflateSync(Buffer.alloc(1+size))),end:chunk('IEND')};
}
export function pngTransparencyEdges(call,cfb) {
  let accepted=0,rejected=0,actualPng=0,actualTransparency=0;
  const good=raw=>{const s=pngStructureEvidence(raw),e=transparencyEvidence(s);assert.deepEqual(call(131,raw,raw.length),e.wire);accepted++;
    const p=Buffer.alloc(4);p.writeUInt32LE(268435456);assert.deepEqual(call(130,Buffer.concat([p,raw])),pngPixelsEvidence(raw).wire);
    assert.throws(()=>call(131,raw,raw.length-1),/LimitExceeded/);rejected++;return e;};
  const bad=raw=>{const s=pngStructureEvidence(raw);assert.throws(()=>transparencyEvidence(s));assert.throws(()=>call(131,raw));rejected++;};
  for(const color of [0,2])for(const depth of color===0?[1,2,4,8,16]:[8,16]) {
    const p=parts(color,depth);
    good(png(p.h,p.idat,p.end));
    for(const raw of new Set([0,1,2,255,256,257,(2**depth)-1,Math.min(65535,2**depth),65535])) {
      const payload=Buffer.alloc(color===0?2:6);for(let i=0;i<payload.length;i+=2)payload.writeUInt16BE((raw+i*127)%65536,i);
      good(png(p.h,chunk('tRNS',payload),chunk('vpAg',Buffer.from('opaque metadata')),p.idat,p.end));
    }
    for(let size=0;size<=8;size++)if(size!==(color===0?2:6))bad(png(p.h,chunk('tRNS',Buffer.alloc(size)),p.idat,p.end));
    const valid=chunk('tRNS',Buffer.alloc(color===0?2:6));
    bad(png(p.h,valid,valid,p.idat,p.end));bad(png(p.h,p.idat,valid,p.end));
  }
  for(const depth of [1,2,4,8])for(const entries of new Set([1,2,1<<depth])) {
    const p=parts(3,depth,entries);good(png(p.h,...p.palette,p.idat,p.end));
    for(let size=0;size<=entries;size++)good(png(p.h,...p.palette,chunk('tRNS',Buffer.from(Array.from({length:size},(_,i)=>(i*127+size)%256))),p.idat,p.end));
    const trns=chunk('tRNS',Buffer.from([0]));
    bad(png(p.h,trns,...p.palette,p.idat,p.end));
    bad(png(p.h,...p.palette,chunk('tRNS',Buffer.alloc(entries+1)),p.idat,p.end));
    bad(png(p.h,...p.palette,chunk('tRNS'),chunk('tRNS'),p.idat,p.end));
  }
  for(const depth of [8,16]){
    const p=parts(2,depth,3),trns=chunk('tRNS',Buffer.from([255,1,128,2,64,3]));
    good(png(p.h,...p.palette,trns,p.idat,p.end));bad(png(p.h,trns,...p.palette,p.idat,p.end));
    for(const color of [4,6]){const alpha=parts(color,depth);for(const size of [0,2,6])bad(png(alpha.h,chunk('tRNS',Buffer.alloc(size)),alpha.idat,alpha.end));}
  }
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const bytes=Buffer.from(entry.content);if(!bytes.subarray(0,8).equals(signature))continue;const e=good(bytes);actualPng++;actualTransparency+=e.present;}
  const p=parts(0,16);good(png(p.h,chunk('tRNS',Buffer.from([0,1])),p.idat,p.end));
  return {accepted,rejected,actualPng,actualTransparency};
}
