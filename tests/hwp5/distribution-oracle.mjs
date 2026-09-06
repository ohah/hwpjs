import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv} from 'node:crypto';
import {deflateRawSync,inflateRawSync,crc32} from 'node:zlib';
export const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
// Independent BigInt arithmetic, Node AES and Node zlib; no product key helper.
function key(data){
  const d=Buffer.from(data);let state=BigInt(d.readUInt32LE(0)),mask=0,remaining=0;
  const rand=()=>{state=(state*214013n+2531011n)&0xffffffffn;return Number((state>>16n)&32767n);};
  for(let i=0;i<256;i++){if(remaining===0){mask=rand()&255;remaining=(rand()&15)+1;}if(i>=4)d[i]^=mask;remaining--;}
  const at=4+(d[0]&15);return d.subarray(at,at+16);
}
function aes(plain,k,decrypt){const c=decrypt?createDecipheriv('aes-128-ecb',k,null):createCipheriv('aes-128-ecb',k,null);c.setAutoPadding(false);return Buffer.concat([c.update(plain),c.final()]);}
export function envelope(data,ciphertext,extended=false){return Buffer.concat([word(28|((extended?4095:256)<<20)),...(extended?[word(256)]:[]),data,ciphertext]);}
export function makeDistribution(output,{seed=1,extended=false,mutate,compressed=true}={}){
  const data=Buffer.alloc(256);for(let i=4;i<256;i++)data[i]=(i*29+seed)&255;data.writeUInt32LE(seed>>>0);
  let plain;
  if(compressed){const zipped=deflateRawSync(output),aligned=Math.ceil(zipped.length/16)*16;plain=Buffer.alloc(aligned+32);plain.set(zipped);plain.writeUInt32LE(crc32(output),aligned);plain.writeUInt32LE(output.length,aligned+16);if(mutate)mutate(plain,zipped.length,aligned);}
  else{assert.equal(output.length%16,0);plain=Buffer.from(output);}
  return envelope(data,aes(plain,key(data),false),extended);
}
export function distributionOracle(raw){
  const bits=raw.readUInt32LE(0),start=bits>>>20===4095?8:4;
  assert.equal(bits&0xfffff,28);assert.equal(start===8?raw.readUInt32LE(4):bits>>>20,256);
  const data=raw.subarray(start,start+256),ciphertext=raw.subarray(start+256);assert.equal(ciphertext.length%16,0);
  const plain=aes(ciphertext,key(data),true),{buffer,engine}=inflateRawSync(plain,{info:true}),at=Math.ceil(engine.bytesWritten/16)*16;
  assert.equal(plain.length,at+32);assert.ok(plain.subarray(engine.bytesWritten,at).every(n=>n===0));
  assert.equal(plain.readUInt32LE(at),crc32(buffer));assert.equal(plain.readUInt32LE(at+16),buffer.length);
  assert.ok(plain.subarray(at+4,at+16).every(n=>n===0));assert.ok(plain.subarray(at+20).every(n=>n===0));
  return buffer;
}
