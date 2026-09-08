import assert from 'node:assert/strict';
import {fraction as F} from './icc-matrix-reference.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {paraInput} from './icc-analytic.mjs';
const Z=[0n,1n],O=[1n,1n];
const cmp=(a,b)=>{const v=a[0]*b[1]-b[0]*a[1];return v<0n?-1:v>0n?1:0;};
const mix=(a,b,u=1n,v=1n)=>F(u*a[0]*b[1]+v*b[0]*a[1],(u+v)*a[1]*b[1]);
const affine=(a,b,x)=>F(BigInt(a)*x[0]+BigInt(b)*x[1],x[1]);
const direction=(a,b)=>cmp(a,b)<0?1:cmp(a,b)>0?2:0;
const root=(a,b,y)=>a===0?[]:[F(BigInt(y)-BigInt(b),BigInt(a))];
function cells(start,end,closed,cuts){
 cuts=cuts.filter(x=>cmp(x,start)>=0&&cmp(x,end)<=0);
 const endCut=cuts.some(x=>cmp(x,end)===0);
 const sorted=[start,end,...cuts].sort(cmp),points=sorted.filter((p,i)=>i===0||cmp(p,sorted[i-1])!==0),out=[];
 for(let i=0;i<points.length-1;i++)out.push({start:points[i],end:points[i+1],flags:i===points.length-2&&closed&&!endCut?3:1});
 if(closed&&(endCut||points.length===1))out.push({start:end,end,flags:3});
 return out;
}
function powerValue(base,g){
 const exponent=BigInt(Math.abs(g/65536)),n=base[0]**exponent,d=base[1]**exponent;
 return g<0?F(d,n):F(n,d);
}
function expected(kind,raw){
 const p=domain(kind,raw),linear=[],power=[];
 if(!p||p.start[0]!==0n){
  const a=kind>=3?raw[3]:0,b=kind===2?raw[3]:kind===4?raw[6]:0;
  const clip=x=>{const y=affine(a,b,x);return cmp(y,Z)<=0?Z:cmp(y,[65536n,1n])>=0?[65536n,1n]:y;};
  for(const cell of cells(Z,p?.start??O,!p,[...root(a,b,0),...root(a,b,65536)])){
   const y=affine(a,b,mix(cell.start,cell.end));
   linear.push({...cell,kind:cmp(y,Z)<=0?0:cmp(y,[65536n,1n])>=0?2:1,direction:direction(clip(mix(cell.start,cell.end,2n,1n)),clip(mix(cell.start,cell.end,1n,2n))),coefficients:[a,b,0,0]});
  }
 }
 if(p){
  const a=Number(p.a),b=Number(p.b),g=Number(p.g),offset=kind===2?raw[3]:kind===4?raw[5]:0;
  for(const cell of cells(p.start,O,true,root(a,b,0))){
   let dir=0;
   if(cmp(cell.start,cell.end)!==0){
    const q1=affine(a,b,mix(cell.start,cell.end,2n,1n)),q2=affine(a,b,mix(cell.start,cell.end,1n,2n));
    if(g%65536!==0)dir=g>0?direction(q1,q2):direction(q2,q1);
    else dir=direction(powerValue(F(q1[0],q1[1]*65536n),g),powerValue(F(q2[0],q2[1]*65536n),g));
   }
   power.push({...cell,kind:3,direction:dir,coefficients:[a,b,g,offset]});
  }
 }
 return {linear,power};
}
export function partitionEdges(call){
 let comparisons=0,rejected=0;
 function check(kind,raw){
  const b=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8);let e;
  try{e=expected(kind,raw);}catch(error){assert.throws(()=>call(181,b,b.length),new RegExp(error.message));rejected++;return;}
  const out=call(181,b,b.length),all=[...e.linear,...e.power];
  assert.equal(out.length,8+64*all.length);assert.equal(out.readUInt32LE(),e.linear.length);assert.equal(out.readUInt32LE(4),e.power.length);
  all.forEach((p,i)=>{const o=8+64*i;assert.equal(out.readUInt32LE(o),1);
   for(const [at,x] of [[4,p.start],[20,p.end]]){const n=out.readBigUInt64LE(o+at),d=out.readBigUInt64LE(o+at+8);assert.ok(d>0n&&n<=d);assert.equal(n*x[1],d*x[0]);}
   assert.equal(out.readUInt32LE(o+36),p.flags);assert.equal(out.readUInt32LE(o+40),p.kind);assert.equal(out.readUInt32LE(o+44),p.direction);
   p.coefficients.forEach((c,j)=>assert.equal(out.readInt32LE(o+48+j*4),c));
  });comparisons++;
 }
 for(let kind=0;kind<5;kind++)for(const g of [-131072,-65536,-32768,0,32768,65536,131072,196608])for(const a of [-2147483648,-65536,0,65536,2147483647])for(const b of [-2147483648,-65536,0,65536,2147483647])for(const d of [0,32768,65536,65537])for(const c of [-2147483648,-131072,0,131072,2147483647])check(kind,[g,a,b,c,d,65536,-32768]);
 const good=paraInput(0,[65536],0).subarray(8);
 for(let n=0;n<good.length;n++){assert.throws(()=>call(181,good.subarray(0,n),good.length),/InvalidIcc/);rejected++;}
 assert.throws(()=>call(181,good,good.length-1),/LimitExceeded/);rejected++;
 check(4,[131072,131072,-65536,131072,0,65536,0]);
 return {comparisons,rejected};
}
