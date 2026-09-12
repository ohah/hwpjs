import {nullableTitleOracle} from './chart-nullable-title-oracle.mjs';
import {observeLineItem} from './chart-line-item-evidence.mjs';
import {integer} from './chart-text-body-oracle.mjs';
const ints=ns=>Buffer.concat(ns.map(n=>integer(n)));
export function lineItemsOracle(b,count=2){
 const axis=nullableTitleOracle(b),word=b.readUInt16LE(axis.end),rows=[];let offset=axis.end+2,types=axis.r.types,objects=axis.seen;
 for(let i=0;i<count;i++){const r=observeLineItem(b,offset,types,objects);rows.push(r);offset=r.end;types=r.types;objects=r.objects;}
 const wire=Buffer.concat([ints([word,count,offset,types.size,objects.size]),...rows.map(r=>Buffer.concat([ints([r.objectId,r.end]),Buffer.from(r.raw52,'hex')]))]);
 const input=(bytes=b,maxObjects=objects.size,n=count)=>Buffer.concat([ints([maxObjects,n]),bytes]);
 return {wire,input,rows,axis,start:axis.end,end:offset,objects:objects.size};
}
