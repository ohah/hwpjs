import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {observedFixtureModule as emit} from './chart-native-fixture-module.mjs';
test('fixture module round-trips all byte values with inert Zig escapes and stable metadata',()=>{
 const bytes=Buffer.from(Array.from({length:256},(_,i)=>i)),counts=[0,1,65535],result=emit(bytes,counts);
 const literal=result.match(/^pub const bytes = "([^"]*)";\n/)[1];
 assert.match(literal,/^(\\x[0-9a-f]{2})+$/);
 assert.deepEqual(Buffer.from(literal.replaceAll('\\x',''),'hex'),bytes);
 assert(result.includes('[_]usize{0,1,65535}'));
 assert(result.includes(createHash('sha256').update(bytes).digest('hex')));
 assert.equal(emit(bytes,counts),result);
 bytes.fill(0);counts.fill(2);assert.notEqual(emit(bytes,counts),result);
});
test('fixture module rejects empty oversized unsafe sparse and injectable inputs',()=>{
 const bad=message=>e=>e.constructor===Error&&e.message===message;
 for(const b of [Buffer.alloc(0),Buffer.alloc(1024*1024+1)])assert.throws(()=>emit(b,[1]),bad('InvalidFixtureSize'));
 for(const counts of [[],Array(17).fill(0),Array(2),[1,,2],[-1],[65536],[0.5],[NaN],[Infinity],['1'],['}; @compileError("bad");'],null])
  assert.throws(()=>emit(Buffer.from([1]),counts),bad('InvalidFixtureCounts'));
 assert(emit(Buffer.from([1]),Array(16).fill(65535)).includes('65535'));
});
