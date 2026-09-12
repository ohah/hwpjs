import {postLineOracle} from './chart-post-line-oracle.mjs';
import {observeSeriesPrefix} from './chart-series-prefix-evidence.mjs';
import {integer} from './chart-text-body-oracle.mjs';
export function seriesPrefixOracle(b){
 const prior=postLineOracle(b),r=observeSeriesPrefix(b,prior.end,prior.r.types,prior.r.objects);
 const wire=Buffer.concat([...[r.objectId,r.end,r.array.id,r.array.first,r.array.second,r.end,r.types.size,r.objects.size].map(n=>integer(n)),Buffer.from(r.raw66,'hex')]);
 const input=(bytes=b,maxObjects=r.objects.size)=>Buffer.concat([integer(maxObjects),bytes]);
 return {wire,input,r,start:prior.end,end:r.end,objects:r.objects.size,priorObjects:prior.r.objects,strings:prior.strings};
}
