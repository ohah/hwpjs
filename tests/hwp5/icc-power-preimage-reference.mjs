import assert from 'node:assert/strict';
import {fraction as F} from './icc-matrix-reference.mjs';
import {admissible} from './icc-power-level.mjs';
import {expected as rootOrder} from './icc-normalized-root-compare.mjs';
import {base,cmp,sign,rationalPowerOrder} from './icc-power-reference.mjs';
const O=[1n,1n];
// Independent critical-cell decomposition, not the product's flat-plus-point collection.
export function verify(set,active,offset,n,d){
  assert.equal(set.status,2);const source=set.source;
  assert.equal(cmp(source.start,active.start),0);assert.equal(cmp(source.end,O),0);
  for(const key of ['a','b','g'])assert.equal(source[key],active[key]);assert.equal(source.offset,BigInt(offset));
  const target=F(n,d),difference=F(65536n*n-BigInt(offset)*d,65536n*d);
  function toX(r,x){if(r.x)return cmp(r.x,x);const z=base(source,x);return rootOrder(r.s,r.n,r.d??65536n,r.p,r.q,z[0],z[1])*sign(source.a);}
  function order(a,b){
    if(b.x)return toX(a,b.x);if(a.x)return -toX(b,a.x);
    let result=sign(BigInt(a.s-b.s));
    if(result===0&&a.s!==0){result=cmp([a.n,a.d??65536n],[b.n,b.d??65536n]);if(a.p<0)result=-result;result*=a.s;}
    return result*sign(source.a);
  }
  function roots(value){
    if(source.a===0n||source.g===0n)return [];
    const N=65536n*value[0]-source.offset*value[1],D=65536n*value[1];
    return admissible(Number(source.g),N).map(s=>({s,n:N<0n?-N:N,d:D,p:source.g<0n?-65536:65536,q:Number(source.g<0n?-source.g:source.g),value}));
  }
  const start={x:source.start},end={x:source.end};
  const inDomain=r=>order(r,start)>=0&&order(r,end)<=0;
  function validateRoot(r,value){
    assert.notEqual(source.a,0n);assert.notEqual(source.g,0n);
    const N=65536n*value[0]-source.offset*value[1],D=65536n*value[1];
    assert.ok(admissible(Number(source.g),N).includes(r.s));
    if(r.s===0){assert.equal(N,0n);assert.equal(r.n,0n);assert.equal(r.p,0);assert.equal(r.q,0);}
    else{assert.equal(r.n*D,(N<0n?-N:N)*(r.d??65536n));assert.equal(r.p,source.g<0n?-65536:65536);assert.equal(BigInt(r.q),source.g<0n?-source.g:source.g);}
    assert.ok(inDomain(r));
  }
  function validateBoundary(r){
    if(r.x){assert.ok(inDomain(r));if(cmp(r.x,source.start)!==0&&cmp(r.x,O)!==0)assert.equal(base(source,r.x)[0],0n);}
    else validateRoot(r,[BigInt(r.level),1n]);
  }
  for(const interval of set.intervals){validateBoundary(interval.start);validateBoundary(interval.end);const o=order(interval.start,interval.end);assert.ok(o<=0);if(o===0)assert.equal(interval.flags,3);}
  for(const root of set.roots){validateRoot(root,target);const lo=order(root,start),hi=order(root,end);assert.equal(root.location,lo===0&&hi===0?4:lo===0?1:hi===0?3:2);}
  const critical=[start,end,...roots([0n,1n]),...roots(O),...roots(target)];
  if(source.a!==0n){const x=F(-source.b,source.a);if(cmp(x,source.start)>=0&&cmp(x,O)<=0)critical.push({x});}
  // Include output boundaries too: a spurious component cannot evade soundness checks.
  critical.push(...set.intervals.flatMap(v=>[v.start,v.end]),...set.roots.map(r=>({...r,value:target})));
  const sorted=critical.filter(inDomain).sort(order),unique=[];
  for(const r of sorted)if(!unique.length||order(unique.at(-1),r)!==0)unique.push(r);
  function expected(r){
    if(r.x){const relation=rationalPowerOrder(base(source,r.x),source.g,difference);return n===0n?relation<=0:n===d?relation>=0:relation===0;}
    const value=r.value??[BigInt(r.level),1n];const clipped=value[0]<=0n?[0n,1n]:cmp(value,O)>=0?O:value;return cmp(clipped,target)===0;
  }
  function included(r){return set.roots.some(v=>order(v,r)===0)||set.intervals.some(v=>{const lo=order(r,v.start),hi=order(r,v.end);return (lo>0||(lo===0&&(v.flags&1)))&&(hi<0||(hi===0&&(v.flags&2)));});}
  let membershipChecks=0;
  function check(r){assert.equal(!!included(r),expected(r));membershipChecks++;}
  for(const r of unique)check(r);
  for(let i=1;i<unique.length;i++){
    let num=1n,den=2n,found=false;
    for(let step=0;step<512;step++){
      const r={x:[num,den]};
      if(order(unique[i-1],r)>=0)num=2n*num+1n;
      else if(order(unique[i],r)<=0)num=2n*num-1n;
      else{check(r);found=true;break;}
      den*=2n;
    }
    assert.ok(found,'Independent critical-cell isolation budget exceeded');
  }
  return membershipChecks;
}
