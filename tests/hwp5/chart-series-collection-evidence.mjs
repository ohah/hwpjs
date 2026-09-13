import {observeSeries} from './chart-series-evidence.mjs';
import {observeChartTitleHeader} from './chart-title-header-evidence.mjs';
// Explicit caller-selected count. The bound is a research work limit, not a
// product Array policy. Do not scan/resynchronize after a failed Series.
export function observeSeriesCollection(bytes,offset,priorTypes,priorObjects,priorStrings,count){
 if(!Number.isSafeInteger(count)||count<0||count>16)throw new RangeError('InvalidSeriesCollectionObservationCount');
 const b=Buffer.from(bytes),series=[];let p=offset,state={types:new Map(priorTypes),objects:new Set(priorObjects),strings:new Map(priorStrings)};
 for(let i=0;i<count;i++){const s=observeSeries(b,p,state.types,state.objects,state.strings);series.push(s);p=s.end;state=s;}
 const title=observeChartTitleHeader(b,p,state.types,state.objects);
 return {start:offset,series,title,end:title.end,types:title.types,objects:title.objects,strings:state.strings};
}
