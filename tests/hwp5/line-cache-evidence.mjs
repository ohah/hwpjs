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
      paragraphs.set(index,{index,offset:r.offset,level,units:bytes.readUInt32LE(r.start)&0x7fffffff,merge:r.end-r.start>=24?bytes.readUInt16LE(r.start+22):null,textUnits:0,text:null,starts:[],lineBytes:null,ranges:null});
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
    if(owner&&r.tag===70) {
      assert.equal(owner.ranges,null,'duplicate direct ranges');
      assert.equal((r.end-r.start)%12,0);
      owner.ranges=[];
      for(let at=r.start;at<r.end;at+=12)owner.ranges.push({start:bytes.readUInt32LE(at),end:bytes.readUInt32LE(at+4),kind:bytes[at+11],data:bytes.readUInt32LE(at+8)&0xffffff});
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

// Observed 0/1 root-flow grouping only. Nested scopes need a separate owner.
export function rootMergeGroups(paragraphs) {
  const groups=[];
  for(const p of paragraphs)if(p.level===0) {
    assert.ok(p.merge===0||p.merge===1,'unproven merge value');
    if(p.merge===1) {assert.ok(groups.length>0,'orphan merged paragraph');groups.at(-1).push(p);}
    else groups.push([p]);
  }
  return groups;
}

// A comparison hypothesis only, not a product change-acceptance operation.
// Range endpoints are treated as half-open; overlapping ranges form a union.
export function rangeFilteredCandidate(members,kind) {
  const pieces=[];
  for(const p of members) {
    // The investigated missing-text paragraphs declare exactly one CR unit.
    // Never allocate an arbitrary declared size or silently fill missing text.
    if(p.text===null)assert.equal(p.units,1,'unproven missing-text representation');
    const b=p.text??Buffer.from('\r','utf16le');
    assert.equal(b.length/2,p.units);
    const selected=(p.ranges??[]).filter(r=>r.kind===kind);
    for(const r of selected)assert.ok(r.start<=r.end&&r.end<=p.units,'range bounds');
    for(let n=0;n<p.units;n++)if(!selected.some(r=>r.start<=n&&n<r.end))pieces.push(b.subarray(n*2,n*2+2));
  }
  return Buffer.concat(pieces);
}
