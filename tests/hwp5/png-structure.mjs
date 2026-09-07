import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {signature,pngChunk as chunk,pngHeader as header,png,pngStructureEvidence} from './png-structure-evidence.mjs';
const prefix=(raw,count=65536,chunkBytes=16777216,pixels=100000000n)=>{const h=Buffer.alloc(16);h.writeUInt32LE(count);h.writeUInt32LE(chunkBytes,4);h.writeBigUInt64LE(pixels,8);return Buffer.concat([h,raw]);};
export function pngStructureEdges(call,cfb){
  let accepted=0,rejected=0;const corpus={files:0,absent:0,png:0,gif:0,jpeg:0,bmp:0,other:0};
  const good=raw=>{const e=pngStructureEvidence(raw);assert.deepEqual(call(126,prefix(raw,e.fields[5],e.maxChunk,e.pixels),raw.length),e.wire);accepted++;
    for(const args of [[prefix(raw),raw.length-1],[prefix(raw,e.fields[5]-1),raw.length],[prefix(raw,65536,e.maxChunk-1),raw.length],[prefix(raw,65536,16777216,e.pixels-1n),raw.length]]){assert.throws(()=>call(126,...args),/LimitExceeded/);rejected++;}return e;};
  const bad=raw=>{assert.throws(()=>pngStructureEvidence(raw));assert.throws(()=>call(126,prefix(raw)));rejected++;};
  const simple=png(chunk('IHDR',header()),chunk('IDAT',Buffer.from('not zlib')),chunk('IEND'));
  good(simple);good(png(chunk('IHDR',header()),chunk('vpAg'),chunk('IDAT'),chunk('IDAT'),chunk('vpag'),chunk('IEND')));
  for(const [color,depths] of [[0,[1,2,4,8,16]],[2,[8,16]],[3,[1,2,4,8]],[4,[8,16]],[6,[8,16]]])for(const depth of depths)for(const interlace of [0,1])good(png(chunk('IHDR',header(depth,color,1,1,interlace)),...(color===3?[chunk('PLTE',Buffer.from([0,0,0]))]:[]),chunk('IDAT'),chunk('IEND')));
  for(let end=0;end<simple.length;end++){assert.throws(()=>call(126,prefix(simple.subarray(0,end))));rejected++;}
  for(let i=0;i<simple.length;i++){const b=Buffer.from(simple);b[i]^=128;bad(b);}
  for(const body of [[],[chunk('IDAT'),chunk('IEND')],[chunk('IHDR',header()),chunk('IHDR',header()),chunk('IDAT'),chunk('IEND')],[chunk('IHDR',header()),chunk('IEND')],[chunk('IHDR',header()),chunk('IDAT')],[chunk('IHDR',header()),chunk('IDAT'),chunk('tEXt'),chunk('IDAT'),chunk('IEND')],[chunk('IHDR',header()),chunk('PLTE',Buffer.alloc(3)),chunk('PLTE',Buffer.alloc(3)),chunk('IDAT'),chunk('IEND')],[chunk('IHDR',header()),chunk('IDAT'),chunk('PLTE',Buffer.alloc(3)),chunk('IEND')],[chunk('IHDR',header()),chunk('IDAT'),chunk('IEND',Buffer.from([0]))],[chunk('IHDR',header()),chunk('ABCD'),chunk('IDAT'),chunk('IEND')],[chunk('IHDR',header()),chunk('ab1D'),chunk('IDAT'),chunk('IEND')]])bad(png(...body));
  for(const size of [0,2,769,771])bad(png(chunk('IHDR',header(8,3)),chunk('PLTE',Buffer.alloc(size)),chunk('IDAT'),chunk('IEND')));
  bad(png(chunk('IHDR',header(1,3)),chunk('PLTE',Buffer.alloc(9)),chunk('IDAT'),chunk('IEND')));
  for(const color of [0,4])bad(png(chunk('IHDR',header(8,color)),chunk('PLTE',Buffer.alloc(3)),chunk('IDAT'),chunk('IEND')));
  for(let end=0;end<16;end++){assert.throws(()=>call(126,Buffer.alloc(end)),/UnexpectedEnd/);rejected++;}
  const dir=new URL('../../legacy/rust/crates/hwp-core/tests/fixtures/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.hwp'))){cfb.parse(readFileSync(new URL(name,dir)),{strict:true});corpus.files++;const e=cfb.findExact('/PrvImage');if(!e){corpus.absent++;continue;}const raw=Buffer.from(e.content);if(raw.subarray(0,8).equals(signature)){good(raw);corpus.png++;}else if(['GIF87a','GIF89a'].includes(raw.subarray(0,6).toString()))corpus.gif++;else if(raw[0]===255&&raw[1]===216)corpus.jpeg++;else if(raw.subarray(0,2).toString()==='BM')corpus.bmp++;else corpus.other++;}
  good(simple);return {accepted,rejected,corpus,pixelsValidated:false};
}
