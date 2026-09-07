import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {lastDocumentEvidence} from './history-last-document-evidence.mjs';
import {historyContainerEvidence} from './history-container-evidence.mjs';
import {historyContainerPrefix} from './history-container.mjs';
import {containerTotals} from './container-report-wire.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const frame=(b,tag=49)=>Buffer.concat([Buffer.from([tag]),w(b.length),b]);
const lastWire=e=>e?Buffer.concat([w(1),w(e.records),w(e.text_units)]):w(0);
export function historyLastDocumentEdges(call,cfb) {
  let accepted=0,rejected=0;
  const direct=(b,payload=67108864,records=1000000)=>call(116,Buffer.concat([w(payload),b]),records);
  const check=b=>{const e=lastDocumentEvidence(b);assert.deepEqual(direct(b,b.length-5,1),Buffer.concat([w(e.records),w(e.text_units),b]));accepted++;};
  for(const units of [0,1,2,127,256])check(frame(Buffer.alloc(units*2,0xd8)));
  check(frame(Buffer.from('<!DOCTYPE x SYSTEM "https://invalid.invalid/a"><x>&bad;</y>\0','utf16le')));
  for(let tag=0;tag<256;tag++)if(tag!==49){assert.throws(()=>direct(frame(Buffer.alloc(0),tag)),/InvalidHistoryLastDocumentTag/);rejected++;}
  const small=frame(Buffer.from('x\0','utf16le'));
  for(let n=0;n<small.length;n++){assert.throws(()=>direct(small.subarray(0,n)),n?/UnexpectedEnd/:/MissingHistoryLastDocument/);rejected++;}
  for(const bad of [frame(Buffer.from([0])),Buffer.concat([small,frame(Buffer.alloc(0))]),Buffer.concat([small,Buffer.from([49])])]){assert.throws(()=>direct(bad),/InvalidHistoryTextSize|ExtraHistoryLastDocumentRecord|UnexpectedEnd/);rejected++;}
  for(const [payload,records] of [[3,1],[4,0]]){assert.throws(()=>direct(small,payload,records),/LimitExceeded/);rejected++;}
  for(const size of [0x7fffffff,0x80000000,0xffffffff]){const b=Buffer.concat([Buffer.from([49]),w(size)]);assert.throws(()=>direct(b),/LimitExceeded/);assert.throws(()=>direct(b,0xffffffff),/UnexpectedEnd/);rejected+=2;}
  const file=readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url));cfb.parse(file,{strict:true});
  const model=cfb.document(),root=model.nodes.findIndex(n=>n.parent===0&&n.name==='DocHistory'),index=model.nodes.findIndex(n=>n.parent===root&&n.name==='HistoryLastDoc');assert.ok(index>=0);
  const raw=Buffer.from(model.nodes[index].content),plain=inflateRawSync(raw);assert.equal(raw.length,580758);assert.equal(plain.length,13184603);check(plain);
  const ordinary=bytes=>call(25,Buffer.concat([w(67108864),bytes]));
  const run=(bytes,o={},max=67108864)=>call(117,Buffer.concat([Buffer.from([o.last_document??1]),historyContainerPrefix(o),w(max),bytes]));
  const expected=(base,m,o={})=>{const e=historyContainerEvidence(base,m,{...o,last_document:o.last_document??1});return {...e,wire:Buffer.concat([e.wire,lastWire(e.lastDocument)])};};
  const base=ordinary(file),actual=expected(base,model),total=containerTotals(base).decoded_bytes+actual.decoded;
  assert.equal(actual.decoded,13292279);assert.equal(actual.records,29);assert.equal(actual.lastDocument.text_units,6592299);
  assert.deepEqual(run(file,{bytes:actual.decoded,records:29,payload:13184598},total),actual.wire);accepted++;
  assert.throws(()=>run(file,{},total-1),/LimitExceeded/);rejected++;
  const changed=(content,name='HistoryLastDoc')=>({...model,nodes:model.nodes.map((n,i)=>i===index?{...n,name,content}:n)});
  const tiny=changed(deflateRawSync(small)),tinyFile=cfb.write(tiny),tinyBase=ordinary(tinyFile),tinyExpected=expected(tinyBase,tiny);
  const recover=()=>assert.deepEqual(run(tinyFile),tinyExpected.wire);
  const verify=(m,o={})=>{const bytes=cfb.write(m),before=Buffer.from(bytes),b=ordinary(bytes),e=expected(b,m,o);assert.deepEqual(run(bytes,o),e.wire);assert.deepEqual(Buffer.from(bytes),before);accepted++;};
  verify(tiny);verify(tiny,{last_document:0});verify(tiny,{mode:0});verify(changed(Buffer.from([255]),'UnselectedLastDoc'));
  for(const o of [{bytes:tinyExpected.decoded-1},{records:28}]){assert.throws(()=>run(tinyFile,o),/LimitExceeded/);rejected++;recover();}
  for(const content of [deflateRawSync(frame(Buffer.from([0]))),deflateRawSync(frame(Buffer.alloc(0),16)),deflateRawSync(Buffer.concat([small,small])),deflateRawSync(small.subarray(0,6)),Buffer.from([255,255]),Buffer.concat([deflateRawSync(small),Buffer.alloc(8,255)])]){
    const m=changed(content),bytes=cfb.write(m);assert.throws(()=>run(bytes),/Invalid|UnexpectedEnd|ExtraHistoryLastDocumentRecord/);assert.deepEqual(run(bytes,{last_document:0}),expected(ordinary(bytes),m,{last_document:0}).wire);rejected++;recover();
  }
  verify({...tiny,nodes:tiny.nodes.map(n=>n.parent===root&&(/VersionLog/.test(n.name)||n.name==='HistoryLastDoc')?{...n,content:inflateRawSync(n.content)}:n)},{mode:1});
  assert.throws(()=>call(117,Buffer.from([2])),/InvalidMode/);rejected++;
  return {accepted,rejected,actual:{encoded:raw.length,decoded:plain.length,records:1,text_units:6592299,totalHistoryBytes:actual.decoded,totalHistoryRecords:actual.records}};
}
