import {seriesPrefixOracle} from './chart-series-prefix-oracle.mjs';
import {observeSeriesPoint} from './chart-series-point-evidence.mjs';
import {observeSeriesBranch} from './chart-series-branch-evidence.mjs';
import {observeSeriesLabelBody} from './chart-series-label-evidence.mjs';
// Selected first-Series assembly for corpus evidence. Do not use as general
// product routing until remaining array/Series ownership is established.
export function seriesLabelContext(b){
 const series=seriesPrefixOracle(b),{first,second}=series.r.array;
 if(first!==second||![0,1,4].includes(first))throw Error('UnsupportedSeriesPointObservationCount');
 const points=[];let offset=series.end,state={types:series.r.types,objects:series.r.objects,strings:series.strings};
 for(let i=0;i<first;i++){const p=observeSeriesPoint(b,offset,state.types,state.objects,state.strings);points.push(p);offset=p.end;state=p;}
 const tail=observeSeriesBranch(b,offset,'tail',state.types,state.objects,state.strings),label=observeSeriesLabelBody(b,tail.end,tail.types,tail.objects,tail.strings);
 return {series,points,tail,label,end:label.end};
}
