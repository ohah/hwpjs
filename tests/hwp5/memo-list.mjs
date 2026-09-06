import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(b,extended=false)=>Buffer.concat([w(93|1024|((extended?4095:b.length)<<20)),...(extended?[w(b.length)]:[]),b]);
function actual(call,version,b,extended=false){
  const r=frame(b,extended),expected=Buffer.concat([w(93),w(1),w(r.length),r]);
  assert.deepEqual(call(8,Buffer.concat([w(version),r])),expected);
  for(let cut=0;cut<4;cut++)assert.throws(()=>call(8,Buffer.concat([w(version),frame(b.subarray(0,cut),extended)])),/UnexpectedEnd/);
  assert.deepEqual(call(8,Buffer.concat([w(version),r])),expected);
  return {index:b.readUInt32LE(),extra:b.length-4};
}
export function memoListEdges(call){
  let accepted=0;const b=Buffer.from([0x67,0x45,0x23,0x81,0,128,255]);
  for(const version of [0x05000107,0x05000300,0x05010001])for(const extended of [false,true]){
    const check=b=>{actual(call,version,b,extended);accepted++;};
    for(let end=4;end<=7;end++)check(b.subarray(0,end));
    for(let at=0;at<b.length;at++)for(let bit=0;bit<8;bit++){const c=Buffer.from(b);c[at]^=1<<bit;check(c);}
    check(Buffer.alloc(4));check(Buffer.alloc(4,255));
  }
  return {accepted,rejected:accepted*4};
}
export function memoListReference(call,cfb){
  const files=[];let parsed=0,matchedFields=0;
  for(const [name,section,count] of [['aift.hwp',2,2],['issue5169_viewtext_changetracking.hwp',0,2],['basic/NewYear_s_Day.hwp',0,9],['basic/english.hwp',0,15],['issue5866/memo_field_hwp5.hwp',0,1],['task2287/1342000_edu_curriculum_map.hwp',33,1]]){
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content),version=h.readUInt32LE(32),b=call(3,Buffer.concat([h,Buffer.from(cfb.findExact('/BodyText/Section'+section).content)]));
    const rs=documentRecords(b),memos=rs.filter(r=>r.tag===93);assert.equal(memos.length,count);
    const indices=memos.map(r=>{assert.equal((b.readUInt32LE(r.offset)>>>10)&1023,1);const p=actual(call,version,b.subarray(r.start,r.end));assert.equal(p.extra,0);parsed++;return p.index;});
    const fields=[];
    for(const r of rs.filter(r=>r.tag===71&&r.end-r.start>=15)){
      const p=b.subarray(r.start,r.end);if((p.readUInt32LE()>>>24)!==37)continue;
      const end=11+p.readUInt16LE(9)*2;if(end+8>p.length)continue;
      const command=p.subarray(11,end).toString('utf16le'),match=command.match(/^MEMO\/65535\/(\d+)\//);if(!match)continue;
      const index=p.readUInt32LE(end+4);assert.equal(index,Number(match[1]));assert.ok(indices.includes(index));fields.push(index);matchedFields++;
    }
    files.push({name,section,indices,fields});
  }
  assert.equal(parsed,30);assert.equal(matchedFields,27);
  return {parsed,rejected:parsed*4,matchedFields,files};
}
export function memoListDocument(call,cfb){
  const file=readFileSync(new URL('../../reference/rhwp/samples/issue5866/memo_field_hwp5.hwp',import.meta.url));cfb.parse(file,{strict:true});
  const nodes=cfb.document().nodes,h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36);
  const decode=raw=>call(3,Buffer.concat([h,Buffer.from(raw)]));
  const doc=decode(cfb.findExact('/DocInfo').content),b=decode(cfb.findExact('/BodyText/Section0').content),r=documentRecords(b).find(r=>r.tag===93);assert.ok(r);
  const run=body=>call(24,decodedDocumentInput(h,doc,[{index:0,bytes:body}])),original=run(b),cap=w(64*1024*1024),whole=call(25,Buffer.concat([cap,file]));assert.deepEqual(whole.subarray(0,original.length),original);
  const body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  for(let cut=0;cut<4;cut++){
    const changed=Buffer.concat([b.subarray(0,r.offset),frame(b.subarray(r.start,r.start+cut)),b.subarray(r.end)]);
    assert.throws(()=>run(changed),/UnexpectedEnd/);
    const altered=nodes.map(n=>n.parent===body&&n.name==='Section0'?{...n,content:flags&1?deflateRawSync(changed):changed}:n);
    assert.throws(()=>call(25,Buffer.concat([cap,Buffer.from(cfb.write({nodes:altered}))])),/UnexpectedEnd/);
    assert.deepEqual(run(b),original);assert.deepEqual(call(25,Buffer.concat([cap,file])),whole);
  }
  return {rejected:8};
}
