import assert from 'node:assert/strict';
import test from 'node:test';
import {declaredLineCandidates,lineAvailability} from './line-cache-coordinate-evidence.mjs';
const p=(index,s,starts=[],ranges=[])=>({index,text:Buffer.from(s,'utf16le'),units:s.length,starts,ranges});
const r=(start,end)=>({start,end,kind:17});

test('declared-axis hypothesis counts CR and preserves noncontiguous member identifiers',()=>{
  const members=[p(3,'A\r',[0,1,2,3,4],[r(1,2)]),p(19,'B\r')];
  const before=structuredClone(members),x=declaredLineCandidates(members);
  assert.deepEqual(x.lines.map(q=>q.projected),[0,1,1,2,3]);
  assert.deepEqual(x.lines.map(q=>q.node),[3,3,19,19,null]);
  assert.deepEqual(x.lines.map(q=>q.removed),[false,true,false,false,false]);
  assert.deepEqual(structuredClone(members),before);
});
test('all two-interval combinations match independent retained-prefix counts',()=>{
  for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)for(let c=0;c<=6;c++)for(let d=c;d<=6;d++) {
    const starts=[6,0,4,1,3,2,5,1],x=declaredLineCandidates([p(7,'ABCDEF',starts,[r(a,b),r(c,d)])]);
    const mask=Array.from({length:6},(_,i)=>(a<=i&&i<b)||(c<=i&&i<d));
    for(const [j,s]of starts.entries()) {
      assert.equal(x.lines[j].projected,mask.slice(0,s).filter(v=>!v).length);
      assert.equal(x.lines[j].removed,s<6&&mask[s]);
    }
  }
});
test('explicit one-unit missing CR affects source axis even if removed',()=>{
  const x=declaredLineCandidates([p(1,'A',[0,1,2,3]),{index:5,text:null,units:1,ranges:[r(0,1)]},p(8,'B')]);
  assert.deepEqual(x.lines.map(q=>q.projected),[0,1,1,2]);
  assert.equal(x.lines[1].codeUnit,13);assert.equal(x.lines[1].removed,true);
  for(const units of [0,2,0xffffffff])assert.throws(()=>declaredLineCandidates([{text:null,units,starts:[]} ]));
});
test('UTF16 surrogate and inline-control payload units are not normalized',()=>{
  const s='😀\t\0\0\0\0\0\0\t\r',starts=Array.from({length:s.length+1},(_,i)=>i);
  const x=declaredLineCandidates([p(4,s,starts)]);
  assert.deepEqual(x.lines.map(q=>q.projected),starts);
  assert.deepEqual(x.lines.slice(0,-1).map(q=>q.codeUnit),starts.slice(0,-1).map(i=>s.charCodeAt(i)));
});
test('zero-length members and whole deletion do not invent a live character',()=>{
  assert.deepEqual(declaredLineCandidates([]),{sourceUnits:0,projectedUnits:0,lines:[]});
  const x=declaredLineCandidates([p(0,'',[0,1,2]),p(9,'AB',[],[r(0,2)]),p(20,'')]);
  assert.deepEqual(x.lines.map(q=>[q.projected,q.node,q.removed]),[[0,9,true],[0,9,true],[0,null,false]]);
});
test('invalid query or mismatched source cannot produce a plausible candidate',()=>{
  for(const s of [-1,3,0xffffffff,NaN,0.5])assert.throws(()=>declaredLineCandidates([p(0,'AB',[s])]));
  assert.throws(()=>declaredLineCandidates([{...p(0,'AB',[0]),units:3}]));
  for(const range of [r(2,1),r(0,3)])assert.throws(()=>declaredLineCandidates([p(0,'AB',[0],[range])]));
});
test('absent, empty and populated line records are distinguishable',()=>{
  const rows=[{level:0,lineBytes:null,starts:[]},{level:0,lineBytes:Buffer.alloc(0),starts:[]},{level:1,lineBytes:Buffer.alloc(36),starts:[0]}];
  assert.deepEqual(lineAvailability(rows),{paragraphs:3,records:2,emptyRecords:1,lines:1,rootLines:0});
});
