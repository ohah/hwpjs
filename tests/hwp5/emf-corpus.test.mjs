import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {decodeEmfReport,emfSignature,observeHwpEmf,summarizeEmfCorpus} from './emf-corpus-evidence.mjs';

function emf() {
  const b=Buffer.alloc(188);
  b.writeUInt32LE(1,0);b.writeUInt32LE(88,4);b.writeInt32LE(-1,8);b.writeInt32LE(20,20);
  b.writeUInt32LE(0x464d4520,40);b.writeUInt32LE(0x10000,44);b.writeUInt32LE(b.length,48);
  b.writeUInt32LE(7,52);b.writeUInt16LE(1,56);b.writeInt32LE(1920,72);b.writeInt32LE(1080,76);b.writeInt32LE(508,80);b.writeInt32LE(285,84);
  b.writeUInt32LE(49,88);b.writeUInt32LE(20,92);b.writeUInt32LE(1,96);b.writeUInt16LE(0x300,100);b.writeUInt16LE(1,102);b.set([0,30,20,10],104);
  b.writeUInt32LE(50,108);b.writeUInt32LE(24,112);b.writeUInt32LE(1,116);b.writeUInt32LE(0,120);b.writeUInt32LE(1,124);b.set([9,60,50,40],128);
  b.writeUInt32LE(51,132);b.writeUInt32LE(16,136);b.writeUInt32LE(1,140);b.writeUInt32LE(0x400,144);
  b.writeUInt32LE(48,148);b.writeUInt32LE(12,152);b.writeUInt32LE(1,156);
  b.writeUInt32LE(52,160);b.writeUInt32LE(8,164);
  b.writeUInt32LE(14,168);b.writeUInt32LE(20,172);b.writeUInt32LE(20,184);
  return b;
}

async function probes() {
  const module=await WebAssembly.compile(readFileSync('zig-out/bin/hwp5-probe.wasm'));
  const {exports:w}=await WebAssembly.instantiate(module,{});
  return {call(bytes,limit=64*1024*1024){const p=w.alloc(bytes.length);assert.ok(p);try{new Uint8Array(w.memory.buffer,p,bytes.length).set(bytes);if(!w.probe(337,p,bytes.length,limit))throw Error(Buffer.from(w.memory.buffer,w.error_ptr(),w.error_len()).toString());return Buffer.from(new Uint8Array(w.memory.buffer,w.result_ptr(),w.result_len()));}finally{w.free(p,bytes.length);w.close();}}};
}

function replaceFirstJpeg(cfb,source,decoded,extension='emf') {
  cfb.parse(source,{strict:true});const model=cfb.document();cfb.close();
  const doc=model.nodes.find(n=>n.parent===0&&n.name==='DocInfo'),plain=inflateRawSync(doc.content);
  const jpg=Buffer.from('jpg','utf16le'),at=plain.indexOf(jpg);assert.notEqual(at,-1);
  Buffer.from(extension,'utf16le').copy(plain,at);doc.content=deflateRawSync(plain);
  const parent=model.nodes.findIndex(n=>n.kind===1&&n.name==='BinData');
  const target=model.nodes.find(n=>n.parent===parent&&n.name==='BIN0001.jpg');assert.ok(target);
  target.name=`BIN0001.${extension}`;target.content=deflateRawSync(decoded);
  return cfb.write(model);
}

test('EMF signature and report framing reject near misses',()=>{
  const bytes=emf();assert.equal(emfSignature(bytes),true);
  for(let n=0;n<44;n++)assert.equal(emfSignature(bytes.subarray(0,n)),false);
  const bad=Buffer.from(bytes);bad[40]^=1;assert.equal(emfSignature(bad),false);
  assert.throws(()=>emfSignature('x'),TypeError);
  for(const report of [Buffer.alloc(0),Buffer.alloc(39),Buffer.alloc(41)])assert.throws(()=>decodeEmfReport(report),/InvalidEmfReport/);
});

test('real HWP CFB and compressed BinData carry EMF into the Zig validator',async()=>{
  const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),probe=await probes();
  try {
    const source=readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwp');
    const original=observeHwpEmf(cfb,source,b=>probe.call(b));
    assert.equal(original.state,'observed');assert.deepEqual(original.evidence.items,[]);
    const embedded=observeHwpEmf(cfb,replaceFirstJpeg(cfb,source,emf()),b=>probe.call(b));
    assert.equal(embedded.evidence.items.length,1);
    assert.equal(embedded.evidence.items[0].declared,true);
    assert.deepEqual(embedded.evidence.items[0].report,{
      records:7,handles:1,headerPaletteEntries:0,creates:1,deletes:0,paletteSelects:1,
      paletteUpdates:2,peakLive:1,finalLive:1,eofPaletteEntries:0,recordTypes:[1,49,50,51,48,52,14],
    });
    const summary=summarizeEmfCorpus([{result:embedded},{result:original}]);
    assert.equal(summary.validated,1);assert.deepEqual(summary.recordTypes,{'1':1,'14':1,'48':1,'49':1,'50':1,'51':1,'52':1});
  } finally {cfb.close();}
});

test('declared EMF without its exact signature survives the real HWP path as rejection evidence',async()=>{
  const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
  try {
    const source=readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwp');
    cfb.parse(source,{strict:true});const original=Buffer.from(cfb.findExact('/BinData/BIN0001.jpg').content);cfb.close();
    const result=observeHwpEmf(cfb,replaceFirstJpeg(cfb,source,inflateRawSync(original)),()=>assert.fail('invalid signature reached Zig parser'));
    assert.equal(result.evidence.binData,2);assert.equal(result.evidence.items.length,1);
    assert.deepEqual(result.evidence.items[0],{path:'/BinData/BIN0001.emf',extension:'emf',bytes:15895,signature:false,declared:true,error:'InvalidEmfSignature'});
    assert.equal(summarizeEmfCorpus([{result}]).declaredWithoutSignature,1);
  } finally {cfb.close();}
});
