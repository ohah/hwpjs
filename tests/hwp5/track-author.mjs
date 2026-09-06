import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {loadMemoDocument} from './memo-references.mjs';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p,extended=false)=>Buffer.concat([w(tag|(level<<10)|((extended?4095:p.length)<<20)),...(extended?[w(p.length)]:[]),p]);
export function trackAuthorEdges(call){
  let accepted=0,rejected=0;
  for(const version of [0x05000107,0x05000301,0x05000302,0x05010001]){
    const v=w(version);
    for(const extended of [false,true])for(const size of [0,1,18]){
      const p=Buffer.alloc(size,255),b=frame(97,1,p,extended),expected=Buffer.concat([w(97),w(b.length),b]);
      assert.deepEqual(call(4,Buffer.concat([v,b])),expected);accepted++;
      for(const level of [0,2,1023]){assert.throws(()=>call(4,Buffer.concat([v,frame(97,level,p,extended)])),/InvalidDocInfoLevel/);rejected++;assert.deepEqual(call(4,Buffer.concat([v,b])),expected);}
    }
    for(const n of [null,-1,0,1,2,0x7fffffff]){
      const m=Buffer.alloc(n===null?68:72);if(n!==null)m.writeInt32LE(n,68);
      const input=Buffer.concat([v,frame(17,0,m),frame(97,1,Buffer.alloc(1))]);
      if(n===null||n===1){assert.equal(call(7,input).readUInt32LE(12),1);accepted++;}
      else{assert.throws(()=>call(7,input),n<0?/NegativeMappingCount/:/ResourceCountMismatch/);rejected++;}
    }
  }
  return {accepted,rejected};
}
export function trackAuthorDocument(call,cfb){
  const actual=[];
  for(const [name,count] of [['issue5169_viewtext_changetracking.hwp',4],['task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp',1]]){
    const x=loadMemoDocument(call,cfb,name),rows=documentRecords(x.doc),m=rows.find(r=>r.tag===17),authors=rows.filter(r=>r.tag===97);assert.equal(authors.length,count);assert.equal(x.doc.readInt32LE(m.start+68),count);
    call(7,Buffer.concat([x.h.subarray(32,36),x.doc]));actual.push({name,count,sizes:authors.map(r=>r.end-r.start)});
  }
  const x=loadMemoDocument(call,cfb,'issue5169_viewtext_changetracking.hwp'),rs=documentRecords(x.doc),m=rs.find(r=>r.tag===17),authors=rs.filter(r=>r.tag===97),v=x.h.subarray(32,36);
  const input=doc=>decodedDocumentInput(x.h,doc,x.sections),original=call(24,input(x.doc)),whole=call(25,Buffer.concat([w(67108864),x.file]));let rejected=0;
  const reject=(doc,error)=>{
    const file=cfb.write({nodes:x.nodes.map(n=>n.parent===0&&n.name==='DocInfo'?{...n,content:x.h.readUInt32LE(36)&1?deflateRawSync(doc):doc}:n)});
    assert.throws(()=>call(7,Buffer.concat([v,doc])),error);assert.throws(()=>call(24,input(doc)),error);assert.throws(()=>call(25,Buffer.concat([w(67108864),Buffer.from(file)])),error);rejected+=3;
    assert.deepEqual(call(24,input(x.doc)),original);assert.deepEqual(call(25,Buffer.concat([w(67108864),x.file])),whole);
  };
  for(const n of [-1,0,3,5,0x7fffffff]){const b=Buffer.from(x.doc);b.writeInt32LE(n,m.start+68);reject(b,n<0?/NegativeMappingCount/:/ResourceCountMismatch/);}
  const a=authors[0];reject(Buffer.concat([x.doc.subarray(0,a.offset),x.doc.subarray(a.end)]),/ResourceCountMismatch/);
  reject(Buffer.concat([x.doc.subarray(0,a.offset),x.doc.subarray(a.offset,a.end),x.doc.subarray(a.offset)]),/ResourceCountMismatch/);
  for(const level of [0,2,1023]){const b=Buffer.from(x.doc);b.writeUInt32LE((b.readUInt32LE(a.offset)&~(1023<<10))|(level<<10),a.offset);reject(b,/InvalidDocInfoLevel/);}
  return {actual,rejected};
}
