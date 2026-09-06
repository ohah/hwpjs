import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
import {deflateRawSync} from 'node:zlib';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const make=(id,command,extra)=>{const c=Buffer.from(command,'utf16le'),n=Buffer.alloc(2);n.writeUInt16LE(c.length/2);return Buffer.concat([w(id),w(0x8001),Buffer.from([255]),n,c,w(123),extra]);};
export function memoFieldEdges(call){
  let accepted=0,rejected=0;
  for(const id of [0x25256d65,0x25756e6b]){
    const run=extra=>call(89,make(id,'MEMO/',extra));
    assert.deepEqual(run(Buffer.alloc(0)),Buffer.concat([1,0,0,0].map(w)));accepted++;
    for(let n=1;n<4;n++){assert.throws(()=>run(Buffer.alloc(n)),/UnexpectedEnd/);rejected++;}
    for(const value of [0,1,65536,0x80000000,0xffffffff])for(let n=0;n<4;n++){
      const extra=Buffer.alloc(n,255);assert.deepEqual(run(Buffer.concat([w(value),extra])),Buffer.concat([...[1,1,value,n].map(w),extra]));accepted++;
    }
  }
  for(const [id,command] of [[0x25686c6b,'MEMO/'],[0x25756e6b,'memo/'],[0x25756e6b,'MEMO'],[0x25756e6b,'MEMO?']]){assert.deepEqual(call(89,make(id,command,Buffer.alloc(3))),w(0));accepted++;}
  return {accepted,rejected};
}
export function memoFieldReference(call,cfb){
  let fields=0,markers=0,crossSection=0;const unmatched=[];
  for(const name of ['aift.hwp','issue5169_viewtext_changetracking.hwp','basic/NewYear_s_Day.hwp','basic/english.hwp','issue5866/memo_field_hwp5.hwp','task2287/1342000_edu_curriculum_map.hwp']){
    cfb.parse(readFileSync(new URL('../../reference/rhwp/samples/'+name,import.meta.url)),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content),ns=cfb.document().nodes,body=ns.findIndex(n=>n.parent===0&&n.name==='BodyText'),fs=[],ms=[];
    for(const n of ns.filter(n=>n.parent===body&&/^Section\d+$/.test(n.name))){
      const b=call(3,Buffer.concat([h,Buffer.from(n.content)]));
      for(const r of documentRecords(b)){
        const p=b.subarray(r.start,r.end);
        if(r.tag===93){ms.push({section:n.name,index:p.readUInt32LE()});continue;}
        if(r.tag!==71||p.length<15||(p.readUInt32LE()>>>24)!==37)continue;
        const end=11+p.readUInt16LE(9)*2;if(end+4>p.length)continue;
        const match=p.subarray(11,end).toString('utf16le').match(/^MEMO\/65535\/(\d+)\//);if(!match)continue;
        const index=Number(match[1]);assert.deepEqual(call(89,p),Buffer.concat([1,1,index,0].map(w)));fs.push({section:n.name,index});
      }
    }
    fields+=fs.length;markers+=ms.length;
    for(const f of fs){const target=ms.filter(m=>m.index===f.index);assert.equal(target.length,1);crossSection+=Number(target[0].section!==f.section);}
    for(const m of ms)if(!fs.some(f=>f.index===m.index))unmatched.push({name,...m});
  }
  assert.equal(fields,28);assert.equal(markers,30);assert.equal(crossSection,1);
  assert.deepEqual(unmatched,[1,3].map(index=>({name:'issue5169_viewtext_changetracking.hwp',section:'Section0',index})));
  return {fields,markers,crossSection,unmatched};
}
export function memoFieldDocument(call,cfb){
  const file=readFileSync(new URL('../../reference/rhwp/samples/issue5866/memo_field_hwp5.hwp',import.meta.url));cfb.parse(file,{strict:true});
  const ns=cfb.document().nodes,h=Buffer.from(cfb.findExact('/FileHeader').content),decode=raw=>call(3,Buffer.concat([h,Buffer.from(raw)])),doc=decode(cfb.findExact('/DocInfo').content),b=decode(cfb.findExact('/BodyText/Section0').content),body=ns.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const r=documentRecords(b).find(r=>r.tag===71&&b.readUInt32LE(r.start)===0x25756e6b);assert.ok(r);
  const p=b.subarray(r.start,r.end),end=15+p.readUInt16LE(9)*2;assert.equal(p.length,end+4);
  const run=bytes=>call(24,decodedDocumentInput(h,doc,[{index:0,bytes}])),original=run(b),whole=call(25,Buffer.concat([w(64*1024*1024),file]));
  for(let n=1;n<4;n++){
    const short=p.subarray(0,end+n),changed=Buffer.concat([b.subarray(0,r.offset),w((b.readUInt32LE(r.offset)&0xfffff)|(short.length<<20)),short,b.subarray(r.end)]);
    assert.throws(()=>call(89,short),/UnexpectedEnd/);assert.throws(()=>run(changed),/UnexpectedEnd/);
    const nodes=ns.map(n=>n.parent===body&&n.name==='Section0'?{...n,content:h.readUInt32LE(36)&1?deflateRawSync(changed):changed}:n);
    assert.throws(()=>call(25,Buffer.concat([w(64*1024*1024),Buffer.from(cfb.write({nodes}))])),/UnexpectedEnd/);
    assert.deepEqual(run(b),original);assert.deepEqual(call(25,Buffer.concat([w(64*1024*1024),file])),whole);
  }
  return {rejected:9};
}
