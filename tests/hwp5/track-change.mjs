import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {loadMemoDocument} from './memo-references.mjs';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,p,extended=false)=>Buffer.concat([w(tag|(level<<10)|((extended?4095:p.length)<<20)),...(extended?[w(p.length)]:[]),p]);

export function trackChangeEdges(call){
  let accepted=0,rejected=0;
  for(const version of [0x05000107,0x05000301,0x05000302,0x05010001]){
    const v=w(version);
    for(const extended of [false,true])for(const tag of [32,96]){
      for(const size of tag===32?[1032,1033,1035]:[0,1,26,30]){
        const b=frame(tag,1,Buffer.alloc(size,0xad),extended),input=Buffer.concat([v,b]),expected=Buffer.concat([w(tag),w(b.length),b]);
        assert.deepEqual(call(4,input),expected);accepted++;
        for(const level of [0,2,1023]){
          assert.throws(()=>call(4,Buffer.concat([v,frame(tag,level,Buffer.alloc(size),extended)])),/InvalidDocInfoLevel/);rejected++;
          assert.deepEqual(call(4,input),expected);
        }
      }
      if(tag===32)for(let size=0;size<1032;size++){
        assert.throws(()=>call(4,Buffer.concat([v,frame(32,1,Buffer.alloc(size),extended)])),/UnexpectedEnd/);rejected++;
      }
    }
    for(const n of [null,-1,0,1,2,0x7fffffff]){
      const m=Buffer.alloc(n===null?64:68);if(n!==null)m.writeInt32LE(n,64);
      const input=Buffer.concat([v,frame(17,0,m),frame(96,1,Buffer.alloc(1))]);
      if(n===null||n===1){assert.equal(call(7,input).readUInt32LE(12),1);accepted++;}
      else{assert.throws(()=>call(7,input),n<0?/NegativeMappingCount/:/ResourceCountMismatch/);rejected++;}
    }
  }
  return {accepted,rejected};
}

export function trackChangeDocument(call,cfb){
  const actual=[];
  for(const [name,count] of [['issue5169_viewtext_changetracking.hwp',229],['task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp',1]]){
    const x=loadMemoDocument(call,cfb,name),rs=documentRecords(x.doc),m=rs.find(r=>r.tag===17),changes=rs.filter(r=>r.tag===96),infos=rs.filter(r=>r.tag===32);
    assert.equal(changes.length,count);assert.equal(x.doc.readInt32LE(m.start+64),count);
    for(const r of infos){assert.equal(r.end-r.start,1032);assert.equal((x.doc.readUInt32LE(r.offset)>>>10)&1023,1);}
    call(7,Buffer.concat([x.h.subarray(32,36),x.doc]));actual.push({name,count,infos:infos.length});
  }
  const x=loadMemoDocument(call,cfb,'issue5169_viewtext_changetracking.hwp'),rs=documentRecords(x.doc),m=rs.find(r=>r.tag===17),change=rs.find(r=>r.tag===96),info=rs.find(r=>r.tag===32),v=x.h.subarray(32,36);
  assert.ok(change&&info);
  const input=doc=>decodedDocumentInput(x.h,doc,x.sections),original=call(24,input(x.doc)),whole=call(25,Buffer.concat([w(67108864),x.file]));let rejected=0,accepted=0;
  const container=doc=>Buffer.concat([w(67108864),Buffer.from(cfb.write({nodes:x.nodes.map(n=>n.parent===0&&n.name==='DocInfo'?{...n,content:x.h.readUInt32LE(36)&1?deflateRawSync(doc):doc}:n)}))]);
  const recover=()=>{assert.deepEqual(call(24,input(x.doc)),original);assert.deepEqual(call(25,Buffer.concat([w(67108864),x.file])),whole);};
  const reject=(doc,error)=>{
    assert.throws(()=>call(7,Buffer.concat([v,doc])),error);assert.throws(()=>call(24,input(doc)),error);assert.throws(()=>call(25,container(doc)),error);rejected+=3;recover();
  };
  const replace=(r,p,level=1)=>Buffer.concat([x.doc.subarray(0,r.offset),frame(r.tag,level,p),x.doc.subarray(r.end)]);
  for(const n of [-1,0,228,230,0x7fffffff]){const b=Buffer.from(x.doc);b.writeInt32LE(n,m.start+64);reject(b,n<0?/NegativeMappingCount/:/ResourceCountMismatch/);}
  reject(Buffer.concat([x.doc.subarray(0,change.offset),x.doc.subarray(change.end)]),/ResourceCountMismatch/);
  reject(Buffer.concat([x.doc,x.doc.subarray(change.offset,change.end)]),/ResourceCountMismatch/);
  for(const r of [change,info])for(const level of [0,2,1023])reject(replace(r,x.doc.subarray(r.start,r.end),level),/InvalidDocInfoLevel/);
  for(const size of [0,1,4,1031])reject(replace(info,x.doc.subarray(info.start,info.start+size)),/UnexpectedEnd/);
  // Preserve arbitrary core bits and odd extension; do not normalize to rhwp's 56.
  for(const first of [0,56,60,0xffffffff]){
    const p=Buffer.concat([x.doc.subarray(info.start,info.end),Buffer.from([0xde,0xad,0xff])]);p.writeUInt32LE(first);
    const doc=replace(info,p);call(7,Buffer.concat([v,doc]));call(24,input(doc));call(25,container(doc));accepted++;recover();
  }
  return {actual,accepted,rejected};
}
