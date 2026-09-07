import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {deflateSync,deflateRawSync,gzipSync,constants} from 'node:zlib';
import {signature,png,pngChunk as chunk,pngHeader as header,pngStructureEvidence} from './png-structure-evidence.mjs';
import {transparencyEvidence} from './png-transparency-evidence.mjs';
import {textWire} from './png-text-evidence.mjs';
import {compressedTextWire} from './png-compressed-text-evidence.mjs';
import {compressedTextEvidence} from './png-compressed-text-evidence.mjs';
import {pngPixelsEvidence} from './png-pixels-evidence.mjs';
export function pngCompressedTextEdges(call,cfb){
  let accepted=0,rejected=0,actualPng=0,actualCompressedText=0;
  const input=(raw,limit)=>{const b=Buffer.alloc(4);b.writeUInt32LE(limit);return Buffer.concat([b,raw]);};
  const good=(raw,maxText)=>{const s=pngStructureEvidence(raw),t=transparencyEvidence(s),p=pngPixelsEvidence(raw),total=t.text.textBytes+t.compressedText.textBytes;
    maxText??=total;assert.deepEqual(call(136,input(raw,maxText),raw.length),compressedTextWire(s,t,maxText));accepted++;
    const limit=Buffer.alloc(4);limit.writeUInt32LE(p.decoded.length);assert.deepEqual(call(130,Buffer.concat([limit,raw])),p.wire);assert.deepEqual(call(135,raw),textWire(t));
    assert.throws(()=>call(136,input(raw,maxText),raw.length-1),/LimitExceeded/);rejected++;
    if(total){assert.throws(()=>call(136,input(raw,total-1)),/LimitExceeded/);rejected++;}return t;};
  const bad=(raw,maxText=64*1024*1024)=>{assert.throws(()=>{const s=pngStructureEvidence(raw);compressedTextWire(s,transparencyEvidence(s),maxText);});assert.throws(()=>call(136,input(raw,maxText)));rejected++;};
  const hd=chunk('IHDR',header(8,0)),id=chunk('IDAT',deflateSync(Buffer.from([0,0]))),end=chunk('IEND');
  const z=(body,method=0,key=Buffer.from('K'))=>chunk('zTXt',Buffer.concat([key,Buffer.from([0,method]),body]));
  const plain=chunk('tEXt',Buffer.from('K\0AB')),stream=deflateSync(Buffer.from('ABC'));
  for(let method=0;method<256;method++)(method===0?good:bad)(png(hd,z(stream,method),id,end));
  for(const options of [{level:0},{level:1},{level:6},{level:9},{strategy:constants.Z_FIXED},{strategy:constants.Z_HUFFMAN_ONLY},{strategy:constants.Z_RLE}])for(const size of [0,1,2,127,32769]){
    const body=Buffer.from(Array.from({length:size},(_,i)=>32+(i*17%95)));good(png(hd,id,z(deflateSync(body,options)),end));}
  for(let position=0;position<3;position++)for(let value=0;value<256;value++){
    const body=Buffer.from('ABC');body[position]=value;(value===10||(value>=32&&value<=126)||value>=160?good:bad)(png(hd,z(deflateSync(body)),id,end));}
  for(let length=0;length<=81;length++)(length>=1&&length<=79?good:bad)(png(hd,z(stream,0,Buffer.alloc(length,65)),id,end));
  for(const key of [' A','A ','A  B','A\tB','A\0B'])bad(png(hd,z(stream,0,Buffer.from(key)),id,end));
  for(const bytes of [Buffer.alloc(0),Buffer.from('K'),Buffer.from('K\0'),Buffer.from('K\0\0')])bad(png(hd,chunk('zTXt',bytes),id,end));
  for(let length=0;length<stream.length;length++)bad(png(hd,z(stream.subarray(0,length)),id,end));
  const checksum=Buffer.from(stream);checksum[checksum.length-1]^=1;
  for(const invalid of [checksum,Buffer.concat([stream,Buffer.from([0])]),Buffer.concat([stream,stream]),deflateRawSync(Buffer.from('ABC')),gzipSync(Buffer.from('ABC')),deflateSync(Buffer.from('ABC'),{dictionary:Buffer.from('ABC')})])bad(png(hd,z(invalid),id,end));
  for(const order of [[plain,z(stream)],[z(stream),plain]]){good(png(hd,...order,id,end),5);bad(png(hd,...order,id,end),4);}
  good(png(hd,z(deflateSync(Buffer.alloc(0))),plain,z(stream),id,z(stream),end));
  const large=deflateSync(Buffer.alloc(1024*1024,65));good(png(hd,z(large),id,end));bad(png(hd,z(large),id,end),1024);
  good(png(hd,...Array.from({length:128},()=>z(stream)),id,end));
  const budgetStructure=pngStructureEvidence(png(hd,z(stream),z(stream),id,end));
  assert.equal(compressedTextEvidence(budgetStructure,6).textBytes,6);
  assert.throws(()=>compressedTextEvidence(budgetStructure,5));
  assert.equal(compressedTextEvidence(pngStructureEvidence(png(hd,z(deflateSync(Buffer.alloc(0))),id,end)),0).textBytes,0);
  assert.throws(()=>compressedTextEvidence(pngStructureEvidence(png(hd,z(deflateSync(Buffer.from('A'))),id,end)),0));
  const all=[chunk('IHDR',header(1,3)),chunk('sBIT',Buffer.from([8,7,6])),chunk('PLTE',Buffer.alloc(3)),chunk('pHYs',Buffer.from([0,0,0,1,0,0,0,1,0])),chunk('tRNS',Buffer.from([0])),chunk('bKGD',Buffer.from([0])),chunk('hIST',Buffer.from([0,1])),chunk('tIME',Buffer.from([7,234,9,7,12,34,60])),chunk('vpAg',Buffer.from([1,2])),id,end];
  for(let i=1;i<all.length;i++){const parts=[...all];parts.splice(i,0,z(stream));const t=good(png(...parts));assert.equal(t.deferredChunks,1);assert.equal(t.deferredBytes,2);}
  bad(png(z(stream),hd,id,end));bad(png(hd,id,end,z(stream)));bad(png(hd,id,z(stream),chunk('IDAT'),end));
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});const entry=cfb.findExact('/PrvImage');if(!entry)continue;const raw=Buffer.from(entry.content);if(!raw.subarray(0,8).equals(signature))continue;const t=good(raw);actualPng++;actualCompressedText+=t.compressedText.entries.length;}
  good(png(hd,id,end),0);return {accepted,rejected,actualPng,actualCompressedText};
}
