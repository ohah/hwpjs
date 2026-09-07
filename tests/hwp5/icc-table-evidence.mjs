import assert from 'node:assert/strict';
import {crc32} from 'node:zlib';
import {iccExtent} from './icc-header-evidence.mjs';
export function iccTableWire(bytes,policy,maxTags=100000,limit=64*1024*1024){
  iccExtent(bytes,limit);assert.ok(policy===0||policy===1);const count=bytes.readUInt32BE(128),end=132+12*count;assert.ok(count<=maxTags&&end<=bytes.length);
  const tags=[],names=new Set();for(let i=0;i<count;i++){
    const at=132+i*12,name=bytes.subarray(at,at+4),offset=bytes.readUInt32BE(at+4),size=bytes.readUInt32BE(at+8);assert.ok(!names.has(name.toString('hex')));names.add(name.toString('hex'));
    assert.ok(offset>=end&&offset%4===0&&size>=8&&offset+size<=bytes.length);const data=bytes.subarray(offset,offset+size);assert.ok(data.subarray(4,8).every(b=>b===0));tags.push({name,offset,size,data});
  }
  // Independent byte-occupancy reference, not the product's interval cursor.
  const used=new Uint8Array(bytes.length-end),groups=new Map();let shared=0,overlaps=0,padding=0;
  for(const tag of tags){const key=`${tag.offset}:${tag.size}`;if(groups.has(key))shared++;else groups.set(key,tag);}
  for(const tag of [...groups.values()].sort((a,b)=>a.offset-b.offset||a.size-b.size)){
    const start=tag.offset-end,stop=start+tag.size,overlap=used.subarray(start,stop).some(Boolean);if(policy===1)assert.ok(!overlap);else overlaps+=Number(overlap);
    used.fill(1,start,stop);
    if(policy===1){const pad=(4-tag.size%4)%4;assert.ok(stop+pad<=used.length);assert.ok(bytes.subarray(tag.offset+tag.size,tag.offset+tag.size+pad).every(b=>b===0));used.fill(1,stop,stop+pad);padding+=pad;}
  }
  const gaps=used.reduce((n,b)=>n+Number(b===0),0);if(policy===1)assert.equal(gaps,0);
  const out=Buffer.alloc(32+count*20);[count,end,groups.size,shared,overlaps,policy?padding:gaps,padding,policy].forEach((v,i)=>out.writeUInt32LE(v,i*4));
  tags.forEach((tag,i)=>{const at=32+i*20;tag.name.copy(out,at);out.writeUInt32LE(tag.offset,at+4);out.writeUInt32LE(tag.size,at+8);tag.data.copy(out,at+12,0,4);out.writeUInt32LE(crc32(tag.data),at+16);});return out;
}
