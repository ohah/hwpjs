import {observeSeriesPoint} from './chart-series-point-evidence.mjs';
import {observeSeriesBranch} from './chart-series-branch-evidence.mjs';
import {observeSeriesLabelBody} from './chart-series-label-evidence.mjs';
// Shared selected Point/Label assembly, after a parsed Series prefix.
export function observeSeriesLabelSection(b,prefix,priorStrings){
 const {first,second}=prefix.array;
 if(first!==second||![0,1,4].includes(first))throw Error('UnsupportedSeriesPointObservationCount');
 const points=[];let offset=prefix.end,state={types:prefix.types,objects:prefix.objects,strings:priorStrings};
 for(let i=0;i<first;i++){const p=observeSeriesPoint(b,offset,state.types,state.objects,state.strings);points.push(p);offset=p.end;state=p;}
 const tail=observeSeriesBranch(b,offset,'tail',state.types,state.objects,state.strings),label=observeSeriesLabelBody(b,tail.end,tail.types,tail.objects,tail.strings);
 return {points,tail,label,end:label.end};
}
