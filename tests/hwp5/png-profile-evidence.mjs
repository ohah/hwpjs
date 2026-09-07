import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {keywordPrefixEvidence} from './png-text-evidence.mjs';
export function profileEnvelopeWire(payload,maxProfile=64*1024*1024,limit=64*1024*1024){
  assert.ok(payload.length<=limit);const {key,remaining}=keywordPrefixEvidence(payload);assert.ok(remaining.length>0);assert.equal(remaining[0],0);
  const input=remaining.subarray(1),result=inflateSync(input,{info:true,maxOutputLength:Math.max(1,maxProfile)});assert.equal(result.engine.bytesWritten,input.length);assert.ok(result.buffer.length<=maxProfile);
  const sizes=Buffer.alloc(8);sizes.writeUInt32LE(key.length);sizes.writeUInt32LE(result.buffer.length,4);return Buffer.concat([sizes,key,result.buffer]);
}
