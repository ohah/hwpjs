import test from 'node:test';
import assert from 'node:assert/strict';
import {observeChartContents as observe} from './chart-contents-evidence.mjs';

test('short prefixes do not invent a complete header',()=>{
 for(let length=0;length<16;length++)assert.equal(observe(Buffer.alloc(length)).firstWords,null);
 assert.deepEqual(observe(Buffer.alloc(16)).firstWords,[0,0,0,0]);
 const b=Buffer.from('00000100ec2e0000ec2e000060000000','hex');
 assert.deepEqual(observe(b).firstWords,[65536,12012,12012,96]);
});
test('marker offsets are observations independent of header values',()=>{
 for(const offset of [0,1,16,46,96,127]){
  const b=Buffer.alloc(offset+8,255);b.set(Buffer.from('VtChart\0'),offset);
  const r=observe(b);assert.equal(r.markers.VtChart,offset);assert.equal(r.markers.VtDataGrid,-1);
 }
});
test('markers require a terminator and report the first occurrence only',()=>{
 assert.equal(observe(Buffer.from('VtChart')).markers.VtChart,-1);
 assert.equal(observe(Buffer.from('VtChartX')).markers.VtChart,-1);
 assert.equal(observe(Buffer.from('vtChart\0')).markers.VtChart,-1);
 assert.equal(observe(Buffer.from('VtChart\0VtChart\0')).markers.VtChart,0);
});
test('binary evidence is detached and does not decode arbitrary text',()=>{
 const b=Buffer.from([0,255,128,1]);const r=observe(b);
 assert.equal(r.prefix,'00ff8001');assert.equal(r.bytes,4);
 b[0]=1;assert.notEqual(observe(b).sha256,r.sha256);assert.equal(r.prefix,'00ff8001');
 assert.ok(Object.values(r.markers).every(n=>n===-1));
});
