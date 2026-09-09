import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {digest,imageSignature,previewImageEvidence,observePreviewFile,summarizePreviewEvidence} from './preview-image-evidence.mjs';
const header=()=>{const b=Buffer.alloc(256);b.write('HWP Document File');b.writeUInt32LE(0x05000307,32);return b;};
const containerMagic=Buffer.from([208,207,17,224,161,177,26,225]);

test('signatures are only exact prefixes, including every truncation and single-byte corruption',()=>{
  for (const [kind,bytes] of [['gif87a',Buffer.from('GIF87a')],['gif89a',Buffer.from('GIF89a')],['png',Buffer.from('89504e470d0a1a0a','hex')],['jpeg',Buffer.from([255,216])],['bmp',Buffer.from('BM')]]) {
    assert.equal(imageSignature(bytes),kind);
    assert.equal(imageSignature(Buffer.concat([bytes,Buffer.from([0,255])])),kind);
    for(let n=0;n<bytes.length;n++) assert.equal(imageSignature(bytes.subarray(0,n)),n?'unknown':'empty');
    for(let n=0;n<bytes.length;n++){const bad=Buffer.from(bytes);bad[n]^=1;assert.equal(imageSignature(bad),'unknown');}
    assert.equal(imageSignature(Buffer.concat([Buffer.of(0),bytes])),'unknown');
  }
  assert.equal(imageSignature(Buffer.from('gif89a')),'unknown');
  assert.throws(()=>imageSignature('BM'),TypeError);
});

test('absent, empty, storage and malformed host content are distinct',()=>{
  const fake=entry=>({findExact:path=>{assert.equal(path,'/PrvImage');return entry;}});
  assert.deepEqual(previewImageEvidence(fake(null)),{state:'absent'});
  assert.deepEqual(previewImageEvidence(fake({type:1})),{state:'invalid_kind',kind:1});
  const empty=previewImageEvidence(fake({type:2,content:Buffer.alloc(0)}));
  assert.equal(empty.signature,'empty');assert.equal(empty.bytes,0);assert.equal(empty.imageValidated,false);
  assert.throws(()=>previewImageEvidence(fake({type:2})),TypeError);
  assert.throws(()=>previewImageEvidence(fake({type:2,size:1})),TypeError);
  assert.throws(()=>previewImageEvidence(fake({type:2,size:1,content:Buffer.alloc(0)})),/StreamSizeMismatch/);
  assert.equal(previewImageEvidence(fake({type:2,size:0})).contentPresent,false);
  assert.equal(empty.contentPresent,true);
  // Signature-only data is intentionally reported as unvalidated, not rejected as a decoded image.
  const truncated=previewImageEvidence(fake({type:2,content:Buffer.from('GIF89a')}));
  assert.equal(truncated.signature,'gif89a');assert.equal(truncated.imageValidated,false);
});

test('real CFB exact root lookup ignores nested aliases and preserves case-insensitive identity',async()=>{
  const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
  const base=[{name:'Root Entry',kind:5},{name:'FileHeader',parent:0,content:header()},{name:'Other',parent:0,kind:1}];
  const gif=Buffer.from('GIF89a');
  try {
    for(const name of ['PrvImage','prvimage','PRVIMAGE']) {
      const bytes=cfb.write({nodes:[...base,{name,parent:0,content:gif},{name:'PrvImage',parent:2,content:Buffer.from('BM')}]});
      const r=observePreviewFile(cfb,bytes);
      assert.equal(r.state,'observed');assert.equal(r.preview.signature,'gif89a');assert.equal(r.preview.sha256,digest(gif));
    }
    const nested=observePreviewFile(cfb,cfb.write({nodes:[...base,{name:'PrvImage',parent:2,content:gif}]}));
    assert.equal(nested.preview.state,'absent');
    const storage=observePreviewFile(cfb,cfb.write({nodes:[...base,{name:'PrvImage',parent:0,kind:1}]}));
    assert.deepEqual(storage.preview,{state:'invalid_kind',kind:1});
    const empty=observePreviewFile(cfb,cfb.write({nodes:[...base,{name:'PrvImage',parent:0,content:Buffer.alloc(0)}]}));
    assert.equal(empty.preview.signature,'empty');
    const flagged=header();flagged.writeUInt32LE(6,36);
    const x=observePreviewFile(cfb,cfb.write({nodes:[base[0],{...base[1],content:flagged}]}));
    assert.equal(x.flags,6);assert.equal(x.state,'observed');
    // An unsupported document flag does not prevent raw CFB evidence or imply document support.
    for(const content of [Buffer.alloc(0),Buffer.alloc(40),Buffer.from('HWP Document File')]) {
      assert.equal(observePreviewFile(cfb,cfb.write({nodes:[base[0],{...base[1],content}]})).state,'unidentified_header');
    }
  } finally {cfb.close();}
});

test('known CFB rejection never swallows traps, JS bugs, new parser errors or lookup failures',()=>{
  for(const message of ['InvalidFat','InvalidRoot','InvalidUnusedEntry']) {
    let closed=0;
    const cfb={parse(){throw Error(message);},close(){closed++;}};
    assert.deepEqual(observePreviewFile(cfb,containerMagic),{state:'cfb_rejected',error:message});assert.equal(closed,1);
  }
  for(const error of [new WebAssembly.RuntimeError('InvalidFat'),new TypeError('InvalidRoot'),new RangeError('InvalidUnusedEntry'),Error('NewFailure')]) {
    let closed=0;
    assert.throws(()=>observePreviewFile({parse(){throw error;},close(){closed++;}},containerMagic),e=>e===error);assert.equal(closed,1);
  }
  let closed=0;
  assert.throws(()=>observePreviewFile({parse(){},findExact(){throw Error('InvalidFat');},close(){closed++;}},containerMagic),/InvalidFat/);assert.equal(closed,1);
  assert.deepEqual(observePreviewFile({parse(){assert.fail('not CFB');}},Buffer.from('PK')),{state:'non_cfb'});
});

test('aggregate separates corpus occurrences, unique files, unique streams and unsupported flags',()=>{
  const gif=Buffer.from('GIF89a'),preview=previewImageEvidence({findExact:()=>({type:2,content:gif})});
  const observed={state:'observed',version:0x05000307,flags:6,preview};
  const rows=[{sha256:'same',result:observed},{sha256:'same',result:observed},{sha256:'different',result:{...observed,flags:0}},{sha256:'empty',result:{...observed,preview:{state:'absent'}}},{sha256:'bad',result:{state:'cfb_rejected',error:'InvalidFat'}}];
  const r=summarizePreviewEvidence(rows);
  assert.equal(r.files,5);assert.equal(r.uniqueFiles,4);assert.equal(r.uniquePreviewStreams,1);assert.equal(r.flaggedFiles,3);
  assert.deepEqual(r.states,{observed:4,cfb_rejected:1});assert.deepEqual(r.previews,{stream:3,absent:1});
  assert.deepEqual(r.signatures.gif89a,{files:3,bytes:18,minBytes:6,maxBytes:6});
  assert.deepEqual(r.versions,{'5000307':4});
  assert.equal(summarizePreviewEvidence([]).files,0);
});
