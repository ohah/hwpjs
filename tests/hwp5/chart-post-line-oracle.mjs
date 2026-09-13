import {lineItemsOracle} from './chart-line-items-oracle.mjs';
import {observePostLine} from './chart-post-line-evidence.mjs';
import {integer} from './chart-text-body-oracle.mjs';
export function postLineOracle(b){
 const prior=lineItemsOracle(b),last=prior.rows.at(-1),r=observePostLine(b,prior.end,last.types,last.objects);
 const wire=postLineWire(r,r.types.size,r.objects.size);
 const input=(bytes=b,maxObjects=r.objects.size)=>Buffer.concat([integer(maxObjects),bytes]);
 return {wire,input,r,start:prior.end,end:r.end,objects:r.objects.size,priorObjects:last.objects,strings:prior.axis.r.strings};
}
export function postLineWire(r,typeCount,objectCount){
 return Buffer.concat([...[r.end,typeCount,objectCount,r.array.id,r.array.first,r.array.second,r.end].map(n=>integer(n)),Buffer.from(r.raw194,'hex')]);
}
