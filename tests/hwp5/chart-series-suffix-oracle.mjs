import {seriesLabelContext} from './chart-series-label-context.mjs';
import {observeSeriesSuffix} from './chart-series-suffix-evidence.mjs';
import {integer,textBodyWire} from './chart-text-body-oracle.mjs';
const stored=s=>[...s.values()].reduce((n,v)=>n+v.hex.length/2,0);
export function seriesSuffixOracle(b){
 const prior=seriesLabelContext(b),r=observeSeriesSuffix(b,prior.end,prior.label.types,prior.label.objects,prior.label.strings),parts=[integer(r.blockId),textBodyWire(r.body.text,0,r.body.objects.size,stored(r.body.strings)),integer(r.rawWord)];
 for(const state of r.formats){const f=state.format,s=f.code,raw=Buffer.from(s?.hex??'','hex');parts.push(...[f.headerWord,f.rawWord,Number(s!==null),s?.id??0xffffffff,raw.length,s?.trailer??0,Number(s?.introduced??false),f.end,state.objects.size,stored(state.strings)].map(n=>integer(n)),raw);}
 parts.push(integer(r.types.size));
 const input=(bytes=b,maxObjects=r.objects.size)=>Buffer.concat([integer(maxObjects),integer(prior.points.length),bytes]);
 return {prior,r,input,wire:Buffer.concat(parts),start:prior.end,end:r.end};
}
