import test from 'node:test';
import assert from 'node:assert/strict';
import {observeGridTail as observe} from './chart-grid-tail-evidence.mjs';

function fixture(offset=0,typeId=8){
 const b=Buffer.alloc(offset+49,0xa5);
 b.writeUInt32LE(23,offset+26);b.writeUInt32LE(typeId,offset+30);
 b.writeUInt16LE(11,offset+34);b.set(Buffer.from('VtBackdrop\0'),offset+36);
 b.writeUInt16LE(1,offset+47);return b;
}
test('supplied offsets, sparse IDs, opaque bytes and detached results',()=>{
 for(const offset of [0,1,17,256])for(const id of [0,7,8,0xffffffff]){
  const b=fixture(offset,id),r=observe(b,offset);
  assert.equal(r.raw26,'a5'.repeat(26));
  assert.deepEqual(r.declaration,{objectId:23,typeId:id,nameHex:Buffer.from('VtBackdrop\0').toString('hex'),version:1,end:offset+49});
  b.fill(0);assert.equal(r.raw26,'a5'.repeat(26));assert.equal(r.declaration.objectId,23);
 }
});
test('every truncation remains incomplete, including huge/zero name lengths',()=>{
 const b=fixture();
 for(let end=0;end<b.length;end++)assert.equal(observe(b.subarray(0,end),0).declaration,null);
 for(const length of [0,65535]){const bad=Buffer.from(b);bad.writeUInt16LE(length,34);assert.equal(observe(bad,0).declaration,null);}
});
test('does not search for a later marker or validate unproven semantics',()=>{
 const b=fixture();b[36]=0xff;b[46]=0xff;b.writeUInt16LE(65535,47);
 const r=observe(Buffer.concat([b,fixture()]),0);
 assert.equal(r.declaration.nameHex,b.subarray(36,47).toString('hex'));
 assert.equal(r.declaration.version,65535);assert.equal(r.declaration.end,49);
 assert.equal(observe(Buffer.alloc(80),0).declaration,null);
});
test('invalid offsets are explicit caller errors, never accidental Buffer traps',()=>{
 for(const offset of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,50])
  assert.throws(()=>observe(fixture(),offset),e=>e.constructor===RangeError&&e.message==='InvalidObservationOffset');
 assert.equal(observe(fixture(),49).declaration,null);
});
