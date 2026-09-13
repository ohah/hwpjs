import {seriesSuffixOracle} from './chart-series-suffix-oracle.mjs';import {observeSeriesPicture} from './chart-series-picture-evidence.mjs';import {integer} from './chart-text-body-oracle.mjs';
export function seriesPictureOracle(b){
 const prior=seriesSuffixOracle(b),r=observeSeriesPicture(b,prior.end,prior.r.types,prior.r.objects);
 const wire=Buffer.concat([...[r.picture.id,r.pictureEnd,r.pictureEnd,r.end,r.types.size,r.objects.size].map(n=>integer(n)),Buffer.from(r.raw40,'hex'),Buffer.from(r.picture.raw4,'hex')]);
 const input=(bytes=b,maxObjects=r.objects.size)=>prior.input(bytes,maxObjects);
 return {prior,r,input,wire,start:prior.end,end:r.end};
}
