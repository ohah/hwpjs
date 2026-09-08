import assert from 'node:assert/strict';
import {fraction as F} from './icc-matrix-reference.mjs';
import {rootOrderReference,orderedRootSigns} from './icc-root-compare.mjs';
import {cmp,sign,exponent,integerPower,base,levelOrder,valueOrder} from './icc-power-reference.mjs';
const Z=[0n,1n],O=[1n,1n];
export function verify(plan,active,offset){
 assert.equal(plan.status,2);const s=plan.source;
 assert.equal(cmp(s.start,active.start),0);assert.equal(cmp(s.end,O),0);
 for(const key of ['a','b','g'])assert.equal(s[key],active[key]);assert.equal(s.offset,BigInt(offset));
 function toPoint(b,x){
  if(b.x)return cmp(b.x,x);
  const value=base(s,x),o=rootOrderReference(Number(s.g),offset,b.level*65536,b.s,value[0],value[1]);return o===0?0:o*sign(s.a);
 }
 function boundaries(a,b){
  if(b.x)return toPoint(a,b.x);
  if(a.x){const o=toPoint(b,a.x);return o===0?0:-o;}
  let o=sign(BigInt(a.s-b.s));
  if(o===0&&a.s!==0){const [gP,gQ]=exponent(s.g),p=gP<0n?-gP:gP; // reciprocal magnitude exponent gQ/abs(gP)
   const left=integerPower([a.n,65536n],gP<0n?-gQ:gQ),right=integerPower([b.n,65536n],gP<0n?-gQ:gQ);o=cmp(left,right)*a.s;
   assert.ok(p>0n);
  }
  return o===0?0:o*sign(s.a);
 }
 function sample(a,b){let n=1n,d=2n;for(let i=0;i<512;i++){const x=[n,d];if(toPoint(a,x)>=0)n=2n*n+1n;else if(toPoint(b,x)<=0)n=2n*n-1n;else return x;d*=2n;}throw Error('Independent interior isolation budget exceeded');}
 const all=plan.pieces.flatMap(p=>[p.start,p.end]);
 for(const boundary of all){
  if(boundary.x){assert.ok(cmp(boundary.x,s.start)>=0&&cmp(boundary.x,O)<=0);if(cmp(boundary.x,s.start)!==0&&cmp(boundary.x,O)!==0)assert.equal(base(s,boundary.x)[0],0n);}
  else {assert.notEqual(s.a,0n);const ordinate=BigInt(boundary.level*65536)-s.offset;assert.equal(boundary.n,ordinate<0n?-ordinate:ordinate);assert.ok(boundary.n>0n&&boundary.q>0);assert.equal(BigInt(boundary.p)*s.g,65536n*BigInt(boundary.q));assert.ok(orderedRootSigns(Number(s.g),offset,boundary.level*65536).includes(boundary.s));}
 }
 assert.equal(boundaries(plan.pieces[0].start,{x:s.start}),0);assert.equal(boundaries(plan.pieces.at(-1).end,{x:O}),0);
 assert.ok(plan.pieces[0].flags&1);assert.ok(plan.pieces.at(-1).flags&2);
 function checkKind(piece,x){const z=levelOrder(s,x,0),o=levelOrder(s,x,65536);if(piece.kind===0)assert.ok(z<=0);else if(piece.kind===2)assert.ok(o>=0);else assert.ok(z>=0&&o<=0);}
 for(let i=0;i<plan.pieces.length;i++){
  const piece=plan.pieces[i],relation=boundaries(piece.start,piece.end);assert.ok(relation<=0);
  if(i){const previous=plan.pieces[i-1];assert.equal(boundaries(previous.end,piece.start),0);assert.equal(previous.flags&2,0);assert.equal(piece.flags&1,1);}
  if(relation===0){assert.equal(piece.flags,3);assert.equal(piece.direction,0);assert.ok(piece.start.x);checkKind(piece,piece.start.x);}
  else {const mid=sample(piece.start,piece.end),first=sample(piece.start,{x:mid}),last=sample({x:mid},piece.end);checkKind(piece,first);checkKind(piece,mid);checkKind(piece,last);const raw=valueOrder(s,first,last);assert.equal(piece.direction,piece.kind===1?(raw<0?1:raw>0?2:0):0);}
 }
 // Every actual clipping-level root and affine zero is a boundary, not only sampled points.
 if(s.a!==0n&&s.g!==0n){for(const level of [0,1])for(const rootSign of orderedRootSigns(Number(s.g),offset,level*65536)){
   const candidate={level,s:rootSign,n:(BigInt(level*65536)-s.offset)<0n?-(BigInt(level*65536)-s.offset):BigInt(level*65536)-s.offset};
   if(toPoint(candidate,s.start)>=0&&toPoint(candidate,O)<=0)assert.ok(all.some(b=>boundaries(candidate,b)===0),'missing level boundary');
  }
  const zero=F(-s.b,s.a);if(cmp(zero,s.start)>=0&&cmp(zero,O)<=0)assert.ok(all.some(b=>boundaries(b,{x:zero})===0),'missing base-zero boundary');
 }
 return plan.pieces.length;
}
