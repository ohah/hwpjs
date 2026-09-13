import {seriesLabelContext} from './chart-series-label-context.mjs';
import {integer,textBodyWire} from './chart-text-body-oracle.mjs';
const stored=s=>[...s.values()].reduce((n,v)=>n+v.hex.length/2,0);
export function seriesLabelOracle(b){
 const c=seriesLabelContext(b),parts=[integer(c.points.length)];
 const label=(prefix,r)=>parts.push(integer(prefix.label.id),integer(r.end),textBodyWire(r.text,0,r.objects.size,stored(r.strings)));
 for(const p of c.points){parts.push(integer(p.prefix.point.id),integer(p.end),Buffer.from(p.raw20,'hex'));label(p.prefix,p.label);}
 label(c.tail,c.label);parts.push(integer(c.label.types.size));
 const input=(bytes=b,maxObjects=c.label.objects.size,count=c.points.length)=>Buffer.concat([integer(maxObjects),integer(count),bytes]);
 return {c,input,wire:Buffer.concat(parts),start:c.series.end,end:c.end};
}
