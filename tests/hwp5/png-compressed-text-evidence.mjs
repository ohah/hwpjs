import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {keywordPrefixEvidence,latin1Evidence} from './png-text-evidence.mjs';
export function compressedTextEvidence({chunks},maxText=64*1024*1024) {
  const entries=[];let keywordBytes=0,textBytes=0,payloadBytes=0;
  for(const {name,payload} of chunks){if(name!=='zTXt')continue;
    const {key,remaining}=keywordPrefixEvidence(payload);assert.ok(remaining.length>=1);assert.equal(remaining[0],0);
    const budget=maxText-textBytes;assert.ok(budget>=0);
    const input=remaining.subarray(1),result=inflateSync(input,{info:true,maxOutputLength:Math.max(1,budget)});assert.equal(result.engine.bytesWritten,input.length);
    const text=result.buffer;assert.ok(text.length<=budget);latin1Evidence(text);entries.push({key,text});keywordBytes+=key.length;textBytes+=text.length;payloadBytes+=payload.length;
  }
  return {entries,keywordBytes,textBytes,payloadBytes};
}
export function compressedTextWire(structure,t,maxText=64*1024*1024) {
  const plain=t.text,z=t.compressedText;assert.ok(plain.textBytes+z.textBytes<=maxText);
  const head=Buffer.alloc(32);[plain.entries.length,plain.keywordBytes,plain.textBytes,z.entries.length,z.keywordBytes,z.textBytes,t.deferredChunks,t.deferredBytes].forEach((v,i)=>head.writeUInt32LE(v,i*4));
  let pi=0,zi=0;const records=[];
  for(const {name} of structure.chunks){if(name!=='tEXt'&&name!=='zTXt')continue;const isZ=name==='zTXt',v=isZ?z.entries[zi++]:plain.entries[pi++];const lengths=Buffer.alloc(12);lengths.writeUInt32LE(isZ?1:0);lengths.writeUInt32LE(v.key.length,4);lengths.writeUInt32LE(v.text.length,8);records.push(lengths,v.key,v.text);}
  return Buffer.concat([head,...records]);
}
