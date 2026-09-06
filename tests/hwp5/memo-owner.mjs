import assert from 'node:assert/strict';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const f=(tag,level,b)=>Buffer.concat([w(tag|(level<<10)|(b.length<<20)),b]);
export function memoOwnerEdges(call){
  const root=f(66,0,Buffer.alloc(24)),p=f(66,1,Buffer.alloc(24)),marker=f(93,1,w(0)),h=Buffer.alloc(16);h[0]=1;
  const list=f(72,1,h),good=Buffer.concat([root,marker,list,p]);let accepted=0,rejected=0;
  const run=b=>call(88,Buffer.concat([w(0x05000307),b]));
  const check=(b,expected)=>{assert.deepEqual(run(b),Buffer.concat(expected.map(w)));accepted++;};
  const reject=(b,error)=>{assert.throws(()=>run(b),error);rejected++;check(good,[1,1,0]);};
  check(good,[1,1,0]);check(root,[0,0,0]);
  check(Buffer.concat([root,marker,f(72,1,Buffer.alloc(16))]),[1,0,0]);
  check(Buffer.concat([root,marker,list,p,marker,list,p]),[2,2,0]); // Same raw index is preserved, not resolved yet.
  reject(Buffer.concat([root,marker]),/MissingMemoListHeader/);
  reject(Buffer.concat([root,marker,marker,list,p]),/MissingMemoListHeader/);
  reject(f(93,0,w(1)),/OrphanMemoList/);
  reject(Buffer.concat([f(900,0,Buffer.alloc(24)),marker,list,p]),/OrphanMemoList/);
  reject(Buffer.concat([root,marker,f(900,2,Buffer.alloc(0)),list,p]),/InvalidMemoListChildren/);
  reject(Buffer.concat([root,marker,root,list,p]),/MissingMemoListHeader/);
  const high=Buffer.from(h);high.writeUInt32LE(65537);
  reject(Buffer.concat([root,marker,f(900,1,Buffer.alloc(0)),f(72,1,high),p]),/MissingMemoListHeader/);
  const markerExtra=f(93,1,Buffer.concat([w(0xffffffff),Buffer.from([1,2,3])]));
  check(Buffer.concat([root,markerExtra,f(72,1,Buffer.concat([h,Buffer.from([8,9])])),p]),[1,1,5]);
  return {accepted,rejected};
}
