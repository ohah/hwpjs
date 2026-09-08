import assert from 'node:assert/strict';
import {fraction as F} from './icc-matrix-reference.mjs';
import {cmp} from './icc-power-reference.mjs';
const Z=[0n,1n],O=[1n,1n];
export function validateInterval(interval){
 for(const x of [interval.start,interval.end])if(x[1]===0n||x[0]<0n||x[0]>x[1])throw Error('InvalidIccCurveCoordinate');
 const order=cmp(interval.start,interval.end);if(order>0)throw Error('InvalidIccIntervalOrder');if(order===0&&interval.flags!==3)throw Error('EmptyIccInterval');
}
export function choiceReference(interval){
 validateInterval(interval);
 if(cmp(interval.end,O)===0&&(interval.flags&2)){if(!(interval.flags&1))throw Error('UnattainedIccPreimageMinimum');return interval.start;}
 if(!(interval.flags&2))throw Error('UnattainedIccPreimageMaximum');return interval.end;
}
// Enumerate critical points and open cells, evaluate each, then unite matching cells.
// This is independent of the product's half-interval intersection algorithm.
export function linearPreimageReference(line,y){
 validateInterval(line);if(y[1]===0n||y[0]>y[1])throw Error('InvalidIccCurveCoordinate');
 const a=BigInt(line.a),b=BigInt(line.b),points=[line.start,line.end];
 if(a!==0n)for(const target of [Z,O,y]){const root=F(65536n*target[0]-b*target[1],a*target[1]);if(cmp(root,line.start)>=0&&cmp(root,line.end)<=0)points.push(root);}
 points.sort(cmp);const unique=points.filter((x,i)=>i===0||cmp(x,points[i-1])!==0),matches=[];
 function equal(x){const value=F(a*x[0]+b*x[1],65536n*x[1]);return cmp(cmp(value,Z)<0?Z:cmp(value,O)>0?O:value,y)===0;}
 for(const x of unique)if((cmp(x,line.start)!==0||(line.flags&1))&&(cmp(x,line.end)!==0||(line.flags&2))&&equal(x))matches.push({start:x,end:x,flags:3});
 for(let i=1;i<unique.length;i++){const first=unique[i-1],last=unique[i],mid=F(first[0]*last[1]+last[0]*first[1],2n*first[1]*last[1]);if(equal(mid))matches.push({start:first,end:last,flags:0});}
 if(!matches.length)return null;matches.sort((a,b)=>cmp(a.start,b.start)||cmp(a.end,b.end));let result={...matches[0]};
 for(const next of matches.slice(1)){const relation=cmp(result.end,next.start);assert.ok(relation>0||(relation===0&&((result.flags&2)||(next.flags&1))),'disconnected affine preimage');if(cmp(result.start,next.start)===0)result.flags|=next.flags&1;const end=cmp(next.end,result.end);if(end>0){result.end=next.end;result.flags=(result.flags&1)|(next.flags&2);}else if(end===0)result.flags|=next.flags&2;}
 return result;
}
