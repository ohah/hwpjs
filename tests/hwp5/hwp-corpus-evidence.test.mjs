import assert from 'node:assert/strict';
import test from 'node:test';
import {observeHwpFile,streamBytes} from './hwp-corpus-evidence.mjs';
const magic=Buffer.from([208,207,17,224,161,177,26,225]);
function reader(){
  const raw=Buffer.alloc(40);raw.write('HWP Document File');raw.writeUInt32LE(0x05000304,32);raw.writeUInt32LE(1,36);
  return {closed:0,parsed:0,raw,parse(bytes,options){assert.ok(Buffer.isBuffer(bytes));assert.equal(options.strict,true);this.parsed++;},findExact(path){assert.equal(path,'/FileHeader');return {type:2,size:raw.length,content:raw};},close(){this.closed++;}};
}
test('shared corpus observation fingerprints only and always releases an opened reader',()=>{
  const cfb=reader(),evidence={fieldsValidated:false};
  assert.deepEqual(observeHwpFile(cfb,new Uint8Array(magic),()=>evidence),{state:'observed',version:0x05000304,flags:1,evidence});
  assert.equal(cfb.closed,1);assert.equal(cfb.parsed,1);
  for(const error of [new Error('InvalidFat'),new WebAssembly.RuntimeError('InvalidFat'),new TypeError('bug')]){
    assert.throws(()=>observeHwpFile(cfb,magic,()=>{throw error;}),e=>e===error);
  }
  assert.equal(cfb.closed,4);
});
test('shared corpus parser rejection excludes traps, subclasses, and unclassified parser errors',()=>{
  for(const name of ['InvalidFat','InvalidUnusedEntry','InvalidRoot']){
    const cfb=reader();cfb.parse=()=>{throw Error(name);};
    assert.deepEqual(observeHwpFile(cfb,magic,()=>assert.fail()),{state:'cfb_rejected',error:name});assert.equal(cfb.closed,1);
  }
  class CustomError extends Error{}
  for(const error of [new WebAssembly.RuntimeError('InvalidFat'),new CustomError('InvalidFat'),Error('NewError')]){
    const cfb=reader();cfb.parse=()=>{throw error;};assert.throws(()=>observeHwpFile(cfb,magic,()=>assert.fail()),e=>e===error);assert.equal(cfb.closed,1);
  }
});
test('shared corpus does not call an observer for non-CFB or unidentified headers',()=>{
  for(let length=0;length<8;length++){const cfb=reader();assert.deepEqual(observeHwpFile(cfb,magic.subarray(0,length),()=>assert.fail()),{state:'non_cfb'});assert.equal(cfb.parsed,0);assert.equal(cfb.closed,0);}
  for(const offset of [0,35]){const cfb=reader();cfb.raw[offset]=0;assert.deepEqual(observeHwpFile(cfb,magic,()=>assert.fail()),{state:'unidentified_header'});assert.equal(cfb.closed,1);}
});
test('shared stream snapshots never replace missing nonempty data with empty bytes',()=>{
  assert.deepEqual(streamBytes({size:0}),Buffer.alloc(0));
  assert.throws(()=>streamBytes({size:1}),TypeError);
  assert.throws(()=>streamBytes({size:2,content:Buffer.of(1)}),/^Error: StreamSizeMismatch$/);
  const bytes=Buffer.of(1);assert.equal(streamBytes({size:1,content:bytes}),bytes);
});
