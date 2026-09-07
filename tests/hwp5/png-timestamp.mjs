import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {timestampWire} from './png-timestamp-evidence.mjs';
import {sampleMetadataWire} from './png-sample-metadata-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
export function pngTimestampEdges(call,cfb) {
  let accepted=0,rejected=0,actualPng=0,actualTimestamp=0;
  const good=raw=>{const t=transparencyEvidence(pngStructureEvidence(raw)),p=pngPixelsEvidence(raw);
    assert.deepEqual(call(134,raw,raw.length),timestampWire(t));accepted++;
    const limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,raw])),p.wire);
    assert.deepEqual(call(133,raw),sampleMetadataWire(t));assert.throws(()=>call(134,raw,raw.length-1),/LimitExceeded/);rejected++;return t;};
  const bad=raw=>{assert.throws(()=>pngPixelsEvidence(raw));assert.throws(()=>call(134,raw));rejected++;};
  const hd=chunk('IHDR',header(8,0)),id=chunk('IDAT',deflateSync(Buffer.from([0,0]))),end=chunk('IEND');
  const base=Buffer.from([7,234,9,7,12,34,56]);
  for(let pos=2;pos<7;pos++)for(let value=0;value<256;value++){
    const b=Buffer.from(base);b[pos]=value;const min=pos<=3?1:0,max=[12,31,23,59,60][pos-2];
    (value>=min&&value<=max?good:bad)(png(hd,chunk('tIME',b),id,end));}
  for(const year of [0,1,95,255,256,1900,1995,2000,2026,32767,32768,65535]){const b=Buffer.from(base);b.writeUInt16BE(year);good(png(hd,id,chunk('tIME',b),end));}
  for(let size=0;size<10;size++)if(size!==7)bad(png(hd,id,chunk('tIME',Buffer.alloc(size)),end));
  const time=chunk('tIME',base);
  bad(png(hd,time,time,id,end));bad(png(hd,time,id,time,end));bad(png(hd,id,time,time,end));
  bad(png(time,hd,id,end));bad(png(hd,id,end,time));
  bad(png(hd,id,time,chunk('IDAT'),end)); // tIME does not relax consecutive IDAT.
  const damaged=Buffer.from(time);damaged[damaged.length-1]^=1;bad(png(hd,id,damaged,end));
  good(png(hd,chunk('tIME',Buffer.from([0,0,2,31,0,0,60])),id,end)); // component range contract, not calendar normalization
  const all=[chunk('IHDR',header(1,3)),chunk('sBIT',Buffer.from([8,7,6])),chunk('PLTE',Buffer.alloc(3)),chunk('pHYs',Buffer.from([0,0,0,1,0,0,0,1,0])),chunk('tRNS',Buffer.from([0])),chunk('bKGD',Buffer.from([0])),chunk('hIST',Buffer.from([0,1])),chunk('vpAg',Buffer.from([1,2])),id,end];
  for(let i=1;i<all.length;i++){const parts=[...all];parts.splice(i,0,time);const t=good(png(...parts));assert.equal(t.deferredChunks,1);assert.equal(t.deferredBytes,2);}
  const whole=png(hd,time,id,end);for(let i=0;i<whole.length;i++)bad(whole.subarray(0,i));
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const raw=Buffer.from(entry.content);if(!raw.subarray(0,8).equals(signature))continue;const t=good(raw);actualPng++;actualTimestamp+=t.timestamp?1:0;}
  good(png(hd,id,end));return {accepted,rejected,actualPng,actualTimestamp};
}
