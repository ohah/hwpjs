import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {sampleMetadataWire} from './png-sample-metadata-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
export function pngSampleMetadataEdges(call,cfb) {
  let accepted=0,rejected=0,actualPng=0,actualPhysical=0,actualSignificant=0;
  const good=raw=>{const t=transparencyEvidence(pngStructureEvidence(raw)),p=pngPixelsEvidence(raw);
    assert.deepEqual(call(133,raw,raw.length),sampleMetadataWire(t));accepted++;
    const limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,raw])),p.wire);
    assert.deepEqual(call(131,raw),t.wire);assert.throws(()=>call(133,raw,raw.length-1),/LimitExceeded/);rejected++;return t;};
  const bad=raw=>{assert.throws(()=>pngPixelsEvidence(raw));assert.throws(()=>call(133,raw));rejected++;};
  const end=chunk('IEND'),data=chunk('IDAT',deflateSync(Buffer.from([0,0]))),h=chunk('IHDR',header(8,0));
  const phys=(x,y,u)=>{const b=Buffer.alloc(9);b.writeUInt32BE(x);b.writeUInt32BE(y,4);b[8]=u;return chunk('pHYs',b);};
  for(let unit=0;unit<256;unit++)(unit<=1?good:bad)(png(h,phys(0,0,unit),data,end));
  for(const axis of [0,1,3780,0x7fffffff,0x80000000,0xffffffff])for(const pair of [[axis,1],[1,axis]])(axis<2**31?good:bad)(png(h,phys(...pair,1),data,end));
  for(let size=0;size<=11;size++)if(size!==9)bad(png(h,chunk('pHYs',Buffer.alloc(size)),data,end));
  const ph=phys(3780,7560,1);bad(png(h,ph,ph,data,end));bad(png(h,data,ph,end));
  for(const [color,depths] of [[0,[1,2,4,8,16]],[2,[8,16]],[3,[1,2,4,8]],[4,[8,16]],[6,[8,16]]])for(const depth of depths){
    const count=({0:1,2:3,3:3,4:2,6:4})[color],max=color===3?8:depth;
    const hd=chunk('IHDR',header(depth,color)),pl=color===3?[chunk('PLTE',Buffer.alloc(3))]:[];
    const row=Buffer.alloc(1+Math.ceil((color===3?1:count)*depth/8)),id=chunk('IDAT',deflateSync(row));
    const values=Buffer.from(Array.from({length:count},(_,i)=>Math.max(1,max-i))),sb=chunk('sBIT',values);
    good(png(hd,sb,ph,...pl,id,end));good(png(hd,ph,sb,...pl,id,end));
    for(let position=0;position<count;position++)for(let value=0;value<256;value++){
      const b=Buffer.from(values);b[position]=value;(value>0&&value<=max?good:bad)(png(hd,chunk('sBIT',b),...pl,id,end));}
    for(let length=0;length<=5;length++)if(length!==count)bad(png(hd,chunk('sBIT',Buffer.alloc(length,1)),...pl,id,end));
    bad(png(hd,sb,sb,...pl,id,end));bad(png(hd,...pl,id,sb,end));
    if(color===3){bad(png(hd,...pl,sb,id,end));
      const combined=good(png(hd,sb,...pl,ph,chunk('tRNS',Buffer.from([0])),chunk('bKGD',Buffer.from([0])),chunk('hIST',Buffer.from([0,1])),chunk('vpAg',Buffer.from([7,8])),id,end));
      assert.equal(combined.deferredChunks,1);assert.equal(combined.deferredBytes,2);}
    if(color===2||color===6){const palette=chunk('PLTE',Buffer.alloc(3));good(png(hd,sb,palette,ph,id,end));bad(png(hd,palette,sb,id,end));}
  }
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const raw=Buffer.from(entry.content);if(!raw.subarray(0,8).equals(signature))continue;const m=good(raw).sampleMetadata;actualPng++;actualPhysical+=m.physical?1:0;actualSignificant+=m.bits?1:0;}
  good(png(h,data,end));return {accepted,rejected,actualPng,actualPhysical,actualSignificant};
}
