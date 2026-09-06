import assert from 'node:assert/strict';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const frame=(tag,level,b)=>Buffer.concat([w(tag|(level<<10)|(b.length<<20)),b]);
export function memoListGroupEdges(call){
  const v=w(0x05000307),root=frame(66,0,Buffer.alloc(24)),p=frame(66,1,Buffer.alloc(24));
  const marker=frame(93,1,w(1)),other=frame(900,1,w(1));let accepted=0,rejected=0;
  const run=b=>call(15,Buffer.concat([v,b]));
  const make=(count,mark=marker,n=1,size=16)=>{const h=Buffer.alloc(16);h.writeInt32LE(count);return Buffer.concat([root,mark,frame(72,1,h.subarray(0,size)),...Array(n).fill(p)]);};
  const check=(b,n=1)=>{assert.deepEqual(run(b),Buffer.concat([2,0,3,n+3,n,0].map(w)));accepted++;};
  check(make(1));
  for(const n of [0,2,65537,0x7fff0001,-2147483647,-1]){
    assert.throws(()=>run(make(n)),n<0?/NegativeMemoParagraphCount/:/ListParagraphCountMismatch/);rejected++;check(make(1));
  }
  for(let size=6;size<16;size++){assert.throws(()=>run(make(1,marker,1,size)),/UnexpectedEnd/);rejected++;}
  // Other list kinds retain their existing 16-bit count/opaque-high-word contract.
  check(make(65537,other));check(make(-2147483647,other));
  // Full 32-bit counts must work, not merely reject high bits.
  check(make(65536,marker,65536),65536);
  assert.throws(()=>run(make(65536,other,65536)),/ListParagraphCountMismatch/);rejected++;
  // A marker under another root is not this list's preceding direct sibling.
  const h=Buffer.alloc(16);h.writeUInt32LE(65537);
  assert.deepEqual(run(Buffer.concat([root,marker,root,frame(72,1,h),p])),Buffer.concat([3,2,4,5,1,0].map(w)));accepted++;
  return {accepted,rejected,largeParagraphs:65536};
}
