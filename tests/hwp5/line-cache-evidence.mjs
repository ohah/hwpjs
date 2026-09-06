// Independent, read-only record evidence. No normalization of source text.
import assert from 'node:assert/strict';
import {documentRecords} from './documents.mjs';

export function paragraphEvidence(bytes) {
  const stack=[],paragraphs=new Map();
  for(const [index,r] of documentRecords(bytes).entries()) {
    const level=(bytes.readUInt32LE(r.offset)>>>10)&1023;
    assert.ok(level<=stack.length,'missing record parent');
    stack.length=level;
    const owner=paragraphs.get(stack[level-1]);
    if(r.tag===66) {
      assert.ok(r.end-r.start>=22);
      assert.notEqual(r.end-r.start,23);
      paragraphs.set(index,{index,offset:r.offset,level,units:bytes.readUInt32LE(r.start)&0x7fffffff,merge:r.end-r.start>=24?bytes.readUInt16LE(r.start+22):null,textUnits:0,text:null,starts:[],lineBytes:null});
    }
    if(owner&&r.tag===67) {
      assert.equal(owner.text,null,'duplicate direct text');
      assert.equal((r.end-r.start)%2,0);
      owner.text=bytes.subarray(r.start,r.end);
      owner.textUnits=(r.end-r.start)/2;
    }
    if(owner&&r.tag===69) {
      assert.equal(owner.lineBytes,null,'duplicate direct lines');
      assert.equal((r.end-r.start)%36,0);
      owner.lineBytes=bytes.subarray(r.start,r.end);
      for(let at=r.start;at<r.end;at+=36)owner.starts.push(bytes.readUInt32LE(at));
    }
    stack[level]=index;
  }
  return [...paragraphs.values()];
}

// Hypotheses only: neither byte concatenation is a product coordinate policy.
export function textCandidates(members) {
  return {
    raw:Buffer.concat(members.map(p=>p.text??Buffer.alloc(0))),
    stripped:Buffer.concat(members.map((p,i)=>{
      const b=p.text??Buffer.alloc(0);
      return i<members.length-1&&b.length>=2&&b.readUInt16LE(b.length-2)===13?b.subarray(0,-2):b;
    })),
  };
}
