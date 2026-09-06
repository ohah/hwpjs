import assert from 'node:assert/strict';
import {loadMemoDocument} from './memo-references.mjs';
import {decodedDocumentInput,documentRecords} from './documents.mjs';
const words=b=>Array.from({length:b.length/4},(_,i)=>b.readUInt32LE(i*4));
// Raw record/token oracle: no product Links, Flows, memo-field or memo-end probe.
function events(sections){
  const result=[];
  for(const s of [...sections].sort((a,b)=>a.index-b.index)){
    const b=s.bytes,ancestors=[],lastList=new Map(),scopes=new Map(),pending=new Map();
    for(const [i,r] of documentRecords(b).entries()){
      const level=(b.readUInt32LE(r.offset)>>>10)&1023;ancestors.length=level;const parent=ancestors.at(-1),p=b.subarray(r.start,r.end);
      if(r.tag===72)lastList.set(parent,i);
      if(r.tag===66)scopes.set(i,parent===undefined?0:lastList.get(parent));
      if(r.tag===67){
        for(let at=0;at<p.length;){
          const code=p.readUInt16LE(at),wide=(code>=1&&code<=9)||(code>=11&&code<=12)||(code>=14&&code<=23);
          if(code===3){const id=p.readUInt32LE(at+2);if(id===0x25256d65){const queue=pending.get(parent)??[];queue.push(at/2);pending.set(parent,queue);}}
          if(code===4&&p.readUInt32LE(at+2)===0x00256d65)result.push({section:s.index,scope:scopes.get(parent),paragraph:parent,unit:at/2,kind:'end',id:p.readUInt32LE(at+10),idAt:r.start+at+10});
          at+=wide?16:2;
        }
      }
      if(r.tag===71&&p.length>=15){
        const end=11+2*p.readUInt16LE(9),command=p.subarray(11,end).toString('utf16le');
        if(/^MEMO\//.test(command)){const unit=pending.get(parent)?.shift();assert.notEqual(unit,undefined);result.push({section:s.index,scope:scopes.get(parent),paragraph:parent,unit,kind:'start',id:p.length>=end+8?p.readUInt32LE(end+4):null});}
      }
      ancestors.push(i);
    }
    for(const queue of pending.values())assert.equal(queue.length,0);
  }
  for(const e of result)assert.notEqual(e.scope,undefined);
  return result;
}
function oracle(rows){
  const report=Array(9).fill(0),flows=new Map();
  for(const e of rows){const key=e.scope===0?'root':`${e.section}/${e.scope}`,flow=flows.get(key)??[];flow.push(e);flows.set(key,flow);}
  for(const flow of flows.values()){
    flow.sort((a,b)=>a.section-b.section||a.paragraph-b.paragraph||a.unit-b.unit);const stack=[];
    for(const e of flow){
      if(e.kind==='start'){report[0]++;stack.push(e);continue;}
      report[1]++;const start=stack.pop();if(!start){report[7]++;continue;}
      report[2]++;report[3]+=Number(start.id===null);report[4]+=Number(start.section!==e.section||start.paragraph!==e.paragraph);report[5]+=Number(start.section!==e.section);report[6]+=Number(start.id!==null&&start.id!==e.id);
    }
    report[8]+=stack.length;
  }
  return report;
}
export function memoRangesActual(call,cfb){
  const results=[];
  for(const [name,n,cross] of [['aift.hwp',2,0],['issue5169_viewtext_changetracking.hwp',0,0],['basic/NewYear_s_Day.hwp',9,0],['basic/english.hwp',15,0],['issue5866/memo_field_hwp5.hwp',1,1],['task2287/1342000_edu_curriculum_map.hwp',1,0]]){
    const x=loadMemoDocument(call,cfb,name),expected=oracle(events(x.sections));assert.deepEqual(expected,[n,n,n,0,cross,0,0,0,0]);
    assert.deepEqual(words(call(94,decodedDocumentInput(x.h,x.doc,x.sections))),expected,name);
    assert.deepEqual(words(call(94,decodedDocumentInput(x.h,x.doc,[...x.sections].reverse()))),expected,name);
    results.push({name,sections:x.sections.length,report:expected});
  }
  return results;
}
export function memoRangeMutations(call,cfb){
  const x=loadMemoDocument(call,cfb,'basic/english.hwp');assert.equal(x.sections.length,1);
  const b=x.sections[0].bytes,rows=events(x.sections),ends=rows.filter(e=>e.kind==='end');assert.equal(ends.length,15);assert.notEqual(ends[0].id,ends[1].id);
  const input=bytes=>decodedDocumentInput(x.h,x.doc,[{index:0,bytes}]),base=call(94,input(b)),legacyReport=call(24,input(b));let checked=0;
  function check(bytes,expected){
    // Known source/target reference checks still succeed for these range errors.
    call(90,input(bytes));call(92,input(bytes));assert.deepEqual(call(24,input(bytes)),legacyReport);
    assert.deepEqual(words(call(94,input(bytes))),expected);assert.deepEqual(oracle(events([{index:0,bytes}])),expected);checked++;assert.deepEqual(call(94,input(b)),base);
  }
  const swapped=Buffer.from(b);swapped.writeUInt32LE(ends[1].id,ends[0].idAt);swapped.writeUInt32LE(ends[0].id,ends[1].idAt);check(swapped,[15,15,15,0,0,0,2,0,0]);
  const unknown=Buffer.from(b);unknown.writeUInt32LE(0,ends[0].idAt-8);check(unknown,[15,14,14,0,0,0,0,0,1]);
  const first=ends[0],start=rows.find(e=>e.kind==='start'&&e.id===first.id);assert.equal(start.paragraph,first.paragraph);
  const records=documentRecords(b),text=records.find(r=>r.tag===67&&first.idAt>=r.start&&first.idAt<r.end),startAt=text.start+start.unit*2,endAt=first.idAt-10;
  const reversed=Buffer.from(b);b.copy(reversed,startAt,endAt,endAt+16);b.copy(reversed,endAt,startAt,startAt+16);check(reversed,[15,15,14,0,0,0,0,1,1]);
  // Optional start index absence is unknown, not an implicit zero or mismatch.
  const field=records.find(r=>r.tag===71&&b.subarray(r.start+11,r.start+11+2*b.readUInt16LE(r.start+9)).toString('utf16le').startsWith('MEMO/'));
  const at=field.start+15+2*b.readUInt16LE(field.start+9);assert.equal(field.end-at,4);
  const absent=Buffer.concat([b.subarray(0,at),b.subarray(at+4)]);absent.writeUInt32LE((b.readUInt32LE(field.offset)&0xfffff)|((field.end-field.start-4)<<20),field.offset);
  assert.deepEqual(words(call(94,input(absent))),[15,15,15,1,0,0,0,0,0]);assert.deepEqual(oracle(events([{index:0,bytes:absent}])),[15,15,15,1,0,0,0,0,0]);checked++;assert.deepEqual(call(94,input(b)),base);
  return {checked};
}
