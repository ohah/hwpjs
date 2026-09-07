import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function iccExtent(bytes,limit=64*1024*1024){
  assert.ok(bytes.length<=limit&&bytes.length>=132);assert.equal(bytes.readUInt32BE(0),bytes.length);
  return iccWireMajor(bytes.subarray(0,128));
}
export function iccWireMajor(bytes){
  assert.equal(bytes.length,128);
  for(const b of bytes.subarray(8,10))assert.ok((b>>4)<=9&&(b&15)<=9);
  const major=(bytes[8]>>4)*10+(bytes[8]&15);assert.ok(major===2||major===4);assert.equal(bytes[10],0);assert.equal(bytes[11],0);assert.equal(bytes.toString('latin1',36,40),'acsp');return major;
}
export function iccDigest(bytes){const copy=Buffer.from(bytes);copy.fill(0,44,48);copy.fill(0,64,68);copy.fill(0,84,100);return createHash('md5').update(copy).digest();}
export function iccHeaderWire(bytes,limit){
  const major=iccExtent(bytes,limit),out=Buffer.alloc(148);bytes.copy(out,0,0,128);
  for(const at of [0,44,64,68,72,76])out.writeUInt32LE(bytes.readUInt32BE(at),at);
  for(let at=24;at<36;at+=2)out.writeUInt16LE(bytes.readUInt16BE(at),at);
  out.writeBigUInt64LE(bytes.readBigUInt64BE(56),56);out.set([major,bytes[9]>>4,bytes[9]&15,0],8);
  if(major===4){const digest=iccDigest(bytes),present=bytes.subarray(84,100).some(b=>b!==0);if(present)assert.deepEqual(bytes.subarray(84,100),digest);out.writeUInt32LE(present?2:1,128);digest.copy(out,132);}return out;
}
