import assert from 'node:assert/strict';
import test from 'node:test';
import {linkDocEvidence,docOptionsEvidence} from './doc-options-evidence.mjs';

test('DocOptions observations do not equate missing words, empty bytes and zero-filled bytes',()=>{
  assert.deepEqual(linkDocEvidence(Buffer.alloc(0)),{bytes:0,empty:true,allZero:false,nonzeroBytes:0,firstWord:null,firstZeroWord:null,nonzeroAfterFirstZeroWord:false,oddBytes:0,fieldsValidated:false});
  const single=linkDocEvidence(Buffer.of(0));assert.equal(single.firstWord,null);assert.equal(single.firstZeroWord,null);assert.equal(single.oddBytes,1);assert.equal(single.allZero,true);
  const zero=linkDocEvidence(Buffer.alloc(524));assert.equal(zero.firstWord,0);assert.equal(zero.firstZeroWord,0);assert.equal(zero.allZero,true);assert.equal(zero.empty,false);
});
test('DocOptions zero first word does not discard later nonzero data or invent an empty path',()=>{
  const raw=Buffer.alloc(524);raw[523]=65;
  const r=linkDocEvidence(raw);assert.equal(r.firstWord,0);assert.equal(r.nonzeroBytes,1);assert.equal(r.nonzeroAfterFirstZeroWord,true);assert.equal(r.fieldsValidated,false);
  assert.equal(Object.hasOwn(r,'path'),false);
});
test('DocOptions observations do not enforce the common 524-byte length or infer validity from another length',()=>{
  for(const length of [0,1,2,3,23,24,25,523,524,525]){
    const raw=Buffer.alloc(length,1),saved=Buffer.from(raw),r=linkDocEvidence(raw);
    assert.equal(r.bytes,length);assert.equal(r.nonzeroBytes,length);assert.equal(r.firstZeroWord,null);assert.equal(r.fieldsValidated,false);assert.deepEqual(raw,saved);
  }
});
test('DocOptions words are aligned little-endian and views do not include surrounding bytes',()=>{
  const raw=Buffer.from([255,1,0,0,2,0,0,3,255]);
  const r=linkDocEvidence(new Uint8Array(raw.buffer,raw.byteOffset+1,7));
  assert.equal(r.firstWord,1);assert.equal(r.firstZeroWord,4);assert.equal(r.nonzeroBytes,3);assert.equal(r.oddBytes,1);assert.equal(r.nonzeroAfterFirstZeroWord,true);
  for(const input of [null,undefined,[],{},'abc'])assert.throws(()=>linkDocEvidence(input),TypeError);
});
test('DocOptions structure, unknown children, empty streams and malformed snapshots remain distinct',()=>{
  const entries=new Map();const nodes=[{name:'Root Entry',kind:5},{name:'DocOptions',parent:0,kind:1},{name:'_LinkDoc',parent:1,kind:2},{name:'Future',parent:1,kind:2}];
  const cfb={findExact:path=>entries.get(path),document:()=>({nodes})};
  assert.deepEqual(docOptionsEvidence(cfb),{state:'absent'});
  entries.set('/DocOptions',{type:2});assert.deepEqual(docOptionsEvidence(cfb),{state:'invalid_kind',kind:2});
  entries.set('/DocOptions',{type:1,name:'DocOptions'});entries.set('/DocOptions/_LinkDoc',{type:2,size:0,name:'_LinkDoc'});entries.set('/DocOptions/PublicKeyInfo',{type:1,name:'PublicKeyInfo'});
  const r=docOptionsEvidence(cfb);assert.equal(r.state,'storage');assert.equal(r.unknownChildren,1);assert.equal(r.streams._LinkDoc.observed.empty,true);assert.equal(r.streams._LinkDoc.fieldsValidated,false);assert.deepEqual(r.streams.PublicKeyInfo,{state:'invalid_kind',kind:1});
  entries.set('/DocOptions/_LinkDoc',{type:2,size:1});assert.throws(()=>docOptionsEvidence(cfb),TypeError);
  entries.set('/DocOptions/_LinkDoc',{type:2,size:2,content:Buffer.of(0)});assert.throws(()=>docOptionsEvidence(cfb),/^Error: StreamSizeMismatch$/);
  nodes.splice(1);assert.throws(()=>docOptionsEvidence(cfb),/^Error: MissingDocOptionsSnapshot$/);
});
test('DocOptions uses CFB-resolved Unicode identities for storage and stream classification',async()=>{
  const {readFileSync}=await import('node:fs');
  const {createCfbReader}=await import('../../js/cfb.mjs');
  const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
  try{
    const bytes=cfb.write({nodes:[{name:'Root Entry',kind:5},{name:'DocOptionſ',parent:0,kind:1},{name:'_LinkDoc',parent:1,content:Buffer.alloc(0)},{name:'DrmLicenſe',parent:1,content:Buffer.of(1)},{name:'Future',parent:1,content:Buffer.of(2)}]});
    cfb.parse(Buffer.from(bytes),{strict:true});
    const r=docOptionsEvidence(cfb);assert.equal(r.state,'storage');assert.equal(r.unknownChildren,1);assert.equal(r.streams._LinkDoc.bytes,0);assert.equal(r.streams.DrmLicense.bytes,1);
  }finally{cfb.close();}
});
