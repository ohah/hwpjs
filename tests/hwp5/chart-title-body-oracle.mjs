import {seriesCollectionOracle} from './chart-series-collection-oracle.mjs';
import {observeChartTitleBody} from './chart-title-body-evidence.mjs';
import {integer,textBodyWire} from './chart-text-body-oracle.mjs';
export function titleBodyOracle(b){
 const prior=seriesCollectionOracle(b),c=prior.r,r=observeChartTitleBody(b,c.end,c.types,c.objects,c.strings),stored=[...r.strings.values()].reduce((n,s)=>n+s.hex.length/2,0),s=r.section;
 const parts=[...[c.title.id,r.end,r.types.size,r.objects.size,stored,r.blockId].map(n=>integer(n)),textBodyWire(r.body.text,0,r.objects.size,stored),Buffer.from(s.section.raw26,'hex'),...[s.end,...s.section.ids,s.references.at(-1)].map(n=>integer(n)),integer(s.section.suffix,2),...['raw50','raw34','raw4'].map(key=>Buffer.from(s.section[key],'hex'))];
 const input=(bytes=b,maxObjects=r.objects.size)=>prior.input(bytes,maxObjects);
 return {prior,r,input,wire:Buffer.concat(parts),start:c.end,end:r.end};
}
