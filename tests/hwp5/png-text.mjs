import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {textWire} from './png-text-evidence.mjs';
import {timestampWire} from './png-timestamp-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
export function pngTextEdges(call,cfb){
  let accepted=0,rejected=0,actualPng=0,actualTextChunks=0;
  const good=raw=>{const t=transparencyEvidence(pngStructureEvidence(raw)),p=pngPixelsEvidence(raw);
    assert.deepEqual(call(135,raw,raw.length),textWire(t));accepted++;
    const limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,raw])),p.wire);
    assert.deepEqual(call(134,raw),timestampWire(t));assert.throws(()=>call(135,raw,raw.length-1),/LimitExceeded/);rejected++;return t;};
  const bad=raw=>{assert.throws(()=>pngPixelsEvidence(raw));assert.throws(()=>call(135,raw));rejected++;};
  const hd=chunk('IHDR',header(8,0)),id=chunk('IDAT',deflateSync(Buffer.from([0,0]))),end=chunk('IEND');
  const tx=(key,text=Buffer.alloc(0))=>chunk('tEXt',Buffer.concat([Buffer.from(key),Buffer.from([0]),Buffer.from(text)]));
  for(let pos=0;pos<3;pos++)for(let value=0;value<256;value++){
    const key=Buffer.from('ABC');key[pos]=value;const valid=((value>=32&&value<=126)||value>=161)&&(value!==32||pos===1);
    (valid?good:bad)(png(hd,tx(key,'Body'),id,end));
    const body=Buffer.from('ABC');body[pos]=value;const bodyValid=value===10||(value>=32&&value<=126)||value>=160;
    (bodyValid?good:bad)(png(hd,id,tx('Key',body),end));
  }
  for(let length=0;length<=81;length++)(length>=1&&length<=79?good:bad)(png(hd,tx(Buffer.alloc(length,65)),id,end));
  for(const key of [' A','A ','A  B',' ','','A\tB'])bad(png(hd,tx(key),id,end));
  for(const raw of [Buffer.alloc(0),Buffer.from('Key'),Buffer.alloc(4096,65)])bad(png(hd,chunk('tEXt',raw),id,end));
  for(const size of [0,1,79,256,65536])good(png(hd,tx('Private Name',Buffer.alloc(size,255)),id,end));
  const repeated=[tx('Title','A'),tx('Title','B'),tx('title','C'),tx('Creation Time','not a date')];
  good(png(hd,...repeated,id,...repeated,end));
  good(png(hd,...Array.from({length:1024},()=>tx('K')),id,end));
  const all=[chunk('IHDR',header(1,3)),chunk('sBIT',Buffer.from([8,7,6])),chunk('PLTE',Buffer.alloc(3)),chunk('pHYs',Buffer.from([0,0,0,1,0,0,0,1,0])),chunk('tRNS',Buffer.from([0])),chunk('bKGD',Buffer.from([0])),chunk('hIST',Buffer.from([0,1])),chunk('tIME',Buffer.from([7,234,9,7,12,34,60])),chunk('vpAg',Buffer.from([1,2])),id,end];
  for(let i=1;i<all.length;i++){const parts=[...all];parts.splice(i,0,...repeated);const t=good(png(...parts));assert.equal(t.deferredChunks,1);assert.equal(t.deferredBytes,2);}
  // Unimplemented textual envelopes remain deferred; do not certify them as tEXt.
  const pending=good(png(hd,tx('K'),chunk('zTXt',Buffer.from([1,2])),chunk('iTXt',Buffer.from([3])),id,end));assert.equal(pending.deferredChunks,2);assert.equal(pending.deferredBytes,3);
  bad(png(tx('K'),hd,id,end));bad(png(hd,id,end,tx('K')));bad(png(hd,id,tx('K'),chunk('IDAT'),end));
  const corrupt=tx('K','text');corrupt[corrupt.length-1]^=1;bad(png(hd,corrupt,id,end));
  const whole=png(hd,tx('K','text'),id,end);for(let size=0;size<whole.length;size++)bad(whole.subarray(0,size));
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const raw=Buffer.from(entry.content);if(!raw.subarray(0,8).equals(signature))continue;const t=good(raw);actualPng++;actualTextChunks+=t.text.entries.length;}
  good(png(hd,id,end));return {accepted,rejected,actualPng,actualTextChunks};
}
