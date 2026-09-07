import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
import {historyContainerEvidence} from './history-container-evidence.mjs';
import {containerTotals} from './container-report-wire.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const prefix=(o={})=>Buffer.concat([Buffer.from([o.mode??2,o.start??1,o.date??1]),...[o.items??4096,o.bytes??67108864,o.records??1000000,o.payload??67108864].map(w)]);
export function historyContainerActual(call,cfb) {
  const file=readFileSync(new URL('../../reference/rhwp/samples/basic/treatise sample.hwp',import.meta.url));cfb.parse(file,{strict:true});
  const original=cfb.document(),root=original.nodes.findIndex(n=>n.name==='DocHistory'&&n.parent===0);assert.ok(root>=0);
  const logs=original.nodes.map((n,i)=>[n,i]).filter(([n])=>n.parent===root&&/^VersionLog[0-9]+$/.test(n.name));assert.equal(logs.length,4);
  const ordinary=(bytes,max=67108864,records=1000000)=>call(25,Buffer.concat([w(max),bytes]),records);
  const run=(bytes,o={},max=67108864,records=1000000)=>call(114,Buffer.concat([prefix(o),w(max),bytes]),records);
  const base=ordinary(file),e=historyContainerEvidence(base,original);let accepted=0,rejected=0;
  const check=(model=original,o={},bytes=cfb.write(model))=>{const before=Buffer.from(bytes),b=ordinary(bytes),expected=historyContainerEvidence(b,model,o);assert.deepEqual(run(bytes,o),expected.wire);assert.deepEqual(run(bytes,{...o,mode:0}),Buffer.concat([b,w(0)]));assert.deepEqual(Buffer.from(bytes),before);accepted++;return {bytes,base:b,expected};};
  check(original,{},file);assert.equal(e.decoded,107676);assert.equal(e.records,28);
  assert.deepEqual(e.entries.map(x=>[x[0],x[3]]),[[0,109],[1,6505],[2,19885],[3,81177]]);
  const total=containerTotals(base).decoded_bytes+e.decoded,recordTotal=base.readUInt32LE(16)+28;
  assert.deepEqual(run(file,{items:4,bytes:e.decoded,records:28},total,recordTotal),e.wire);accepted++;
  const reject=(bytes,o,error,max=67108864,records=1000000)=>{assert.throws(()=>run(bytes,o,max,records),error);rejected++;assert.deepEqual(run(file),e.wire);};
  for(const o of [{items:3},{bytes:e.decoded-1},{records:27},{payload:0}])reject(file,o,/LimitExceeded/);
  reject(file,{},/LimitExceeded/,total-1);reject(file,{},/LimitExceeded/,total,recordTotal-1);
  reject(file,{start:0},/HistoryPresenceMismatch/);
  reject(file,{mode:1},/UnexpectedEnd|LimitExceeded|MissingHistoryStart/);
  check(original,{date:0},file);
  const changed=(index,patch)=>({...original,nodes:original.nodes.map((n,i)=>i===index?{...n,...patch}:n)});
  const last=logs.at(-1)[1],encoded=Buffer.from(original.nodes[last].content),corrupt=Buffer.from(encoded);corrupt[corrupt.length-8]^=1;
  for(const content of [corrupt,encoded.subarray(0,encoded.length-1),Buffer.from([0xff,0xff])]){
    const model=changed(last,{content}),bytes=cfb.write(model);reject(bytes,{},/InvalidChecksum|TrailingData|UnexpectedEnd|Invalid/);assert.deepEqual(run(bytes,{mode:0}),Buffer.concat([ordinary(bytes),w(0)]));
  }
  for(const name of ['VersionLog','VersionLog00','VersionLog-1','VersionLog4294967296'])reject(cfb.write(changed(last,{name})),{},/InvalidHistoryStreamName/);
  reject(cfb.write(changed(last,{kind:1,content:undefined})),{},/InvalidHwpEntryKind/);
  const rawModel={...original,nodes:original.nodes.map((n,i)=>logs.some(([,j])=>i===j)?{...n,content:inflateRawSync(n.content)}:n)};
  check(rawModel,{mode:1}); // History codec is independent of FileHeader.compressed.
  let payloadMax=0;
  const specModel={...original,nodes:original.nodes.map((n,i)=>{
    if(!logs.some(([,j])=>i===j))return n;
    const plain=inflateRawSync(n.content);
    for(let at=0;at<plain.length;){const len=plain.readUInt32LE(at+1);payloadMax=Math.max(payloadMax,len);at+=5+len;}
    return {...n,content:deflateRawSync(Buffer.concat([plain.subarray(0,5),plain.subarray(9,11),plain.subarray(5,9),plain.subarray(11)]))};
  })};
  check(specModel,{start:0});check(original,{payload:payloadMax},file);reject(file,{payload:payloadMax-1},/LimitExceeded/);
  const datePlain=inflateRawSync(original.nodes[last].content);let dateAt=0;
  while(datePlain[dateAt]!==33)dateAt+=5+datePlain.readUInt32LE(dateAt+1);
  const invalidDate=Buffer.from(datePlain);invalidDate.writeUInt16LE(13,dateAt+7);
  check(changed(last,{content:deflateRawSync(invalidDate)}));
  const dateSize=datePlain.readUInt32LE(dateAt+1),missingDate=Buffer.concat([datePlain.subarray(0,dateAt+1),w(0),datePlain.subarray(dateAt+5+dateSize)]);
  const missingDateModel=changed(last,{content:deflateRawSync(missingDate)});
  reject(cfb.write(missingDateModel),{},/UnexpectedEnd/);check(missingDateModel,{date:0});
  const short=Buffer.from(inflateRawSync(original.nodes[last].content)).subarray(0,3);
  reject(cfb.write(changed(last,{content:deflateRawSync(short)})),{},/UnexpectedEnd/);
  // Canonical numeric ordering, sparse indices, case folding, distinct per-item sizes.
  const names=['VersionLog4294967295','versionlog10','VersionLog2','VERSIONLOG0'];
  check({...original,nodes:original.nodes.map((n,i)=>{const j=logs.findIndex(([,k])=>k===i);return j<0?n:{...n,name:names[j]};})});
  // Moving the whole storage retains its children but removes the recognized root.
  check(changed(root,{name:'UnselectedHistory'}),{items:0,bytes:0,records:0});
  const absent={...original,nodes:original.nodes.map((n,i)=>i===root?{...n,name:'Elsewhere'}:n)};
  reject(cfb.write({...absent,nodes:[...absent.nodes,{name:'DocHistory',parent:0,kind:2,content:Buffer.from([1])}]}),{},/InvalidHwpEntryKind/);
  const lastDoc=original.nodes.findIndex(n=>n.parent===root&&n.name==='HistoryLastDoc');assert.ok(lastDoc>=0);
  check(changed(lastDoc,{content:Buffer.from([0xff,1,2])})); // Remains opaque/unconsumed.
  reject(cfb.write(changed(lastDoc,{kind:1,content:undefined})),{},/InvalidHwpEntryKind/);
  const nestedRoot=original.nodes.length;
  check({...original,nodes:[...original.nodes,{name:'Future',parent:root,kind:1},{name:'VersionLog',parent:nestedRoot,kind:2,content:Buffer.from([255])},{name:'Unrecognized',parent:root,kind:2,content:Buffer.from([255])}]});
  check({...original,nodes:[...original.nodes,{name:'VersionLog0',parent:0,kind:2,content:Buffer.from([255])}]});
  const headerNode=original.nodes.findIndex(n=>n.parent===0&&n.name==='FileHeader'),header=Buffer.from(original.nodes[headerNode].content);header.writeUInt32LE(header.readUInt32LE(36)&~64,36);check(changed(headerNode,{content:header}));
  // BodyText + ViewText + history share the global record budget.
  assert.ok(!original.nodes.some(n=>n.parent===0&&n.name==='ViewText'));
  const bodyRoot=original.nodes.findIndex(n=>n.parent===0&&n.name==='BodyText'),body=original.nodes.find(n=>n.parent===bodyRoot&&n.name==='Section0');assert.ok(body);
  const viewRoot=original.nodes.length,withView={...original,nodes:[...original.nodes,{name:'ViewText',kind:1,parent:0},{name:'Section0',kind:2,parent:viewRoot,content:body.content}]};
  const v=check(withView),viewRecords=documentRecords(inflateRawSync(body.content)).length,global=v.base.readUInt32LE(16)+viewRecords+28;
  assert.deepEqual(run(v.bytes,{},67108864,global),v.expected.wire);reject(v.bytes,{},/LimitExceeded/,67108864,global-1);
  return {accepted,rejected,actual:{items:4,decoded:e.decoded,records:e.records,indices:e.entries.map(x=>x[0])},globalRecordsWithView:global};
}
