import assert from 'node:assert/strict';
import {bmpLayoutOracle,bmpPixelsOracle,bmpWords} from './bmp-oracle.mjs';
import {bmpRleOracle} from './bmp-rle-oracle.mjs';
export function bmpRleRgbaOracle(raw,{rleEnabled=1,fill=2,fileTrailing=false,...options}={}) {
  const v=bmpLayoutOracle(raw,{trailing:fileTrailing});
  const file=raw.subarray(0,raw.readUInt32LE(2));
  if(v.compression===0||v.compression===3){const old=bmpPixelsOracle(file);return Buffer.concat([old.subarray(0,16),Buffer.alloc(28),old.subarray(16)]);}
  assert.ok(rleEnabled);assert.ok([1,2].includes(v.compression));
  const indices=bmpRleOracle(file,options),written=indices.readUInt32LE(12),missing=indices.readUInt32LE(16);
  if(fill===0)assert.equal(missing,0);
  const rgba=Buffer.alloc(v.width*v.height*4);
  for(let i=0;i<rgba.length/4;i++) {
    let index=indices.readUInt16LE(32+i*2);
    if(index===256){if(fill===2)continue;assert.equal(fill,1);index=0;}
    const at=index*v.entry;assert.ok(at+v.entry<=v.palette.length);
    rgba.set([v.palette[at+2],v.palette[at+1],v.palette[at],255],i*4);
  }
  return Buffer.concat([bmpWords([v.width,v.height,rgba.length,1,1,fill,written,missing,indices.readUInt32LE(20),indices.readUInt32LE(24),indices.readUInt32LE(28)]),rgba]);
}
