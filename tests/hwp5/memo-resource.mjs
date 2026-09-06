import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,b,extended=false)=>Buffer.concat([w(tag|(level<<10)|((extended?4095:b.length)<<20)),...(extended?[w(b.length)]:[]),b]);
export function memoResourceEdges(call){
  let accepted=0,rejected=0;
  for(const version of [0x05000107,0x05000201,0x05010001]){
    const p=Buffer.alloc(25,255),v=w(version);
    for(const extended of [false,true]){
      const good=frame(92,1,p,extended),expected=Buffer.concat([w(92),w(good.length),good]);
      assert.deepEqual(call(4,Buffer.concat([v,good])),expected);accepted++;
      for(let cut=0;cut<22;cut++){
        assert.throws(()=>call(4,Buffer.concat([v,frame(92,1,p.subarray(0,cut),extended)])),/UnexpectedEnd/);rejected++;
        assert.deepEqual(call(4,Buffer.concat([v,good])),expected);
      }
      for(const level of [0,2,1023]){
        assert.throws(()=>call(4,Buffer.concat([v,frame(92,level,p,extended)])),/InvalidDocInfoLevel/);rejected++;
      }
    }
    for(const n of [null,-1,0,1,2,0x7fffffff]){
      const mapping=Buffer.alloc(n===null?60:64);if(n!==null)mapping.writeInt32LE(n,60);
      const b=Buffer.concat([v,frame(17,0,mapping),frame(92,1,p)]);
      if(n===null||n===1){assert.equal(call(7,b).readUInt32LE(12),0);accepted++;}
      else{assert.throws(()=>call(7,b),n<0?/NegativeMappingCount/:/ResourceCountMismatch/);rejected++;}
    }
  }
  return {accepted,rejected};
}
export function memoResourceDocument(call,cfb){
  const file=readFileSync(new URL('../../reference/rhwp/samples/hwpx_sample2.hwp',import.meta.url));
  cfb.parse(file,{strict:true});const nodes=cfb.document().nodes;
  const h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36),v=h.subarray(32,36);
  const decode=b=>call(3,Buffer.concat([h,Buffer.from(b)]));
  const info=decode(cfb.findExact('/DocInfo').content),body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const sections=nodes.filter(n=>n.parent===body&&/^Section\d+$/.test(n.name)).map(n=>({index:Number(n.name.slice(7)),bytes:decode(n.content)}));
  const original=call(24,decodedDocumentInput(h,info,sections)),whole=call(25,Buffer.concat([w(64*1024*1024),file]));
  assert.deepEqual(whole.subarray(0,original.length),original);
  const rs=documentRecords(info),m=rs.find(r=>r.tag===17),memo=rs.filter(r=>r.tag===92);assert.equal(memo.length,1);
  let rejected=0;
  const reject=(changed,error)=>{
    assert.throws(()=>call(7,Buffer.concat([v,changed])),error);
    assert.throws(()=>call(24,decodedDocumentInput(h,changed,sections)),error);
    const altered=nodes.map(n=>n.parent===0&&n.name==='DocInfo'?{...n,content:flags&1?deflateRawSync(changed):changed}:n);
    assert.throws(()=>call(25,Buffer.concat([w(64*1024*1024),Buffer.from(cfb.write({nodes:altered}))])),error);rejected+=3;
    assert.deepEqual(call(24,decodedDocumentInput(h,info,sections)),original);
    assert.deepEqual(call(25,Buffer.concat([w(64*1024*1024),file])),whole);
  };
  for(const n of [-1,0,2,0x7fffffff]){const b=Buffer.from(info);b.writeInt32LE(n,m.start+60);reject(b,n<0?/NegativeMappingCount/:/ResourceCountMismatch/);}
  const r=memo[0],before=info.subarray(0,r.offset),after=info.subarray(r.end),payload=info.subarray(r.start,r.end);
  reject(Buffer.concat([before,after]),/ResourceCountMismatch/);
  reject(Buffer.concat([before,info.subarray(r.offset,r.end),info.subarray(r.offset,r.end),after]),/ResourceCountMismatch/);
  for(let cut=0;cut<22;cut++)reject(Buffer.concat([before,frame(92,1,payload.subarray(0,cut)),after]),/UnexpectedEnd/);
  for(const level of [0,2])reject(Buffer.concat([before,frame(92,level,payload),after]),/InvalidDocInfoLevel/);
  return {memos:memo.length,rejected};
}
