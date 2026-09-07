import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {paletteMetadataWire} from './png-palette-metadata-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
function parts(color,depth,entries=0,width=1,sample=0) {
  const size=Math.ceil(width*({0:1,2:3,3:1,4:2,6:4})[color]*depth/8),data=Buffer.alloc(size+1);data[1]=sample;
  return {h:chunk('IHDR',header(depth,color,width,1)),palette:entries?[chunk('PLTE',Buffer.alloc(entries*3))]:[],idat:chunk('IDAT',deflateSync(data)),end:chunk('IEND')};
}
export function pngPaletteMetadataEdges(call,cfb) {
  let accepted=0,rejected=0,actualPng=0,actualBackground=0,actualHistogram=0;
  const good=raw=>{const s=pngStructureEvidence(raw),t=transparencyEvidence(s),p=pngPixelsEvidence(raw);assert.deepEqual(call(132,raw,raw.length),paletteMetadataWire(s,t));accepted++;
    const limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,raw])),p.wire);
    assert.deepEqual(call(131,raw),t.wire);assert.throws(()=>call(132,raw,raw.length-1),/LimitExceeded/);rejected++;return t.paletteMetadata;};
  const bad=raw=>{assert.throws(()=>pngPixelsEvidence(raw));assert.throws(()=>call(132,raw));rejected++;};
  for(const [color,depths] of [[0,[1,2,4,8,16]],[2,[8,16]],[4,[8,16]],[6,[8,16]]])for(const depth of depths) {
    const p=parts(color,depth),size=[0,4].includes(color)?2:6;
    for(const raw of [0,1,255,256,65535]){const values=Buffer.alloc(size);for(let i=0;i<size;i+=2)values.writeUInt16BE((raw+i*17)%65536,i);good(png(p.h,chunk('bKGD',values),p.idat,p.end));}
    for(let n=0;n<=8;n++)if(n!==size)bad(png(p.h,chunk('bKGD',Buffer.alloc(n)),p.idat,p.end));
    const bg=chunk('bKGD',Buffer.alloc(size));bad(png(p.h,bg,bg,p.idat,p.end));bad(png(p.h,p.idat,bg,p.end));
    bad(png(p.h,chunk('hIST',Buffer.from([0,1])),p.idat,p.end));
  }
  for(const depth of [1,2,4,8])for(const entries of new Set([1,1<<depth])) {
    const p=parts(3,depth,entries),frequencies=Buffer.alloc(entries*2);frequencies.writeUInt16BE(65535);
    const hist=chunk('hIST',frequencies),bg=chunk('bKGD',Buffer.from([entries-1])),trns=chunk('tRNS',Buffer.from([0]));
    for(const order of [[bg,hist,trns],[bg,trns,hist],[hist,bg,trns],[hist,trns,bg],[trns,bg,hist],[trns,hist,bg]])good(png(p.h,...p.palette,...order,chunk('vpAg',Buffer.from([1,2,3])),p.idat,p.end));
    for(const c of [bg,hist]){bad(png(p.h,c,...p.palette,p.idat,p.end));bad(png(p.h,...p.palette,p.idat,c,p.end));bad(png(p.h,...p.palette,c,c,p.idat,p.end));}
    for(const n of [0,entries*2-1,entries*2+1,entries*2+2])bad(png(p.h,...p.palette,chunk('hIST',Buffer.alloc(n)),p.idat,p.end));
    bad(png(p.h,...p.palette,chunk('hIST',Buffer.alloc(entries*2)),p.idat,p.end));
    if(entries<256)bad(png(p.h,...p.palette,chunk('bKGD',Buffer.from([entries])),p.idat,p.end));
    for(const size of [0,2])bad(png(p.h,...p.palette,chunk('bKGD',Buffer.alloc(size)),p.idat,p.end));
  }
  for(const color of [2,6])for(const depth of [8,16]){
    const p=parts(color,depth,2),hist=chunk('hIST',Buffer.alloc(4)),bg=chunk('bKGD',Buffer.alloc(6));
    good(png(p.h,...p.palette,bg,hist,p.idat,p.end)); // suggested palette usage is not an exact indexed mapping
    bad(png(p.h,bg,...p.palette,p.idat,p.end));
  }
  const histogram=chunk('hIST',Buffer.from([0,1,0,0]));
  for(const [width,sample,valid] of [[1,127,true],[2,127,false],[8,1,false],[8,0,true]]){const p=parts(3,1,2,width,sample),raw=png(p.h,...p.palette,histogram,p.idat,p.end);if(valid)good(raw);else bad(raw);}
  // 1x2 Adam7: the second row is in pass 7, not the first pass.
  const interlaced=last=>png(chunk('IHDR',header(1,3,1,2,1)),chunk('PLTE',Buffer.alloc(6)),histogram,chunk('IDAT',deflateSync(Buffer.from([0,0,0,last]))),chunk('IEND'));
  good(interlaced(127));bad(interlaced(128));
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const raw=Buffer.from(entry.content);if(!raw.subarray(0,8).equals(signature))continue;const m=good(raw);actualPng++;actualBackground+=m.kind!==0?1:0;actualHistogram+=m.frequencies!==null?1:0;}
  const p=parts(0,8);good(png(p.h,p.idat,p.end));return {accepted,rejected,actualPng,actualBackground,actualHistogram};
}
