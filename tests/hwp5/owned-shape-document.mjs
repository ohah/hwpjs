import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { documentRecords,decodedDocumentInput } from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function ownedShapeDocument(call,cfb,config){
  const path=new URL(`../../reference/rhwp/samples/${config.file??'group-drawing-02.hwp'}`,import.meta.url);
  if(!existsSync(path))return {skipped:true};
  const file=readFileSync(path);cfb.parse(file,{strict:true});
  const h=Buffer.from(cfb.findExact('/FileHeader').content),v=h.readUInt32LE(32),flags=h.readUInt32LE(36);
  const decode=raw=>call(3,Buffer.concat([h,Buffer.from(raw)]));
  const doc=decode(cfb.findExact('/DocInfo').content),b=decode(cfb.findExact('/BodyText/Section0').content);
  const nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const input=bytes=>decodedDocumentInput(h,doc,[{index:0,bytes}]);
  const original=call(24,input(b));
  const expected=config.documentActual?config.documentActual(call,v,b,doc):config.actual(call,v,b);assert.equal(expected[config.countField??0],config.count);
  expected.forEach((n,i)=>assert.equal(original.readUInt32LE(sectionFieldOffset(0,config.group,i)),n));
  const cap=w(config.maxDecodedBytes??64*1024*1024),container=call(25,Buffer.concat([cap,file]));
  assert.deepEqual(container.subarray(0,original.length),original);
  const records=config.selectRecords?config.selectRecords(b):documentRecords(b).filter(r=>r.tag===config.tag);assert.equal(records.length,config.count);
  let rejected=0;
  const reject=(changed,error)=>{
    assert.throws(()=>config.run(call,v,changed),error);rejected++;
    assert.throws(()=>call(24,input(changed)),error);rejected++;
    const altered=nodes.map(n=>n.parent===body&&n.name==='Section0'?{...n,content:flags&1?deflateRawSync(changed):changed}:n);
    const rewritten=cfb.write({nodes:altered});
    assert.throws(()=>call(25,Buffer.concat([cap,Buffer.from(rewritten)])),error);rejected++;
    assert.deepEqual(call(24,input(b)),original);
    assert.deepEqual(call(25,Buffer.concat([cap,file])),container);
  };
  for(const r of records){
    const before=b.subarray(0,r.offset),after=b.subarray(r.end),end=config.subtreeEnd?config.subtreeEnd(b,r):r.end;
    const record=b.subarray(r.offset,end),afterSubtree=b.subarray(end);
    reject(Buffer.concat([before,afterSubtree]),config.missing);
    reject(Buffer.concat([before,record,record,afterSubtree]),config.duplicate);
    const short=(typeof config.minimum==='function'?config.minimum(b,r):config.minimum)-1,header=w((b.readUInt32LE(r.offset)&0xfffff)|(short<<20));
    reject(Buffer.concat([before,header,b.subarray(r.start,r.start+short),after]),/UnexpectedEnd/);
    for(const mutation of config.invalidMutations?.(b,r)??[])reject(mutation.bytes,mutation.error);
  }
  const orphan=b.subarray(records[0].start,records[0].end);
  reject(Buffer.concat([b,w(config.tag|(orphan.length<<20)),orphan]),config.orphan);
  const changed=config.mutateBody?config.mutateBody(b,records[0]):Buffer.from(b);
  if(!config.mutateBody)config.mutate(changed,records[0].start);
  const info=Buffer.from(doc),properties=documentRecords(info).find(r=>r.tag===16);info.writeUInt16LE(2,properties.start);
  const pair=[{index:0,bytes:b},{index:1,bytes:changed}];
  const check=sections=>call(24,decodedDocumentInput(h,info,sections));
  const canonical=check(pair);assert.deepEqual(check([...pair].reverse()),canonical);
  assert.equal(canonical.readUInt32LE(sectionFieldOffset(0,config.group,config.field)),0);
  assert.equal(canonical.readUInt32LE(sectionFieldOffset(1,config.group,config.field)),1);
  return {objects:config.count,rejected,ordering:1};
}
