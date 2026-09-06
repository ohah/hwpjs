import assert from 'node:assert/strict';
import test from 'node:test';
import {paragraphEvidence,textCandidates,rangeFilteredCandidate,rootMergeGroups} from './line-cache-evidence.mjs';
const frame=(tag,level,b)=>{const h=Buffer.alloc(4);h.writeUInt32LE(tag|(level<<10)|(b.length<<20));return Buffer.concat([h,b]);};
const head=(level=0,size=24)=>frame(66,level,Buffer.alloc(size));
const text=(s,level=1)=>frame(67,level,Buffer.from(s,'utf16le'));

test('evidence assigns only direct children and excludes nested control text',()=>{
  const bytes=Buffer.concat([head(),text('A\r'),frame(71,1,Buffer.alloc(4)),head(2),text('B\r',3)]);
  const ps=paragraphEvidence(bytes);
  assert.equal(ps.length,2);assert.equal(ps[0].text.toString('utf16le'),'A\r');assert.equal(ps[1].text.toString('utf16le'),'B\r');
  assert.equal(ps[1].level,2);
});
test('missing merge marker stays null, not zero',()=>{
  assert.equal(paragraphEvidence(head(0,22))[0].merge,null);
  assert.equal(paragraphEvidence(head())[0].merge,0);
  assert.throws(()=>paragraphEvidence(head(0,23)));
});
test('reject malformed framing and missing parents',()=>{
  const bytes=Buffer.concat([head(),text('A')]);
  for(let cut=1;cut<bytes.length;cut++)if(cut!==28)assert.throws(()=>paragraphEvidence(bytes.subarray(0,cut)));
  assert.throws(()=>paragraphEvidence(head(2)));
});
test('reject duplicate direct text and odd UTF16 bytes',()=>{
  assert.throws(()=>paragraphEvidence(Buffer.concat([head(),text('A'),text('B')])));
  assert.throws(()=>paragraphEvidence(Buffer.concat([head(),frame(67,1,Buffer.alloc(1))])));
});
test('reject partial and duplicate line arrays',()=>{
  assert.throws(()=>paragraphEvidence(Buffer.concat([head(),frame(69,1,Buffer.alloc(35))])));
  assert.throws(()=>paragraphEvidence(Buffer.concat([head(),frame(69,1,Buffer.alloc(36)),frame(69,1,Buffer.alloc(36))])));
});
test('CR hypothesis strips only the final CR of nonfinal members without writes',()=>{
  const parts=['A\r\r','B\n','C\r'].map(s=>({text:Buffer.from(s,'utf16le')})),before=parts.map(p=>Buffer.from(p.text));
  const x=textCandidates(parts);
  assert.equal(x.raw.toString('utf16le'),'A\r\rB\nC\r');assert.equal(x.stripped.toString('utf16le'),'A\rB\nC\r');
  assert.deepEqual(parts.map(p=>p.text),before);
});
test('missing text is not synthesized from declared units',()=>{
  const ps=paragraphEvidence(Buffer.concat([head(),head()]));
  assert.equal(ps[0].text,null);assert.equal(textCandidates(ps).raw.length,0);
  assert.equal(textCandidates([{text:Buffer.from('A\r','utf16le')},{text:null}]).stripped.toString('utf16le'),'A');
});
test('text evidence retains supplementary characters and inline control bytes',()=>{
  const s='😀\t\0\0\0\0\0\0\t\r',p=paragraphEvidence(Buffer.concat([head(),text(s)]))[0];
  assert.equal(p.textUnits,s.length);assert.equal(p.text.toString('utf16le'),s);
});

const ranged=(s,ranges)=>({text:Buffer.from(s,'utf16le'),units:s.length,ranges});
const range=(start,end,kind=17,data=0)=>({start,end,kind,data});
test('root grouping rejects unknown/absent merge values and orphan continuations',()=>{
  for(const merge of [null,2,65535,1])assert.throws(()=>rootMergeGroups([{level:0,merge}]));
});
test('root grouping keeps source order, excludes nested scope, and does not cross calls',()=>{
  const a={level:0,merge:0},nested={level:1,merge:1},b={level:0,merge:1},c={level:0,merge:0};
  assert.deepEqual(rootMergeGroups([a,nested,b,c]),[[a,b],[c]]);
  assert.throws(()=>rootMergeGroups([b]));assert.deepEqual(rootMergeGroups([]),[]);
});
test('filter endpoints are half-open and overlapping intervals form a union',()=>{
  const p=ranged('ABCDEF\r',[range(1,3),range(2,4),range(4,4)]),before=structuredClone(p.ranges);
  assert.equal(rangeFilteredCandidate([p],17).toString('utf16le'),'AEF\r');
  assert.deepEqual(p.ranges,before);
  assert.equal(rangeFilteredCandidate([ranged('A\r',[range(0,2)])],17).length,0);
});
test('filter selects kind exactly, not low data bits or neighboring kind',()=>{
  const p=ranged('ABC\r',[range(0,1,16,17),range(1,2,17,0xffffff),range(2,3,18,17)]);
  assert.equal(rangeFilteredCandidate([p],17).toString('utf16le'),'AC\r');
  assert.equal(rangeFilteredCandidate([p],16).toString('utf16le'),'BC\r');
});
test('filter rejects reversed/out-of-bounds spans and mismatched declared text',()=>{
  for(const r of [range(2,1),range(0,3),range(0,0xffffffff)])assert.throws(()=>rangeFilteredCandidate([ranged('A\r',[r])],17));
  assert.throws(()=>rangeFilteredCandidate([{...ranged('A\r',[]),units:3}],17));
});
test('missing-text candidate is explicit one-unit CR, never arbitrary padding',()=>{
  assert.equal(rangeFilteredCandidate([{text:null,units:1,ranges:[]}],17).toString('utf16le'),'\r');
  assert.equal(rangeFilteredCandidate([{text:null,units:1,ranges:[range(0,1)]}],17).length,0);
  for(const units of [0,2,0xffffffff])assert.throws(()=>rangeFilteredCandidate([{text:null,units,ranges:[]}],17));
});
test('range evidence uses immediate parent and retains full 24-bit data',()=>{
  const b=Buffer.alloc(12);b.writeUInt32LE(0,0);b.writeUInt32LE(1,4);b.writeUInt32LE(0x11abcdef,8);
  const ps=paragraphEvidence(Buffer.concat([head(),frame(71,1,Buffer.alloc(4)),head(2),frame(70,3,b)]));
  assert.equal(ps[0].ranges,null);assert.deepEqual(ps[1].ranges,[range(0,1,17,0xabcdef)]);
  assert.throws(()=>paragraphEvidence(Buffer.concat([head(),frame(70,1,b.subarray(0,11))])));
  assert.throws(()=>paragraphEvidence(Buffer.concat([head(),frame(70,1,b),frame(70,1,b)])));
});
