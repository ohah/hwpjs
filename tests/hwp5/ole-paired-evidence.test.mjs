import test from 'node:test';
import assert from 'node:assert/strict';
import {pairedTarget} from './ole-paired-evidence.mjs';
const xml=Buffer.from('<chart style="smoothMarker"/>');
const candidates=()=>[{id:1,xml:Buffer.from('<chart style="smooth"/>')},{id:3,xml:Buffer.from(xml)}];
test('paired bytes select content rather than candidate position or an ID guess',()=>{
  assert.equal(pairedTarget(xml,Buffer.from(xml),candidates()),3);
  assert.equal(pairedTarget(xml,Buffer.from(xml),candidates().reverse()),3);
  for(const id of [1,2,17,65535]){
    const targets=[{id:99,xml:Buffer.from('different')},{id,xml:Buffer.from(xml)}];
    assert.equal(pairedTarget(xml,Buffer.from(xml),targets),id);
    assert.equal(pairedTarget(xml,Buffer.from(xml),targets.reverse()),id);
  }
});
test('missing ambiguous empty or disagreeing evidence must fail',()=>{
  for(const run of [
    ()=>pairedTarget(xml,xml,[]),
    ()=>pairedTarget(xml,xml,[...candidates(),{id:2,xml:Buffer.from(xml)}]),
    ()=>pairedTarget(Buffer.alloc(0),Buffer.alloc(0),[{id:1,xml:Buffer.alloc(0)}]),
    ()=>pairedTarget(xml,Buffer.from('different'),candidates()),
  ])assert.throws(run,e=>e.constructor===assert.AssertionError);
});
test('every byte of the selected XML participates in comparison',()=>{
  for(let i=0;i<xml.length;i++){
    const changed=Buffer.from(xml);changed[i]^=1;
    assert.throws(()=>pairedTarget(xml,xml,[{id:3,xml:changed}]),e=>e.constructor===assert.AssertionError);
  }
});
