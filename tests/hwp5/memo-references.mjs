import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
function load(call,cfb,name){
  const file=readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url));cfb.parse(file,{strict:true});
  const nodes=cfb.document().nodes,h=Buffer.from(cfb.findExact('/FileHeader').content),decode=raw=>call(3,Buffer.concat([h,Buffer.from(raw)])),doc=decode(cfb.findExact('/DocInfo').content),body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const sections=nodes.filter(n=>n.parent===body&&/^Section\d+$/.test(n.name)).map(n=>({index:Number(n.name.slice(7)),bytes:decode(n.content)}));
  return {file,nodes,h,doc,body,sections};
}
export function memoReferencesActual(call,cfb){
  const results=[];
  for(const[name,fields,lists,cross]of[['aift.hwp',2,2,0],['issue5169_viewtext_changetracking.hwp',0,2,0],['basic/NewYear_s_Day.hwp',9,9,0],['basic/english.hwp',15,15,0],['issue5866/memo_field_hwp5.hwp',1,1,0],['task2287/1342000_edu_curriculum_map.hwp',1,1,1]]){
    const {h,doc,sections}=load(call,cfb,name),expected=[fields,lists,0,fields,cross,0,0,lists-fields,0,0],input=decodedDocumentInput(h,doc,sections);
    let actual;try{actual=call(90,input);}catch(error){error.message=name+': '+error.message;throw error;}
    assert.deepEqual(actual,Buffer.concat(expected.map(w)));
    assert.deepEqual(call(90,decodedDocumentInput(h,doc,[...sections].reverse())),Buffer.concat(expected.map(w)));
    results.push({name,sections:sections.length,report:expected});
  }
  return results;
}
export function memoReferenceDocument(call,cfb){
  const x=load(call,cfb,'issue5866/memo_field_hwp5.hwp'),{h,doc,nodes,body}=x;assert.equal(x.sections.length,1);
  const b=x.sections[0].bytes,rs=documentRecords(b),marker=rs.find(r=>r.tag===93),field=rs.find(r=>r.tag===71&&b.readUInt32LE(r.start)===0x25756e6b);assert.ok(marker&&field);
  const indexAt=field.start+15+b.readUInt16LE(field.start+9)*2;assert.equal(field.end-indexAt,4);
  const input=bytes=>decodedDocumentInput(h,doc,[{index:0,bytes}]);
  const full=bytes=>Buffer.concat([w(64*1024*1024),Buffer.from(cfb.write({nodes:nodes.map(n=>n.parent===body&&n.name==='Section0'?{...n,content:h.readUInt32LE(36)&1?deflateRawSync(bytes):bytes}:n)}))]);
  const original=call(24,input(b)),whole=call(25,Buffer.concat([w(64*1024*1024),x.file]));
  let rejected=0,accepted=0;
  const recover=()=>{assert.deepEqual(call(24,input(b)),original);assert.deepEqual(call(25,Buffer.concat([w(64*1024*1024),x.file])),whole);};
  const reject=(bytes,error)=>{assert.throws(()=>call(90,input(bytes)),error);assert.throws(()=>call(24,input(bytes)),error);assert.throws(()=>call(25,full(bytes)),error);rejected+=3;recover();};
  for(const at of [indexAt,marker.start])for(const value of [0,2,0xffffffff]){const changed=Buffer.from(b);changed.writeUInt32LE(value,at);reject(changed,/MissingMemoTarget/);}
  reject(Buffer.concat([b,b.subarray(marker.offset)]),/AmbiguousMemoTarget/);
  for(const value of [0,0xffffffff]){const changed=Buffer.from(b);changed.writeUInt32LE(value,indexAt);changed.writeUInt32LE(value,marker.start);assert.deepEqual(call(90,input(changed)),Buffer.concat([1,1,0,1,0,0,0,0,0,0].map(w)));call(25,full(changed));accepted++;recover();}
  const absent=Buffer.concat([b.subarray(0,field.offset),w((b.readUInt32LE(field.offset)&0xfffff)|((field.end-field.start-4)<<20)),b.subarray(field.start,indexAt),b.subarray(field.end)]);
  assert.deepEqual(call(90,input(absent)),Buffer.concat([1,1,1,0,0,0,0,1,0,0].map(w)));call(25,full(absent));accepted++;recover();
  return {accepted,rejected};
}
