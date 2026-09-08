import {fraction as F} from './icc-matrix-reference.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {jumpReference} from './icc-parametric-jump.mjs';
import {cmp,levelOrder,valueOrder} from './icc-power-reference.mjs';
const Z=[0n,1n],O=[1n,1n];
const clipped=value=>cmp(value,Z)<=0?Z:cmp(value,O)>=0?O:value;
// Independent algorithm: raw monotone intervals need only their endpoint values.
// No product clipping pieces, symbolic clipping roots or direction flags are read.
export function trendReference(kind,raw){
 const p=domain(kind,raw);let increasing=false,decreasing=false;
 function add(order){if(order>0)increasing=true;if(order<0)decreasing=true;}
 if(!p||p.start[0]!==0n){
  const slope=BigInt(kind>=3?raw[3]:0),offset=BigInt(kind===2?raw[3]:kind===4?raw[6]:0);
  const value=x=>clipped(F(slope*x[0]+offset*x[1],65536n*x[1]));
  add(cmp(value(p?.start??O),value(Z)));
 }
 if(p){
  const source={...p,offset:BigInt(kind===2?raw[3]:kind===4?raw[5]:0)},points=[p.start,O];
  if(p.a!==0n){const zero=F(-p.b,p.a);if(cmp(zero,p.start)>0&&cmp(zero,O)<0)points.push(zero);}
  points.sort(cmp);
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];if(cmp(a,b)===0)continue;
   const rawOrder=valueOrder(source,a,b);
   if(rawOrder<0&&levelOrder(source,a,65536)<0&&levelOrder(source,b,0)>0)add(1);
   if(rawOrder>0&&levelOrder(source,b,65536)<0&&levelOrder(source,a,0)>0)add(-1);
  }
 }
 const jump=jumpReference(kind,raw);if(jump)add(jump.order);
 return increasing&&decreasing?3:increasing?1:decreasing?2:0;
}
