import assert from 'node:assert/strict';
import test from 'node:test';
import {paragraphEvidence,textCandidates} from './line-cache-evidence.mjs';
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
